/**
 * {@link LspClient} — a minimal Language Server Protocol client.
 *
 * Drives the LSP conversation on top of an {@link LspTransport}, focused on one
 * job: open a document and collect the diagnostics the server pushes for it.
 *
 * 1. **Handshake** — `initialize` (processId, rootUri, capabilities, clientInfo)
 *    followed by the `initialized` notification.
 * 2. **Open** — `textDocument/didOpen` publishes a document's text so the server
 *    starts analysing it.
 * 3. **Diagnostics** — the server pushes `textDocument/publishDiagnostics`
 *    notifications; the client caches the latest set per URI and
 *    {@link LspClient.getDiagnostics} returns them, waiting a short window for
 *    the first push.
 *
 * The client owns JSON-RPC `id` generation and turns server-reported JSON-RPC
 * errors into {@link LspError}. {@link LspClient.getDiagnostics},
 * {@link LspClient.dispose} and {@link LspClient.exit} never throw; the
 * request-shaped methods (`initialize`, `shutdown`) surface failures as rejected
 * promises.
 */

import type { Logger } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import {
  asArray,
  asRecord,
  asString,
  JSONRPC_VERSION,
  type JsonRpcId,
  type JsonRpcRequestMessage,
  LspError,
  type LspRequestOptions,
  type LspTransport,
} from "./transport.js";

/** Default wait window (ms) for the first `publishDiagnostics` push. */
export const LSP_DEFAULT_DIAGNOSTICS_WAIT_MS = 2_000;

/** Bounded `shutdown` timeout (ms) used by {@link LspClient.dispose}. */
export const LSP_DISPOSE_SHUTDOWN_TIMEOUT_MS = 1_000;

/** Default LSP client capabilities: enough to receive push diagnostics. */
export const DEFAULT_LSP_CAPABILITIES: Record<string, unknown> = {
  textDocument: {
    synchronization: { dynamicRegistration: false, didSave: false },
    publishDiagnostics: { relatedInformation: true },
  },
};

/** A zero-based position in a text document. */
export interface LspPosition {
  line: number;
  character: number;
}

/** A range in a text document. */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/** One diagnostic (error/warning/info/hint) reported by the server. */
export interface LspDiagnostic {
  /** The range the diagnostic applies to. */
  range: LspRange;
  /** 1 = Error, 2 = Warning, 3 = Information, 4 = Hint (when provided). */
  severity?: number;
  /** Machine-readable code, when provided. */
  code?: string | number;
  /** Diagnostic source (e.g. `"tsc"`, `"eslint"`), when provided. */
  source?: string;
  /** Human-readable message. */
  message: string;
}

/** Identifies this client to the server during `initialize`. */
export interface LspClientInfo {
  name: string;
  version: string;
}

/** What the handshake learned about the server. */
export interface LspInitializeResult {
  /** The server's advertised capabilities. */
  capabilities: Record<string, unknown>;
  /** The server's `serverInfo` block (name/version), when provided. */
  serverInfo?: Record<string, unknown>;
}

/** Options for {@link LspClient.getDiagnostics}. */
export interface LspDiagnosticsOptions {
  /** How long to wait for the first push. Defaults to the client's wait window. */
  timeoutMs?: number;
  /** Cancellation signal; resolves early with whatever has arrived so far. */
  signal?: AbortSignal;
}

/** Construction options for {@link LspClient}. */
export interface LspClientOptions {
  /** Name used in log context. */
  serverName: string;
  /** Structured logger. */
  logger?: Logger;
  /** Client identity sent during `initialize`. */
  clientInfo?: LspClientInfo;
  /** Capabilities to advertise. Defaults to {@link DEFAULT_LSP_CAPABILITIES}. */
  capabilities?: Record<string, unknown>;
  /** Default per-request timeout in milliseconds. */
  defaultTimeoutMs?: number;
  /** Default diagnostics wait window. Defaults to {@link LSP_DEFAULT_DIAGNOSTICS_WAIT_MS}. */
  diagnosticsWaitMs?: number;
}

/** Default client identity when the embedder does not override it. */
const DEFAULT_CLIENT_INFO: LspClientInfo = { name: "ultracode", version: "1.3.1" };

/** A diagnostics waiter resolved when the next push for a URI arrives. */
type DiagnosticsWaiter = (diagnostics: LspDiagnostic[]) => void;

/** The minimal Language Server Protocol client. */
export class LspClient {
  readonly serverName: string;
  private readonly transport: LspTransport;
  private readonly logger: Logger;
  private readonly clientInfo: LspClientInfo;
  private readonly capabilities: Record<string, unknown>;
  private readonly defaultTimeoutMs: number | undefined;
  private readonly diagnosticsWaitMs: number;

