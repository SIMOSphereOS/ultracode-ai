/**
 * JSON-RPC 2.0 wire types and the {@link McpError} used across the MCP client.
 *
 * The Model Context Protocol speaks JSON-RPC 2.0 over its transports (stdio and
 * HTTP). These are the minimal message shapes the client sends and receives,
 * plus a handful of tiny, never-throwing type guards used to read the loosely
 * typed `result`/`params` payloads that arrive off the wire.
 */

import { UltraCodeError, type UltraCodeErrorOptions } from "ultracode-shared";

/** The only JSON-RPC version the protocol allows. */
export const JSONRPC_VERSION = "2.0" as const;

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
 * An error raised anywhere in the MCP layer: transport failures, spawn errors,
 * timeouts, malformed responses and server-reported JSON-RPC errors. Extends
 * {@link UltraCodeError} so it carries a stable code and serialises cleanly via
 * `toJSON()` (and thus through `serializeError`).
 */
export class McpError extends UltraCodeError {
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("MCP_ERROR", message, options);
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

/** Whether a parsed message is a JSON-RPC response (has an id and result/error). */
export function isJsonRpcResponse(value: unknown): value is JsonRpcResponseMessage {
  const record = asRecord(value);
  if (record === undefined) return false;
  const hasId = "id" in record && (typeof record.id === "number" || typeof record.id === "string");
  return hasId && ("result" in record || "error" in record);
}
