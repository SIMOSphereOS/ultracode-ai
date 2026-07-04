/**
 * LSP transport: the wire layer beneath {@link LspClient}.
 *
 * The Language Server Protocol speaks JSON-RPC 2.0, but — unlike the MCP stdio
 * transport (newline-delimited JSON) — it frames every message with a
 * `Content-Length` header:
 *
 * ```
 * Content-Length: 123\r\n
 * \r\n
 * {"jsonrpc":"2.0", ... 123 bytes of UTF-8 body ... }
 * ```
 *
 * {@link LspStdioTransport} launches the language server as a child process
 * (`node:child_process` spawn) and exchanges these framed messages over
 * stdin/stdout. It owns:
 *
 * - **Framing** — encoding the `Content-Length` header on send and reassembling
 *   partial/multiple frames on receive (byte-accurate: the header counts UTF-8
 *   bytes, so the read buffer is kept as a {@link Buffer}, never a decoded
 *   string).
 * - **Correlation** — request/response matching by JSON-RPC `id`, so concurrent
 *   in-flight requests are fine.
 * - **Notifications** — the server pushes server→client notifications (most
 *   importantly `textDocument/publishDiagnostics`); these are routed to the
 *   handler registered via {@link LspStdioTransport.onNotification}.
 *
 * It is defensive: every failure surfaces as a rejected promise (never an
 * unhandled throw that crashes the host), pending requests are rejected on
 * process exit/close, and each request honours a timeout plus the caller's
 * `AbortSignal`.
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";
import { spawn } from "node:child_process";
import type { Logger } from "ultracode-shared";
import { NoopLogger, UltraCodeError, type UltraCodeErrorOptions } from "ultracode-shared";

/** Default per-request timeout (ms) when the caller does not specify one. */
export const DEFAULT_LSP_TIMEOUT_MS = 30_000;

/** The only JSON-RPC version the protocol allows. */
export const JSONRPC_VERSION = "2.0" as const;

/** The byte sequence separating the LSP header block from the body. */
const HEADER_SEPARATOR = "\r\n\r\n";

/** Safety cap: drop the read buffer if a header block never terminates. */
const MAX_HEADER_BYTES = 64 * 1024;

/** Safety cap: reject an absurd `Content-Length` rather than allocate for it. */
const MAX_CONTENT_BYTES = 256 * 1024 * 1024;

/** A JSON-RPC request/response correlation id. */
export type JsonRpcId = number | string;

/** A JSON-RPC request (expects a matching response). */
export interface JsonRpcRequestMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

/** A JSON-RPC notification (fire-and-forget, never answered). */
export interface JsonRpcNotificationMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
}

/** The `error` member of a JSON-RPC error response. */
export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

/** A JSON-RPC response (`result` XOR `error`). */
export interface JsonRpcResponseMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

/**
 * An error raised anywhere in the LSP layer: transport failures, spawn errors,
 * timeouts, malformed frames and server-reported JSON-RPC errors. Extends
 * {@link UltraCodeError} so it carries a stable code and serialises cleanly.
 */
export class LspError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("LSP_ERROR", message, options);
  }
}

/** Narrow an unknown value to a plain record, else `undefined`. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Narrow an unknown value to a string, else `undefined`. */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Narrow an unknown value to an array, else `undefined`. */
export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? (value as unknown[]) : undefined;
}

/** Per-request options for the transport. */
export interface LspRequestOptions {
  /** Per-request timeout in milliseconds. Defaults to {@link DEFAULT_LSP_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Caller cancellation signal; aborts the in-flight request. */
  signal?: AbortSignal;
}

/** Handler invoked for every server→client notification. */
export type LspNotificationHandler = (method: string, params: unknown) => void;

/**
 * The transport contract {@link LspClient} builds on. A transport owns the
 * `Content-Length` framing and JSON-RPC `id` correlation; the client owns the
 * LSP semantics (handshake, `textDocument/didOpen`, diagnostics collection).
 */
export interface LspTransport {
  /** Establish the connection (spawn the process). */
  start(): Promise<void>;
  /** Send a request and resolve with its correlated response. */
  request(
    message: JsonRpcRequestMessage,
    options?: LspRequestOptions,
  ): Promise<JsonRpcResponseMessage>;
  /** Send a fire-and-forget notification. */
  notify(message: JsonRpcNotificationMessage): Promise<void>;
  /** Register the handler for server→client notifications (replaces any prior). */
  onNotification(handler: LspNotificationHandler): void;
  /** Tear down the connection and reject any pending requests. */
  close(): Promise<void>;
}

/** A pending request awaiting its correlated response. */
interface PendingRequest {
  resolve: (response: JsonRpcResponseMessage) => void;
  reject: (error: Error) => void;
}

/** Construction options for {@link LspStdioTransport}. */
export interface LspStdioTransportOptions {
  /** Executable to launch (the language server). */
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

/** LSP transport over a spawned child process using `Content-Length` framing. */
export class LspStdioTransport implements LspTransport {
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
  private notificationHandler: LspNotificationHandler | undefined;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readBuffer: Buffer = Buffer.alloc(0);

  constructor(options: LspStdioTransportOptions) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.env = options.env ?? process.env;
    this.cwd = options.cwd;
    this.logger = options.logger ?? new NoopLogger();
    this.spawnFn =
      options.spawnFn ?? ((command, args, opts) => spawn(command, args as string[], opts));
  }

