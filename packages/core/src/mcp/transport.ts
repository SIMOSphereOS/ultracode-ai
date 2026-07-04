/**
 * MCP transports: the wire layer beneath {@link McpClient}.
 *
 * Two transports implement the same {@link McpTransport} contract:
 *
 * - {@link StdioTransport} — launches the server as a child process
 *   (`node:child_process` spawn) and exchanges **newline-delimited JSON**
 *   messages over stdin/stdout, exactly as the MCP stdio transport mandates
 *   (one JSON message per line, no embedded newlines). Request/response
 *   correlation is by JSON-RPC `id`, so concurrent in-flight requests are fine.
 * - {@link HttpTransport} — POSTs a JSON-RPC message to the server URL and
 *   reads the reply, which the server may return either as a single JSON
 *   document or as a `text/event-stream` (SSE) body carrying the response
 *   message. An optional API key is sent as a bearer token.
 *
 * Both transports are defensive: every failure surfaces as a rejected promise
 * (never an unhandled throw that crashes the host), pending requests are
 * rejected on shutdown/exit, and each request honours a timeout plus the
 * caller's `AbortSignal`.
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { Logger } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import { parseSSEEvents } from "../providers/sse.js";
import {
  asRecord,
  isJsonRpcResponse,
  type JsonRpcId,
  type JsonRpcNotificationMessage,
  type JsonRpcRequestMessage,
  type JsonRpcResponseMessage,
  McpError,
} from "./jsonRpc.js";

/** Default per-request timeout (ms) when the caller does not specify one. */
export const DEFAULT_MCP_TIMEOUT_MS = 30_000;

/**
 * Read a signal's aborted state through a function so TypeScript does not carry
 * property narrowing from an earlier guard across an intervening `await` (the
 * value can flip to aborted while a request is in flight).
 */
function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

/** Per-request options shared by both transports. */
export interface McpRequestOptions {
  /** Per-request timeout in milliseconds. Defaults to {@link DEFAULT_MCP_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Caller cancellation signal; aborts the in-flight request. */
  signal?: AbortSignal;
}

/**
 * The transport contract the {@link McpClient} builds on. A transport owns the
 * framing/HTTP details and JSON-RPC `id` correlation; the client owns the MCP
 * semantics (handshake, `tools/list`, `tools/call`).
 */
export interface McpTransport {
  /** Establish the connection (spawn the process / no-op for HTTP). */
  start(): Promise<void>;
  /** Send a request and resolve with its correlated response. */
  request(
    message: JsonRpcRequestMessage,
    options?: McpRequestOptions,
  ): Promise<JsonRpcResponseMessage>;
  /** Send a fire-and-forget notification. */
  notify(message: JsonRpcNotificationMessage): Promise<void>;
  /** Tear down the connection and reject any pending requests. */
  close(): Promise<void>;
}

/** A pending stdio request awaiting its correlated response. */
interface PendingRequest {
  resolve: (response: JsonRpcResponseMessage) => void;
  reject: (error: Error) => void;
}

/** Construction options for {@link StdioTransport}. */
export interface StdioTransportOptions {
  /** Executable to launch. */
  command: string;
  /** Arguments passed to the executable. */
  args?: readonly string[];
  /** Environment for the child process. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Working directory for the child process. */
  cwd?: string;
  /** Structured logger. */
  logger?: Logger;
  /**
   * Child-process spawn primitive (test seam). Defaults to
   * `child_process.spawn`. Injected only by tests to drive a fake server.
   */
  spawnFn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
}

/** MCP transport over a spawned child process using newline-delimited JSON. */
export class StdioTransport implements McpTransport {
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly cwd: string | undefined;
  private readonly logger: Logger;
  private readonly spawnFn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;

  private child: ChildProcess | undefined;
  private closed = false;
  private startPromise: Promise<void> | undefined;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly decoder = new StringDecoder("utf8");
  private readBuffer = "";

