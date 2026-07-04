/**
 * `core/lsp` — the minimal Language Server Protocol client runtime.
 *
 * Public surface for the integrator:
 *
 * - {@link connectLspServer} — spawn one configured language server, run the
 *   handshake and return an {@link LspClientHandle} for opening documents and
 *   collecting diagnostics.
 * - {@link collectDiagnostics} — the fully defensive one-shot: connect, open a
 *   single file, collect its diagnostics, and always dispose. Never throws;
 *   failures are returned as `error` alongside an empty `diagnostics` array.
 *
 * The scope is deliberately minimal: one server, one document, push diagnostics
 * — no auto-management of many languages.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { Logger, LspServerConfig } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import {
  LspClient,
  type LspClientInfo,
  type LspClientOptions,
  type LspDiagnostic,
  type LspDiagnosticsOptions,
} from "./LspClient.js";
import {
  DEFAULT_LSP_TIMEOUT_MS,
  LspError,
  LspStdioTransport,
  type LspStdioTransportOptions,
} from "./transport.js";

export type {
  LspClientInfo,
  LspClientOptions,
  LspDiagnostic,
  LspDiagnosticsOptions,
  LspInitializeResult,
  LspPosition,
  LspRange,
} from "./LspClient.js";
export {
  DEFAULT_LSP_CAPABILITIES,
  LSP_DEFAULT_DIAGNOSTICS_WAIT_MS,
  LSP_DISPOSE_SHUTDOWN_TIMEOUT_MS,
  LspClient,
  parseDiagnostics,
} from "./LspClient.js";
export type {
  JsonRpcErrorObject,
  JsonRpcId,
  JsonRpcNotificationMessage,
  JsonRpcRequestMessage,
  JsonRpcResponseMessage,
  LspNotificationHandler,
  LspRequestOptions,
  LspStdioTransportOptions,
  LspTransport,
} from "./transport.js";
export {
  asArray,
  asRecord,
  asString,
  DEFAULT_LSP_TIMEOUT_MS,
  encodeFrame,
  JSONRPC_VERSION,
  LspError,
  LspStdioTransport,
  parseContentLength,
} from "./transport.js";

/** Options for {@link connectLspServer} and {@link collectDiagnostics}. */
export interface ConnectLspOptions {
  /** Structured logger. */
  logger?: Logger;
  /** Environment used to run the server. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Working directory for the server; also the default workspace root. */
  cwd?: string;
  /** Default per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Client identity advertised during the handshake. */
  clientInfo?: LspClientInfo;
  /** Capabilities to advertise during the handshake. */
  capabilities?: Record<string, unknown>;
  /** Cancellation signal for the connect/handshake phase. */
  signal?: AbortSignal;
  /** Spawn primitive for the stdio transport (test seam). */
  spawnFn?: LspStdioTransportOptions["spawnFn"];
}

/** A live connection to one language server. */
export interface LspClientHandle {
  /** The configured server name. */
  serverName: string;
  /** The underlying client. */
  client: LspClient;
  /** The workspace root URI negotiated during connect. */
  rootUri: string;
  /** Announce a document so the server starts analysing it. */
  openDocument(uri: string, languageId: string, text: string, version?: number): Promise<void>;
  /** Collect the diagnostics pushed for a URI (waits a short window). */
  getDiagnostics(uri: string, options?: LspDiagnosticsOptions): Promise<LspDiagnostic[]>;
  /** Shut the connection down and release the process. Never throws. */
  dispose(): Promise<void>;
}

/**
 * Connect to one language server: spawn it, run the handshake. Rejects with
 * {@link LspError} on any failure during connect (the transport/process is
 * always released first).
 */
export async function connectLspServer(
  config: LspServerConfig,
  options: ConnectLspOptions = {},
): Promise<LspClientHandle> {
  const logger = options.logger ?? new NoopLogger();
  if (config.command === undefined || config.command === "") {
    throw new LspError(`LSP server "${config.name}": requires a "command"`, {
      details: { server: config.name },
    });
  }
  const cwd = options.cwd ?? process.cwd();
  const rootUri = config.rootUri ?? pathToFileURL(cwd).href;

  const transportOptions: LspStdioTransportOptions = {
    command: config.command,
    args: config.args ?? [],
    env: options.env ?? process.env,
    cwd,
    logger,
  };
  if (options.spawnFn !== undefined) transportOptions.spawnFn = options.spawnFn;
  const transport = new LspStdioTransport(transportOptions);

  const clientOptions: LspClientOptions = { serverName: config.name, logger };
  if (options.clientInfo !== undefined) clientOptions.clientInfo = options.clientInfo;
  if (options.capabilities !== undefined) clientOptions.capabilities = options.capabilities;
  clientOptions.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_LSP_TIMEOUT_MS;
  const client = new LspClient(transport, clientOptions);

  const requestOptions = options.signal !== undefined ? { signal: options.signal } : {};
  try {
    await client.initialize(rootUri, requestOptions);
    return {
      serverName: config.name,
      client,
      rootUri,
      openDocument: (uri, languageId, text, version) =>
        client.openDocument(uri, languageId, text, version),
      getDiagnostics: (uri, opts) => client.getDiagnostics(uri, opts ?? {}),
      dispose: () => client.dispose(),
    };
  } catch (err) {
    // Connect failed: never leak the transport/process.
    await client.dispose().catch(() => {});
    throw err instanceof LspError
      ? err
      : new LspError(`Failed to connect to LSP server "${config.name}"`, {
          cause: err,
          details: { server: config.name },
        });
  }
}