  private idCounter = 0;
  private initialized = false;
  private shutdownRequested = false;
  private serverResult: LspInitializeResult | undefined;
  private readonly diagnosticsByUri = new Map<string, LspDiagnostic[]>();
  private readonly waiters = new Map<string, Set<DiagnosticsWaiter>>();

  constructor(transport: LspTransport, options: LspClientOptions) {
    this.transport = transport;
    this.serverName = options.serverName;
    this.logger = options.logger ?? new NoopLogger();
    this.clientInfo = options.clientInfo ?? DEFAULT_CLIENT_INFO;
    this.capabilities = options.capabilities ?? DEFAULT_LSP_CAPABILITIES;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.diagnosticsWaitMs = options.diagnosticsWaitMs ?? LSP_DEFAULT_DIAGNOSTICS_WAIT_MS;
    // Register the notification sink before any traffic can arrive.
    this.transport.onNotification((method, params) => this.handleNotification(method, params));
  }

  /** Whether {@link initialize} has completed. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Server details learned during the handshake, or `undefined` before it. */
  getServerResult(): LspInitializeResult | undefined {
    return this.serverResult;
  }

  /**
   * Perform the LSP handshake: start the transport, send `initialize`, then the
   * `initialized` notification. Idempotent.
   */
  async initialize(
    rootUri: string | undefined,
    options: LspRequestOptions = {},
  ): Promise<LspInitializeResult> {
    if (this.initialized && this.serverResult !== undefined) return this.serverResult;
    await this.transport.start();

    const result = asRecord(
      await this.rpc(
        "initialize",
        {
          processId: currentProcessId(),
          rootUri: rootUri ?? null,
          capabilities: this.capabilities,
          clientInfo: this.clientInfo,
        },
        options,
      ),
    );

    const info: LspInitializeResult = { capabilities: asRecord(result?.capabilities) ?? {} };
    const serverInfo = asRecord(result?.serverInfo);
    if (serverInfo !== undefined) info.serverInfo = serverInfo;

    await this.transport.notify({ jsonrpc: JSONRPC_VERSION, method: "initialized", params: {} });

    this.serverResult = info;
    this.initialized = true;
    this.logger.debug("LSP handshake complete", { server: this.serverName });
    return info;
  }

