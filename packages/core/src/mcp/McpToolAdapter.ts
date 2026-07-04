/**
 * {@link McpToolAdapter} — wrap a discovered MCP tool as a product {@link ITool}.
 *
 * Each adapter presents one MCP server tool through the exact same contract the
 * built-in tools use, so the registry, executor and model tool-calling path
 * treat MCP tools identically:
 *
 * - The tool name is namespaced `"<server>.<tool>"` to avoid collisions between
 *   servers (and with built-ins).
 * - `category` is `"mcp"`; the default permission is `"ask"` because MCP tools
 *   are external, side-effecting capabilities.
 * - The MCP `inputSchema` (JSON Schema) is converted best-effort into the
 *   product's {@link ToolParameterSchema} so the model sees the parameters.
 * - `execute` calls `tools/call` and maps the result onto a {@link ToolResult};
 *   it never rejects, and an MCP `isError` result becomes `ok: false`.
 */

import type {
  ITool,
  ToolContext,
  ToolDefinition,
  ToolParameterSchema,
  ToolPermission,
  ToolResult,
} from "ultracode-shared";
import { serializeError, ToolError, ValidationError } from "ultracode-shared";
import { asArray, asRecord, asString } from "./jsonRpc.js";
import type { McpClient, McpContentBlock, McpToolDescriptor } from "./McpClient.js";

/** Successful (and error) output payload of an MCP-backed tool. */
export interface McpToolOutput {
  /** Raw content blocks returned by the server. */
  content: McpContentBlock[];
  /** All text blocks concatenated (newline-separated) for convenience. */
  text: string;
  /** Whether the server flagged the result as an error. */
  isError: boolean;
}

/** Construction options for {@link McpToolAdapter}. */
export interface McpToolAdapterOptions {
  /** Permission disposition for the wrapped tool. Defaults to `"ask"`. */
  permission?: ToolPermission;
  /** Per-call timeout in milliseconds forwarded to `tools/call`. */
  timeoutMs?: number;
}

/** The JSON-Schema types the product parameter schema understands. */
const SCHEMA_TYPES = new Set<ToolParameterSchema["type"]>([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/** Adapt a single MCP tool descriptor to the product {@link ITool} contract. */
export class McpToolAdapter implements ITool<Record<string, unknown>, McpToolOutput> {
  readonly definition: ToolDefinition;

  private readonly client: McpClient;
  private readonly serverName: string;
  private readonly toolName: string;
  private readonly requiredKeys: readonly string[];
  private readonly timeoutMs: number | undefined;

  constructor(
    client: McpClient,
    descriptor: McpToolDescriptor,
    options: McpToolAdapterOptions = {},
  ) {
    this.client = client;
    this.serverName = client.serverName;
    this.toolName = descriptor.name;
    this.timeoutMs = options.timeoutMs;
    this.requiredKeys = readRequired(descriptor.inputSchema);

    this.definition = {
      name: `${this.serverName}.${descriptor.name}`,
      description:
        descriptor.description ?? `MCP tool "${descriptor.name}" from ${this.serverName}`,
      category: "mcp",
      parameters: toParameterSchema(descriptor.inputSchema),
      permission: options.permission ?? "ask",
    };
  }

  /**
   * Validate arguments: they must be a plain object and include every top-level
   * key the MCP `inputSchema` declares required. Detailed argument validation is
   * left to the server, which owns the authoritative schema.
   */
  validate(args: unknown): Record<string, unknown> {
    const value = args === undefined || args === null ? {} : args;
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new ValidationError(
        `Invalid arguments for tool "${this.definition.name}": expected an object`,
      );
    }
    const record = value as Record<string, unknown>;
    const missing = this.requiredKeys.filter((key) => !(key in record));
    if (missing.length > 0) {
      throw new ValidationError(
        `Invalid arguments for tool "${this.definition.name}": missing required ${missing.join(", ")}`,
      );
    }
    return record;
  }

  /** Execute the tool via `tools/call`. Always resolves a {@link ToolResult}. */
  async execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult<McpToolOutput>> {
    const start = Date.now();
    try {
      if (ctx.signal?.aborted === true) {
        throw ctx.signal.reason instanceof Error
          ? ctx.signal.reason
          : new Error(`Tool "${this.definition.name}" aborted`);
      }

      const options: { timeoutMs?: number; signal?: AbortSignal } = {};
      if (this.timeoutMs !== undefined) options.timeoutMs = this.timeoutMs;
      if (ctx.signal !== undefined) options.signal = ctx.signal;

      const { content, isError } = await this.client.callTool(this.toolName, args, options);
      const text = extractText(content);

      if (isError) {
        const error = new ToolError(
          text !== "" ? text : `MCP tool "${this.definition.name}" reported an error`,
          { toolName: this.definition.name, details: { server: this.serverName } },
        );
        return {
          ok: false,
          output: { content, text, isError: true },
          error: error.toJSON(),
          durationMs: Date.now() - start,
        };
      }

      return {
        ok: true,
        output: { content, text, isError: false },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        output: null as unknown as McpToolOutput,
        error: serializeError(err),
        durationMs: Date.now() - start,
      };
    }
  }
}

/** Concatenate all `text` content blocks with newlines. */
export function extractText(content: readonly McpContentBlock[]): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

/** Read the top-level `required` array from an MCP input schema. */
function readRequired(schema: Record<string, unknown> | undefined): string[] {
  const required = asArray(schema?.required);
  if (required === undefined) return [];
  return required.filter((key): key is string => typeof key === "string");
}

/** Convert an MCP JSON-Schema into the product {@link ToolParameterSchema} (best-effort). */
export function toParameterSchema(schema: unknown): ToolParameterSchema {
  const record = asRecord(schema);
  if (record === undefined) return { type: "object", properties: {} };

  const out: ToolParameterSchema = { type: mapSchemaType(record.type) };

  const description = asString(record.description);
  if (description !== undefined) out.description = description;

  const required = asArray(record.required)?.filter(
    (key): key is string => typeof key === "string",
  );
  if (required !== undefined && required.length > 0) out.required = required;

  const properties = asRecord(record.properties);
  if (properties !== undefined) {
    const converted: Record<string, ToolParameterSchema> = {};
    for (const [key, value] of Object.entries(properties)) {
      converted[key] = toParameterSchema(value);
    }
    out.properties = converted;
  }

  if (record.items !== undefined) out.items = toParameterSchema(record.items);

  const enumValues = asArray(record.enum);
  if (enumValues !== undefined) {
    out.enum = enumValues.filter(
      (v): v is string | number | boolean | null =>
        v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean",
    );
  }

  if ("default" in record) out.default = record.default;

  return out;
}

/** Map a JSON-Schema `type` onto a product schema type, defaulting to `object`. */
function mapSchemaType(type: unknown): ToolParameterSchema["type"] {
  if (typeof type === "string" && SCHEMA_TYPES.has(type as ToolParameterSchema["type"])) {
    return type as ToolParameterSchema["type"];
  }
  if (Array.isArray(type)) {
    for (const candidate of type) {
      if (
        typeof candidate === "string" &&
        candidate !== "null" &&
        SCHEMA_TYPES.has(candidate as ToolParameterSchema["type"])
      ) {
        return candidate as ToolParameterSchema["type"];
      }
    }
  }
  return "object";
}
