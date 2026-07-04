/**
 * `core/mcp` — the Model Context Protocol client runtime.
 *
 * Public surface for the integrator:
 *
 * - {@link connectMcpServer} — connect to one configured server (handshake +
 *   tool discovery) and return a {@link McpClientHandle}.
 * - {@link registerMcpTools} — connect to many servers, adapt every discovered
 *   tool as a product {@link ITool}, optionally register them into a sink
 *   (e.g. a `ToolRegistry`), and collect per-server errors without letting one
 *   bad server abort the rest.
 *
 * Neither entry point throws for an individual server failure in the batch path:
 * {@link registerMcpTools} returns the errors alongside the tools that did load.
 */

import type { ITool, Logger, McpServerConfig, ToolPermission } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import { McpError } from "./jsonRpc.js";
import { McpClient, type McpClientInfo, type McpToolDescriptor } from "./McpClient.js";
import {
  McpToolAdapter,
  type McpToolAdapterOptions,
  type McpToolOutput,
} from "./McpToolAdapter.js";
import {
  DEFAULT_MCP_TIMEOUT_MS,
  HttpTransport,
  type McpTransport,
  StdioTransport,
  type StdioTransportOptions,
} from "./transport.js";

export type {
  JsonRpcErrorObject,
  JsonRpcId,
  JsonRpcNotificationMessage,
  JsonRpcRequestMessage,
  JsonRpcResponseMessage,
} from "./jsonRpc.js";
export { asArray, asRecord, asString, JSONRPC_VERSION, McpError } from "./jsonRpc.js";
export type {
  McpClientInfo,
  McpClientOptions,
  McpContentBlock,
  McpServerInfo,
  McpToolCallResult,
  McpToolDescriptor,
} from "./McpClient.js";
export { MCP_PROTOCOL_VERSION, McpClient } from "./McpClient.js";
export type { McpToolAdapterOptions, McpToolOutput } from "./McpToolAdapter.js";
export { extractText, McpToolAdapter, toParameterSchema } from "./McpToolAdapter.js";
export type {
  HttpTransportOptions,
  McpRequestOptions,
  McpTransport,
  StdioTransportOptions,
} from "./transport.js";
export { DEFAULT_MCP_TIMEOUT_MS, HttpTransport, StdioTransport } from "./transport.js";

/** An MCP tool: a product {@link ITool} backed by a remote MCP server. */
export type McpTool = ITool<Record<string, unknown>, McpToolOutput>;

/** Options common to {@link connectMcpServer} and {@link registerMcpTools}. */
export interface ConnectMcpOptions {
  /** Structured logger. */
  logger?: Logger;
  /**
   * Environment used to resolve `config.apiKeyEnv` and to run stdio servers.
   * Defaults to `process.env`.
   */
  env?: Readonly<Record<string, string | undefined>>;
  /** Default per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Client identity advertised during the handshake. */
  clientInfo?: McpClientInfo;
  /** Protocol version to advertise. */
  protocolVersion?: string;
  /** Permission disposition applied to every wrapped tool. Defaults to `"ask"`. */
  permission?: ToolPermission;
  /** Cancellation signal for the connect/handshake/discovery phase. */
  signal?: AbortSignal;
  /** `fetch` implementation for HTTP transports (test seam). */
  fetchImpl?: typeof fetch;
  /** Spawn primitive for stdio transports (test seam). */
  spawnFn?: StdioTransportOptions["spawnFn"];
}

/** A live connection to one MCP server plus its adapted tools. */
export interface McpClientHandle {
  /** The configured server name (namespace for its tools). */
  serverName: string;
  /** The underlying client. */
  client: McpClient;
  /** Tools discovered during connect, wrapped as product tools. */
  tools: McpTool[];
  /** Re-run `tools/list` and rebuild {@link McpClientHandle.tools}. */
  discover(): Promise<McpTool[]>;
  /** Shut the connection down and release the transport. */
  dispose(): Promise<void>;
}

/** Outcome of {@link registerMcpTools}. */
export interface RegisterMcpToolsResult {
  /** Every tool discovered across all servers that connected successfully. */
  tools: McpTool[];
  /** One handle per server that connected successfully. */
  handles: McpClientHandle[];
  /** Per-server connection/discovery failures (batch path never throws). */
  errors: Array<{ server: string; error: Error }>;
  /** Dispose every successfully-connected server. */
  dispose(): Promise<void>;
}

/** A minimal tool sink; a `ToolRegistry` satisfies this structurally. */
export interface ToolSink {
  register(tool: ITool<Record<string, unknown>, McpToolOutput>): void;
}

/** Options for {@link registerMcpTools}, adding the optional registration sink. */
export interface RegisterMcpToolsOptions extends ConnectMcpOptions {
  /** When present, each adapted tool is registered into this sink. */
  registry?: ToolSink;
}