  onNotification(handler: LspNotificationHandler): void {
    this.notificationHandler = handler;
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
        reject(new LspError(`Failed to spawn LSP server "${this.command}"`, { cause: err }));
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
          reject(new LspError(`Failed to spawn LSP server "${this.command}"`, { cause: err }));
        }
        this.failAllPending(new LspError(`LSP server "${this.command}" errored`, { cause: err }));
      });
      child.once("exit", (code, signal) => {
        this.closed = true;
        this.failAllPending(
          new LspError(`LSP server "${this.command}" exited`, { details: { code, signal } }),
        );
      });
      child.stdout?.on("data", (chunk: Buffer) => this.onStdoutData(chunk));
      child.stderr?.on("data", (chunk: Buffer) => {
        this.logger.debug("lsp server stderr", { text: chunk.toString("utf8").slice(0, 500) });
      });
      // A broken pipe (server gone) must not throw an uncatchable stream error.
      child.stdin?.on("error", () => {});
    });
    return this.startPromise;
  }

  request(
    message: JsonRpcRequestMessage,
    options: LspRequestOptions = {},
  ): Promise<JsonRpcResponseMessage> {
    if (this.closed) {
      return Promise.reject(new LspError("LSP transport is closed"));
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_LSP_TIMEOUT_MS;
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
          new LspError(`LSP request "${message.method}" timed out after ${timeoutMs}ms`, {
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
          pending.reject(new LspError("Failed to write to LSP server stdin", { cause: err }));
        }
      }
    });
  }

  async notify(message: JsonRpcNotificationMessage): Promise<void> {
    if (this.closed) throw new LspError("LSP transport is closed");
    this.write(message);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAllPending(new LspError("LSP transport closed"));
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

  /** Serialise and write one message as a single `Content-Length`-framed unit. */
  private write(message: JsonRpcRequestMessage | JsonRpcNotificationMessage): void {
    const stdin = this.child?.stdin;
    if (stdin === undefined || stdin === null || stdin.writable !== true) {
      throw new LspError("LSP server stdin is not writable");
    }
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(`Content-Length: ${body.byteLength}${HEADER_SEPARATOR}`, "ascii");
    stdin.write(Buffer.concat([header, body]));
  }

  /** Accumulate stdout bytes and dispatch every complete frame. */
  private onStdoutData(chunk: Buffer): void {
    this.readBuffer =
      this.readBuffer.length === 0 ? chunk : Buffer.concat([this.readBuffer, chunk]);
    this.drainFrames();
  }

  /** Pull as many complete `Content-Length` frames out of the buffer as possible. */
  private drainFrames(): void {
    for (;;) {
      const headerEnd = this.readBuffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd === -1) {
        // No terminated header yet; guard against unbounded growth from junk.
        if (this.readBuffer.length > MAX_HEADER_BYTES) {
          this.logger.warn("LSP header exceeded max size; dropping read buffer");
          this.readBuffer = Buffer.alloc(0);
        }
        return;
      }
      const headerText = this.readBuffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(headerText);
      const bodyStart = headerEnd + HEADER_SEPARATOR.length;

      if (contentLength === undefined) {
        this.logger.warn("LSP frame missing a valid Content-Length; skipping header block");
        this.readBuffer = this.readBuffer.subarray(bodyStart);
        continue;
      }
      if (contentLength > MAX_CONTENT_BYTES) {
        this.logger.warn("LSP frame Content-Length exceeds max; dropping read buffer", {
          contentLength,
        });
        this.readBuffer = Buffer.alloc(0);
        return;
      }
      const bodyEnd = bodyStart + contentLength;
      if (this.readBuffer.length < bodyEnd) return; // wait for the rest of the body

      const body = this.readBuffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.readBuffer = this.readBuffer.subarray(bodyEnd);
      this.handleBody(body);
    }
  }

  /** Parse one frame body and route it (response / notification / server request). */
  private handleBody(body: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      this.logger.warn("Skipping malformed JSON frame from LSP server", {
        body: body.length > 200 ? `${body.slice(0, 200)}…` : body,
      });
      return;
    }
    const record = asRecord(parsed);
    if (record === undefined) return;

    const hasId =
      "id" in record && (typeof record.id === "number" || typeof record.id === "string");
    const hasMethod = typeof record.method === "string";

    if (hasId && !hasMethod) {
      const id = record.id as JsonRpcId;
      const pending = this.pending.get(id);
      if (pending !== undefined) {
        pending.resolve(record as unknown as JsonRpcResponseMessage);
      } else {
        this.logger.debug("Received LSP response with no matching request", { id });
      }
      return;
    }

    if (hasMethod && !hasId) {
      if (this.notificationHandler !== undefined) {
        try {
          this.notificationHandler(record.method as string, record.params);
        } catch (err) {
          this.logger.warn("LSP notification handler threw", {
            method: record.method,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }

    // Server-initiated requests (id + method) are not supported by this minimal
    // client; ignore them (the diagnostics push path never needs a reply).
    if (hasMethod) {
      this.logger.debug("Ignoring server-initiated LSP request", { method: record.method });
    }
  }

  /** Reject every in-flight request, e.g. on process exit or close. */
  private failAllPending(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) request.reject(error);
  }

  /** Build the error used when a request is aborted. */
  private abortError(reason: unknown): LspError {
    const message =
      reason instanceof Error && reason.message !== ""
        ? `LSP request aborted: ${reason.message}`
        : "LSP request aborted";
    return new LspError(message, { cause: reason, details: { aborted: true } });
  }
}

/** Read the `Content-Length` value (bytes) from an LSP header block. */
export function parseContentLength(header: string): number | undefined {
  for (const line of header.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim().toLowerCase() !== "content-length") continue;
    const n = Number.parseInt(line.slice(idx + 1).trim(), 10);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return undefined;
}

/** Encode a JSON-RPC message as a single `Content-Length`-framed {@link Buffer}. */
export function encodeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.byteLength}${HEADER_SEPARATOR}`, "ascii");
  return Buffer.concat([header, body]);
}
