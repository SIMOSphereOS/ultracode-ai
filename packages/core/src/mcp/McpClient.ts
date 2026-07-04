/**
 * {@link McpClient} — the Model Context Protocol client.
 *
 * Drives the MCP conversation on top of an {@link McpTransport}:
 *
 * 1. **Handshake** — `initialize` (protocolVersion, clientInfo, capabilities)
 *    followed by the `notifications/initialized` notification.
 * 2. **Discovery** — `tools/list` (with cursor pagination) returns the server's
 *    tool descriptors.
 * 3. **Execution** — `tools/call` (name + arguments) returns `content` blocks
 *    and an `isError` flag.
 *
 * The client owns JSON-RPC `id` generation and turns server-reported JSON-RPC
 * errors into {@link McpError}. It never throws synchronously from its async
 * methods — failures surface as rejected promises.
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
  McpError,
} from "./jsonRpc.js";
import type { McpRequestOptions, McpTransport } from "./transport.js";

/** MCP protocol version this client advertises during the handshake. */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

/** Safety cap on `tools/list` pagination to avoid a runaway cursor loop. */
const MAX_TOOL_LIST_PAGES = 100;

/** Identifies this client to the server during `initialize`. */
export interface McpClientInfo {
  name: string;
  version: string;
}

/** A single tool as described by an MCP server's `tools/list`. */
export interface McpToolDescriptor {
  /** Server-local tool name (not yet namespaced). */
  name: string;
  /** Human-readable description, when the server provides one. */
  description?: string;
  /** JSON-Schema description of the tool's arguments, when provided. */
  inputSchema?: Record<string, unknown>;
}

/** One content block returned by `tools/call`. */
export interface McpContentBlock {
  /** Block type: `"text"`, `"image"`, `"resource"`, … */
  type: string;
  /** Present for `type: "text"`. */
  text?: string;
  /** Open-ended: image/resource blocks carry additional fields. */
  [key: string]: unknown;
}

/** Result of a `tools/call` invocation. */
export interface McpToolCallResult {
  /** The content blocks the tool produced. */
  content: McpContentBlock[];
  /** `true` when the server flagged the call as an error result. */
  isError: boolean;
}

/** What the handshake learned about the server. */
export interface McpServerInfo {
  /** Protocol version the server negotiated. */
  protocolVersion: string;
  /** The server's advertised capabilities. */
  capabilities: Record<string, unknown>;
  /** The server's `serverInfo` block (name/version), when provided. */
  serverInfo?: Record<string, unknown>;
}

/** Construction options for {@link McpClient}. */
export interface McpClientOptions {
  /** Name used to namespace this server's tools and in log context. */
  serverName: string;
  /** Structured logger. */
  logger?: Logger;
  /** Client identity sent during `initialize`. */
  clientInfo?: McpClientInfo;
  /** Protocol version to advertise. Defaults to {@link MCP_PROTOCOL_VERSION}. */
  protocolVersion?: string;
  /** Capabilities to advertise. Defaults to `{}`. */
  capabilities?: Record<string, unknown>;
  /** Default per-request timeout in milliseconds. */
  defaultTimeoutMs?: number;
}

/** Default client identity when the embedder does not override it. */
const DEFAULT_CLIENT_INFO: McpClientInfo = { name: "ultracode", version: "1.3.1" };

/** The Model Context Protocol client. */
export class McpClient {
  readonly serverName: string;
  private readonly transport: McpTransport;
  private readonly logger: Logger;
  private readonly clientInfo: McpClientInfo;
  private readonly protocolVersion: string;
  private readonly capabilities: Record<string, unknown>;
  private readonly defaultTimeoutMs: number | undefined;

  private idCounter = 0;
  private initialized = false;
  private serverInfo: McpServerInfo | undefined;