  constructor(options: StdioTransportOptions) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.env = options.env ?? process.env;
    this.cwd = options.cwd;
    this.logger = options.logger ?? new NoopLogger();
    this.spawnFn =
      options.spawnFn ?? ((command, args, opts) => spawn(command, args as string[], opts));
  }

  start(): Promise<void> {
    if (this.startPromise !== undefined) return this.startPromise;
    this.startPromise = new Promise<void>((resolve, reject) => {
      const spawnOptions: SpawnOptions = {
        stdio: ["pipe", "pipe", "pipe"],
        env: this.env as NodeJS.ProcessEnv,
        windowsHide: true,
      };
      if (this.cwd !== undefined) spawnOptions.cwd = this.cwd;

      let child: ChildProcess;
      try {
        child = this.spawnFn(this.command, this.args, spawnOptions);
      } catch (err) {
        this.closed = true;
        reject(new McpError(`Failed to spawn MCP server "${this.command}"`, { cause: err }));
        return;
      }
      this.child = child;

      let started = false;
      child.once("spawn", () => {
        started = true;
        resolve();
      });
      child.once("error", (err: Error) => {
        this.closed = true;
        if (!started) {
          reject(new McpError(`Failed to spawn MCP server "${this.command}"`, { cause: err }));
        }
        this.failAllPending(new McpError(`MCP server "${this.command}" errored`, { cause: err }));
      });
      child.once("exit", (code, signal) => {
        this.closed = true;
        this.failAllPending(
          new McpError(`MCP server "${this.command}" exited`, {
            details: { code, signal },
          }),
        );
      });
      child.stdout?.on("data", (chunk: Buffer) => this.onStdoutData(chunk));
      child.stderr?.on("data", (chunk: Buffer) => {
        this.logger.debug("mcp server stderr", { text: chunk.toString("utf8").slice(0, 500) });
      });
      // A broken pipe (server gone) must not throw an uncatchable stream error.
      child.stdin?.on("error", () => {});
    });
    return this.startPromise;
  }

  request(
    message: JsonRpcRequestMessage,
    options: McpRequestOptions = {},
  ): Promise<JsonRpcResponseMessage> {
    if (this.closed) {
      return Promise.reject(new McpError("MCP transport is closed"));
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
    const signal = options.signal;
    return new Promise<JsonRpcResponseMessage>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(this.abortError(signal.reason));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        finish();
        reject(
          new McpError(`MCP request "${message.method}" timed out after ${timeoutMs}ms`, {
            details: { method: message.method, timeoutMs },
          }),
        );
      }, timeoutMs);
      if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as unknown as { unref: () => void }).unref();
      }
      const onAbort = (): void => {
        finish();
        reject(this.abortError(signal?.reason));
      };
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (signal !== undefined) signal.removeEventListener("abort", onAbort);
      };
      if (signal !== undefined) signal.addEventListener("abort", onAbort, { once: true });

      this.pending.set(message.id, {
        resolve: (response) => {
          finish();
          resolve(response);
        },
        reject: (error) => {
          finish();
          reject(error);
        },
      });

      try {
        this.write(message);
      } catch (err) {
        const pending = this.pending.get(message.id);
        if (pending !== undefined) {
          pending.reject(new McpError("Failed to write to MCP server stdin", { cause: err }));
        }
      }
    });
  }

  async notify(message: JsonRpcNotificationMessage): Promise<void> {
    if (this.closed) throw new McpError("MCP transport is closed");
    this.write(message);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAllPending(new McpError("MCP transport closed"));
    const child = this.child;
    if (child === undefined) return;
    try {
      child.stdin?.end();
    } catch {
      /* already gone */
    }
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }

  /** Serialise and write one message as a single newline-delimited JSON line. */
  private write(message: JsonRpcRequestMessage | JsonRpcNotificationMessage): void {
    const stdin = this.child?.stdin;
    if (stdin === undefined || stdin === null || stdin.writable !== true) {
      throw new McpError("MCP server stdin is not writable");
    }
    stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** Buffer stdout bytes and dispatch each complete JSON line. */
  private onStdoutData(chunk: Buffer): void {
    this.readBuffer += this.decoder.write(chunk);
    for (;;) {
      const newlineIndex = this.readBuffer.indexOf("\n");
      if (newlineIndex === -1) break;
      let line = this.readBuffer.slice(0, newlineIndex);
      this.readBuffer = this.readBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const trimmed = line.trim();
      if (trimmed !== "") this.handleLine(trimmed);
    }
  }

  /** Parse one line and route a response to its pending request. */
  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.logger.warn("Skipping malformed JSON line from MCP server", {
        line: line.length > 200 ? `${line.slice(0, 200)}…` : line,
      });
      return;
    }
    if (isJsonRpcResponse(parsed)) {
      const pending = this.pending.get(parsed.id);
      if (pending !== undefined) {
        pending.resolve(parsed);
      } else {
        this.logger.debug("Received MCP response with no matching request", { id: parsed.id });
      }
      return;
    }
    // Server-initiated requests/notifications are not supported by this client.
    const method = asRecord(parsed)?.method;
    if (typeof method === "string") {
      this.logger.debug("Ignoring server-initiated MCP message", { method });
    }
  }

  /** Reject every in-flight request, e.g. on process exit or close. */
  private failAllPending(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) request.reject(error);
  }

  /** Build the error used when a request is aborted. */
  private abortError(reason: unknown): McpError {
    const message =
      reason instanceof Error && reason.message !== ""
        ? `MCP request aborted: ${reason.message}`
        : "MCP request aborted";
    return new McpError(message, { cause: reason, details: { aborted: true } });
  }
}