  /**
   * Announce a document via `textDocument/didOpen` so the server begins
   * analysing it and starts pushing diagnostics.
   */
  async openDocument(uri: string, languageId: string, text: string, version = 1): Promise<void> {
    this.assertInitialized("openDocument");
    await this.transport.notify({
      jsonrpc: JSONRPC_VERSION,
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId, version, text } },
    });
  }

  /**
   * Return the diagnostics the server pushed for `uri`. If none have arrived
   * yet, wait up to the configured window for the first push, then resolve with
   * whatever is cached (an empty array if nothing arrived). Never throws.
   */
  getDiagnostics(uri: string, options: LspDiagnosticsOptions = {}): Promise<LspDiagnostic[]> {
    const cached = this.diagnosticsByUri.get(uri);
    if (cached !== undefined) return Promise.resolve(cached);

    const timeoutMs = options.timeoutMs ?? this.diagnosticsWaitMs;
    const signal = options.signal;

    return new Promise<LspDiagnostic[]>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter: DiagnosticsWaiter = (diagnostics) => finish(diagnostics);
      const onAbort = (): void => finish(this.diagnosticsByUri.get(uri) ?? []);
      const finish = (diagnostics: LspDiagnostic[]): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        this.removeWaiter(uri, waiter);
        if (signal !== undefined) signal.removeEventListener("abort", onAbort);
        resolve(diagnostics);
      };

      if (signal?.aborted === true) {
        finish(this.diagnosticsByUri.get(uri) ?? []);
        return;
      }
      timer = setTimeout(() => finish(this.diagnosticsByUri.get(uri) ?? []), timeoutMs);
      if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as unknown as { unref: () => void }).unref();
      }
      if (signal !== undefined) signal.addEventListener("abort", onAbort, { once: true });
      this.addWaiter(uri, waiter);
    });
  }

  /** Send `shutdown` (request). Idempotent. */
  async shutdown(options: LspRequestOptions = {}): Promise<void> {
    if (this.shutdownRequested) return;
    this.shutdownRequested = true;
    await this.rpc("shutdown", null, options);
  }

  /** Send `exit` (notification). Never throws. */
  async exit(): Promise<void> {
    try {
      await this.transport.notify({ jsonrpc: JSONRPC_VERSION, method: "exit" });
    } catch (err) {
      this.logger.debug("LSP exit notification failed (transport already closed)", {
        server: this.serverName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Gracefully tear the session down: best-effort `shutdown` + `exit`, then
   * close the transport. Never throws — safe to call unconditionally.
   */
  async dispose(): Promise<void> {
    try {
      await this.shutdown({ timeoutMs: LSP_DISPOSE_SHUTDOWN_TIMEOUT_MS });
    } catch (err) {
      this.logger.debug("LSP shutdown during dispose failed; continuing", {
        server: this.serverName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await this.exit();
    await this.transport.close().catch(() => {});
    this.rejectAllWaiters();
  }

  /** Handle a server→client notification (only diagnostics are consumed). */
  private handleNotification(method: string, params: unknown): void {
    if (method !== "textDocument/publishDiagnostics") return;
    const record = asRecord(params);
    const uri = asString(record?.uri);
    if (uri === undefined) return;
    const diagnostics = parseDiagnostics(record?.diagnostics);
    this.diagnosticsByUri.set(uri, diagnostics);
    const waiters = this.waiters.get(uri);
    if (waiters !== undefined) {
      this.waiters.delete(uri);
      for (const waiter of waiters) waiter(diagnostics);
    }
  }

  /** Register a diagnostics waiter for a URI. */
  private addWaiter(uri: string, waiter: DiagnosticsWaiter): void {
    const set = this.waiters.get(uri);
    if (set !== undefined) set.add(waiter);
    else this.waiters.set(uri, new Set([waiter]));
  }

  /** Remove a diagnostics waiter for a URI. */
  private removeWaiter(uri: string, waiter: DiagnosticsWaiter): void {
    const set = this.waiters.get(uri);
    if (set === undefined) return;
    set.delete(waiter);
    if (set.size === 0) this.waiters.delete(uri);
  }

  /** Resolve every outstanding waiter (with an empty set) on dispose. */
  private rejectAllWaiters(): void {
    const sets = [...this.waiters.values()];
    this.waiters.clear();
    for (const set of sets) {
      for (const waiter of set) waiter([]);
    }
  }

  /** Send a JSON-RPC request and unwrap `result`, mapping `error` to {@link LspError}. */
  private async rpc(method: string, params: unknown, options: LspRequestOptions): Promise<unknown> {
    const message: JsonRpcRequestMessage = {
      jsonrpc: JSONRPC_VERSION,
      id: this.nextId(),
      method,
    };
    if (params !== undefined) message.params = params;

    const requestOptions: LspRequestOptions = {};
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    if (timeoutMs !== undefined) requestOptions.timeoutMs = timeoutMs;
    if (options.signal !== undefined) requestOptions.signal = options.signal;

    const response = await this.transport.request(message, requestOptions);
    if (response.error !== undefined) {
      throw new LspError(`LSP server error for "${method}": ${response.error.message}`, {
        details: {
          server: this.serverName,
          method,
          code: response.error.code,
          data: response.error.data,
        },
      });
    }
    return response.result;
  }

  /** Next JSON-RPC id (monotonic per client). */
  private nextId(): JsonRpcId {
    this.idCounter += 1;
    return this.idCounter;
  }

  /** Guard: methods other than `initialize` require a completed handshake. */
  private assertInitialized(method: string): void {
    if (!this.initialized) {
      throw new LspError(`LSP client "${this.serverName}" must be initialized before ${method}()`, {
        details: { server: this.serverName },
      });
    }
  }
}

/** Parse a raw `diagnostics` array into typed {@link LspDiagnostic}s (best-effort). */
export function parseDiagnostics(value: unknown): LspDiagnostic[] {
  const array = asArray(value);
  if (array === undefined) return [];
  const out: LspDiagnostic[] = [];
  for (const item of array) {
    const record = asRecord(item);
    if (record === undefined) continue;
    const message = asString(record.message);
    const range = parseRange(record.range);
    if (message === undefined || range === undefined) continue;
    const diagnostic: LspDiagnostic = { range, message };
    if (typeof record.severity === "number") diagnostic.severity = record.severity;
    if (typeof record.source === "string") diagnostic.source = record.source;
    if (typeof record.code === "string" || typeof record.code === "number") {
      diagnostic.code = record.code;
    }
    out.push(diagnostic);
  }
  return out;
}

/** Parse an LSP `Range`, or `undefined` when malformed. */
function parseRange(value: unknown): LspRange | undefined {
  const record = asRecord(value);
  const start = parsePosition(record?.start);
  const end = parsePosition(record?.end);
  if (start === undefined || end === undefined) return undefined;
  return { start, end };
}

/** Parse an LSP `Position`, or `undefined` when malformed. */
function parsePosition(value: unknown): LspPosition | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const line = record.line;
  const character = record.character;
  if (typeof line !== "number" || typeof character !== "number") return undefined;
  return { line, character };
}

/** The current OS process id, or `null` when unavailable. */
function currentProcessId(): number | null {
  return typeof process !== "undefined" && typeof process.pid === "number" ? process.pid : null;
}