  constructor(transport: McpTransport, options: McpClientOptions) {
    this.transport = transport;
    this.serverName = options.serverName;
    this.logger = options.logger ?? new NoopLogger();
    this.clientInfo = options.clientInfo ?? DEFAULT_CLIENT_INFO;
    this.protocolVersion = options.protocolVersion ?? MCP_PROTOCOL_VERSION;
    this.capabilities = options.capabilities ?? {};
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  /** Whether {@link initialize} has completed. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Server details learned during the handshake, or `undefined` before it. */
  getServerInfo(): McpServerInfo | undefined {
    return this.serverInfo;
  }

  /**
   * Perform the MCP handshake: start the transport, send `initialize`, then the
   * `notifications/initialized` notification. Idempotent.
   */
  async initialize(options: McpRequestOptions = {}): Promise<McpServerInfo> {
    if (this.initialized && this.serverInfo !== undefined) return this.serverInfo;
    await this.transport.start();

    const result = asRecord(
      await this.rpc(
        "initialize",
        {
          protocolVersion: this.protocolVersion,
          capabilities: this.capabilities,
          clientInfo: this.clientInfo,
        },
        options,
      ),
    );

    const info: McpServerInfo = {
      protocolVersion: asString(result?.protocolVersion) ?? this.protocolVersion,
      capabilities: asRecord(result?.capabilities) ?? {},
    };
    const serverInfo = asRecord(result?.serverInfo);
    if (serverInfo !== undefined) info.serverInfo = serverInfo;

    await this.transport.notify({ jsonrpc: JSONRPC_VERSION, method: "notifications/initialized" });

    this.serverInfo = info;
    this.initialized = true;
    this.logger.debug("MCP handshake complete", {
      server: this.serverName,
      protocolVersion: info.protocolVersion,
    });
    return info;
  }

  /**
   * Discover the server's tools via `tools/list`, following cursor pagination.
   */
  async listTools(options: McpRequestOptions = {}): Promise<McpToolDescriptor[]> {
    this.assertInitialized("listTools");
    const tools: McpToolDescriptor[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_LIST_PAGES; page += 1) {
      const params = cursor !== undefined ? { cursor } : {};
      const result = asRecord(await this.rpc("tools/list", params, options));
      for (const entry of asArray(result?.tools) ?? []) {
        const descriptor = this.parseToolDescriptor(entry);
        if (descriptor !== undefined) tools.push(descriptor);
      }
      const nextCursor = asString(result?.nextCursor);
      if (nextCursor === undefined || nextCursor === "" || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return tools;
  }

  /**
   * Execute a tool via `tools/call` with the given (server-local) name and
   * arguments. Returns the content blocks and the `isError` flag.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> | undefined,
    options: McpRequestOptions = {},
  ): Promise<McpToolCallResult> {
    this.assertInitialized("callTool");
    const result = asRecord(await this.rpc("tools/call", { name, arguments: args ?? {} }, options));
    const content: McpContentBlock[] = [];
    for (const block of asArray(result?.content) ?? []) {
      const record = asRecord(block);
      if (record !== undefined && typeof record.type === "string") {
        content.push(record as McpContentBlock);
      }
    }
    return { content, isError: result?.isError === true };
  }

  /** Close the underlying transport. */
  async close(): Promise<void> {
    await this.transport.close();
  }

  /** Send a JSON-RPC request and unwrap `result`, mapping `error` to {@link McpError}. */
  private async rpc(method: string, params: unknown, options: McpRequestOptions): Promise<unknown> {
    const message: JsonRpcRequestMessage = {
      jsonrpc: JSONRPC_VERSION,
      id: this.nextId(),
      method,
    };
    if (params !== undefined) message.params = params;

    const requestOptions: McpRequestOptions = {};
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    if (timeoutMs !== undefined) requestOptions.timeoutMs = timeoutMs;
    if (options.signal !== undefined) requestOptions.signal = options.signal;

    const response = await this.transport.request(message, requestOptions);
    if (response.error !== undefined) {
      throw new McpError(`MCP server error for "${method}": ${response.error.message}`, {
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

  /** Parse a `tools/list` entry into a descriptor, or `undefined` when invalid. */
  private parseToolDescriptor(value: unknown): McpToolDescriptor | undefined {
    const record = asRecord(value);
    const name = asString(record?.name);
    if (record === undefined || name === undefined || name === "") {
      this.logger.warn("Skipping MCP tool descriptor without a name", { server: this.serverName });
      return undefined;
    }
    const descriptor: McpToolDescriptor = { name };
    const description = asString(record.description);
    if (description !== undefined) descriptor.description = description;
    const inputSchema = asRecord(record.inputSchema);
    if (inputSchema !== undefined) descriptor.inputSchema = inputSchema;
    return descriptor;
  }

  /** Guard: methods other than `initialize` require a completed handshake. */
  private assertInitialized(method: string): void {
    if (!this.initialized) {
      throw new McpError(`MCP client "${this.serverName}" must be initialized before ${method}()`, {
        details: { server: this.serverName },
      });
    }
  }
}