/** Build the transport for a config, resolving `apiKeyEnv` from the environment. */
function createTransport(
  config: McpServerConfig,
  options: ConnectMcpOptions,
  logger: Logger,
): McpTransport {
  const env = options.env ?? process.env;
  if (config.transport === "http") {
    if (config.url === undefined || config.url === "") {
      throw new McpError(`MCP server "${config.name}": http transport requires a "url"`, {
        details: { server: config.name },
      });
    }
    const httpOptions: {
      url: string;
      logger: Logger;
      apiKey?: string;
      fetchImpl?: typeof fetch;
    } = { url: config.url, logger };
    const apiKey = config.apiKeyEnv !== undefined ? env[config.apiKeyEnv] : undefined;
    if (apiKey !== undefined) httpOptions.apiKey = apiKey;
    if (options.fetchImpl !== undefined) httpOptions.fetchImpl = options.fetchImpl;
    return new HttpTransport(httpOptions);
  }

  if (config.command === undefined || config.command === "") {
    throw new McpError(`MCP server "${config.name}": stdio transport requires a "command"`, {
      details: { server: config.name },
    });
  }
  const stdioOptions: StdioTransportOptions = {
    command: config.command,
    args: config.args ?? [],
    env,
    logger,
  };
  if (options.spawnFn !== undefined) stdioOptions.spawnFn = options.spawnFn;
  return new StdioTransport(stdioOptions);
}

/** Wrap a batch of descriptors as product tools for one client. */
function adaptTools(
  client: McpClient,
  descriptors: readonly McpToolDescriptor[],
  options: ConnectMcpOptions,
): McpTool[] {
  const adapterOptions: McpToolAdapterOptions = {};
  if (options.permission !== undefined) adapterOptions.permission = options.permission;
  if (options.timeoutMs !== undefined) adapterOptions.timeoutMs = options.timeoutMs;
  return descriptors.map((descriptor) => new McpToolAdapter(client, descriptor, adapterOptions));
}

/**
 * Connect to one MCP server: build the transport, perform the handshake and
 * discover tools. Rejects with {@link McpError} on any failure during connect.
 */
export async function connectMcpServer(
  config: McpServerConfig,
  options: ConnectMcpOptions = {},
): Promise<McpClientHandle> {
  const logger = options.logger ?? new NoopLogger();
  const transport = createTransport(config, options, logger);

  const clientOptions: {
    serverName: string;
    logger: Logger;
    clientInfo?: McpClientInfo;
    protocolVersion?: string;
    defaultTimeoutMs?: number;
  } = { serverName: config.name, logger };
  if (options.clientInfo !== undefined) clientOptions.clientInfo = options.clientInfo;
  if (options.protocolVersion !== undefined)
    clientOptions.protocolVersion = options.protocolVersion;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
  clientOptions.defaultTimeoutMs = timeoutMs;

  const client = new McpClient(transport, clientOptions);

  const requestOptions = options.signal !== undefined ? { signal: options.signal } : {};
  try {
    await client.initialize(requestOptions);
    const descriptors = await client.listTools(requestOptions);
    let tools = adaptTools(client, descriptors, options);

    const handle: McpClientHandle = {
      serverName: config.name,
      client,
      tools,
      discover: async () => {
        const next = await client.listTools(
          options.signal !== undefined ? { signal: options.signal } : {},
        );
        tools = adaptTools(client, next, options);
        handle.tools = tools;
        return tools;
      },
      dispose: () => client.close(),
    };
    return handle;
  } catch (err) {
    // Connect failed: never leak the transport/process.
    await client.close().catch(() => {});
    throw err instanceof McpError
      ? err
      : new McpError(`Failed to connect to MCP server "${config.name}"`, {
          cause: err,
          details: { server: config.name },
        });
  }
}

/**
 * Connect to every configured server, adapt all discovered tools, and — when a
 * `registry` sink is supplied — register them. One server's failure is recorded
 * in `errors` and does not abort the others.
 */
export async function registerMcpTools(
  configs: readonly McpServerConfig[],
  options: RegisterMcpToolsOptions = {},
): Promise<RegisterMcpToolsResult> {
  const logger = options.logger ?? new NoopLogger();
  const tools: McpTool[] = [];
  const handles: McpClientHandle[] = [];
  const errors: Array<{ server: string; error: Error }> = [];

  const settled = await Promise.all(
    configs.map(async (config) => {
      try {
        const handle = await connectMcpServer(config, options);
        return { ok: true as const, handle };
      } catch (err) {
        const error = err instanceof Error ? err : new McpError(String(err));
        logger.warn("MCP server failed to connect; skipping", {
          server: config.name,
          error: error.message,
        });
        return { ok: false as const, server: config.name, error };
      }
    }),
  );

  for (const entry of settled) {
    if (!entry.ok) {
      errors.push({ server: entry.server, error: entry.error });
      continue;
    }
    handles.push(entry.handle);
    for (const tool of entry.handle.tools) {
      if (options.registry !== undefined) {
        try {
          options.registry.register(tool);
        } catch (err) {
          // A duplicate name (or other registry error) must not lose the batch.
          logger.warn("Failed to register MCP tool; skipping", {
            tool: tool.definition.name,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }
      tools.push(tool);
    }
  }

  return {
    tools,
    handles,
    errors,
    dispose: async () => {
      await Promise.all(handles.map((handle) => handle.dispose().catch(() => {})));
    },
  };
}