/** Describes the single document {@link collectDiagnostics} should analyse. */
export interface DiagnosticsRequest {
  /** Path on disk (resolved against `cwd` and converted to a `file:` URI). */
  filePath?: string;
  /** Explicit document URI (overrides {@link DiagnosticsRequest.filePath}). */
  uri?: string;
  /** LSP language id (e.g. `"typescript"`, `"python"`, `"rust"`). */
  languageId: string;
  /** Document text. Read from `filePath` when omitted. */
  text?: string;
  /** Document version. Defaults to `1`. */
  version?: number;
}

/** Outcome of {@link collectDiagnostics}. */
export interface CollectDiagnosticsResult {
  /** The document URI that was opened. */
  uri: string;
  /** The diagnostics the server pushed (empty on failure or none). */
  diagnostics: LspDiagnostic[];
  /** Set when the run failed at any stage; diagnostics are then empty. */
  error?: Error;
}

/** Options for {@link collectDiagnostics}. */
export interface CollectDiagnosticsOptions extends ConnectLspOptions {
  /** How long to wait for the server to push diagnostics. */
  diagnosticsWaitMs?: number;
  /** `fs.readFile` implementation (test seam). */
  readFileImpl?: (filePath: string) => Promise<string>;
}

/**
 * One-shot, fully defensive diagnostics collection for a single file. Connects
 * to the server, opens the document, waits for the diagnostics push and always
 * disposes. Never throws — any failure is returned as `error` with an empty
 * `diagnostics` array.
 */
export async function collectDiagnostics(
  config: LspServerConfig,
  request: DiagnosticsRequest,
  options: CollectDiagnosticsOptions = {},
): Promise<CollectDiagnosticsResult> {
  const logger = options.logger ?? new NoopLogger();

  let uri: string;
  let text: string;
  try {
    const resolved = await resolveDocument(request, options);
    uri = resolved.uri;
    text = resolved.text;
  } catch (err) {
    const error = toError(err);
    logger.warn("LSP: failed to resolve document for diagnostics", { error: error.message });
    return { uri: request.uri ?? request.filePath ?? "", diagnostics: [], error };
  }

  let handle: LspClientHandle | undefined;
  try {
    handle = await connectLspServer(config, options);
    await handle.openDocument(uri, request.languageId, text, request.version ?? 1);
    const waitOptions: LspDiagnosticsOptions =
      options.diagnosticsWaitMs !== undefined ? { timeoutMs: options.diagnosticsWaitMs } : {};
    const diagnostics = await handle.getDiagnostics(uri, waitOptions);
    return { uri, diagnostics };
  } catch (err) {
    const error = toError(err);
    logger.warn("LSP: failed to collect diagnostics", {
      server: config.name,
      error: error.message,
    });
    return { uri, diagnostics: [], error };
  } finally {
    if (handle !== undefined) await handle.dispose().catch(() => {});
  }
}

/** Build a `file:` URI for a path, resolving relative paths against `cwd`. */
export function fileUri(filePath: string, cwd: string = process.cwd()): string {
  const absolute = isAbsolute(filePath) ? filePath : resolvePath(cwd, filePath);
  return pathToFileURL(absolute).href;
}

/** Resolve the request into a concrete `{ uri, text }` pair. */
async function resolveDocument(
  request: DiagnosticsRequest,
  options: CollectDiagnosticsOptions,
): Promise<{ uri: string; text: string }> {
  const cwd = options.cwd ?? process.cwd();
  const read = options.readFileImpl ?? ((filePath: string) => readFile(filePath, "utf8"));

  if (request.uri !== undefined && request.uri !== "") {
    const text =
      request.text ??
      (request.filePath !== undefined && request.filePath !== ""
        ? await read(request.filePath)
        : "");
    return { uri: request.uri, text };
  }

  if (request.filePath === undefined || request.filePath === "") {
    throw new LspError("collectDiagnostics requires a filePath or uri");
  }
  const absolute = isAbsolute(request.filePath)
    ? request.filePath
    : resolvePath(cwd, request.filePath);
  const text = request.text ?? (await read(request.filePath));
  return { uri: pathToFileURL(absolute).href, text };
}

/** Coerce an unknown thrown value into an {@link Error}. */
function toError(err: unknown): Error {
  return err instanceof Error ? err : new LspError(String(err));
}