/** Construction options for {@link HttpTransport}. */
export interface HttpTransportOptions {
  /** Server URL to POST JSON-RPC messages to. */
  url: string;
  /** Optional API key, sent as `Authorization: Bearer <key>`. */
  apiKey?: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Structured logger. */
  logger?: Logger;
  /** `fetch` implementation (test seam). Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** MCP transport over HTTP: one POST per JSON-RPC message. */
export class HttpTransport implements McpTransport {
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly extraHeaders: Record<string, string>;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpTransportOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.extraHeaders = options.headers ?? {};
    this.logger = options.logger ?? new NoopLogger();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  async request(
    message: JsonRpcRequestMessage,
    options: McpRequestOptions = {},
  ): Promise<JsonRpcResponseMessage> {
    const response = await this.post(message, options);
    return this.readResponse(response, message.id, options.signal);
  }

  async notify(message: JsonRpcNotificationMessage): Promise<void> {
    const response = await this.post(message, {});
    // Notifications expect no JSON-RPC reply; drain the body so the socket frees.
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  /** Build the request headers, including bearer auth when an API key is set. */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...this.extraHeaders,
    };
    if (this.apiKey !== undefined && this.apiKey !== "") {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /** POST a single message with timeout + abort handling. Resolves an ok Response. */
  private async post(
    message: JsonRpcRequestMessage | JsonRpcNotificationMessage,
    options: McpRequestOptions,
  ): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
    const caller = options.signal;
    if (signalAborted(caller)) throw this.abortError(caller?.reason);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
    const onAbort = (): void => controller.abort(caller?.reason);
    if (caller !== undefined) caller.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await this.safeText(response);
        throw new McpError(`MCP HTTP request failed with status ${response.status}`, {
          details: { status: response.status, url: this.url, body: body.slice(0, 2000) },
        });
      }
      return response;
    } catch (err) {
      if (signalAborted(caller)) throw this.abortError(caller?.reason);
      if (timedOut) {
        throw new McpError(`MCP HTTP request timed out after ${timeoutMs}ms`, {
          details: { url: this.url, timeoutMs },
        });
      }
      if (err instanceof McpError) throw err;
      throw new McpError(
        `MCP HTTP request error: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err, details: { url: this.url } },
      );
    } finally {
      clearTimeout(timer);
      if (caller !== undefined) caller.removeEventListener("abort", onAbort);
    }
  }

  /** Read the JSON-RPC response from either a JSON or an SSE (event-stream) body. */
  private async readResponse(
    response: Response,
    id: JsonRpcId,
    signal: AbortSignal | undefined,
  ): Promise<JsonRpcResponseMessage> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && response.body !== null) {
      for await (const event of parseSSEEvents(response.body, signal)) {
        const data = event.data.trim();
        if (data === "" || data === "[DONE]") continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          this.logger.warn("Skipping malformed JSON in MCP SSE stream");
          continue;
        }
        const match = this.matchResponse(parsed, id);
        if (match !== undefined) return match;
      }
      throw new McpError("MCP SSE stream ended without a response for the request", {
        details: { url: this.url, id },
      });
    }

    const text = await this.safeText(response);
    if (text.trim() === "") {
      throw new McpError("MCP server returned an empty response body", {
        details: { url: this.url, id },
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new McpError("MCP server returned malformed JSON", {
        cause: err,
        details: { url: this.url, body: text.slice(0, 2000) },
      });
    }
    const match = this.matchResponse(parsed, id);
    if (match === undefined) {
      throw new McpError("MCP response did not contain a matching JSON-RPC id", {
        details: { url: this.url, id },
      });
    }
    return match;
  }

  /** Find the response object (single or batched) whose id matches. */
  private matchResponse(value: unknown, id: JsonRpcId): JsonRpcResponseMessage | undefined {
    const candidates = Array.isArray(value) ? (value as unknown[]) : [value];
    for (const candidate of candidates) {
      if (isJsonRpcResponse(candidate) && candidate.id === id) return candidate;
    }
    return undefined;
  }

  /** Read a response body as text, never throwing. */
  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  /** Build the error used when a request is aborted. */
  private abortError(reason: unknown): McpError {
    const message =
      reason instanceof Error && reason.message !== ""
        ? `MCP request aborted: ${reason.message}`
        : "MCP request aborted";
    return new McpError(message, { cause: reason, details: { aborted: true } });
  }
}
