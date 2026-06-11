/**
 * Tool contracts.
 *
 * A tool is a single, named, side-effecting (or read-only) capability that an
 * agent can invoke. The cardinal rule of this contract: **tools never throw
 * from `execute`** — failures are reported as a {@link ToolResult} with
 * `ok: false` and a serialised error. `validate` is the *only* method allowed
 * to throw, and it throws exactly {@link ValidationError}.
 */

import type { SerializedError, ValidationError } from "../errors.js";
import type { Logger } from "../logger.js";

/**
 * Permission disposition for a tool.
 * - `"ask"`    — prompt the user via {@link ToolContext.confirm} before running.
 * - `"always"` — run without prompting.
 * - `"never"`  — the tool is blocked; execution must be refused.
 */
export type ToolPermission = "ask" | "always" | "never";

/** Logical grouping of tools, used for filtering and default permissions. */
export type ToolCategory =
  | "file"
  | "search"
  | "system"
  | "project"
  | "ai"
  | "utility"
  | "mcp";

/**
 * JSON-Schema-like description of a tool's accepted arguments.
 *
 * This is intentionally a pragmatic subset of JSON Schema sufficient to drive
 * LLM tool-calling and runtime validation. `properties` describes object
 * fields; `items` describes array elements; `enum` restricts a value to a fixed
 * set.
 */
export interface ToolParameterSchema {
  /** JSON Schema primitive/composite type. */
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  /** Human-readable description, surfaced to the model. */
  description?: string;
  /** For `type: "object"`, the names of required properties. */
  required?: string[];
  /** For `type: "object"`, the schema of each named property. */
  properties?: Record<string, ToolParameterSchema>;
  /** For `type: "array"`, the schema of each element. */
  items?: ToolParameterSchema;
  /** Restricts the value to one of the listed constants. */
  enum?: ReadonlyArray<string | number | boolean | null>;
  /** Default value, advisory for the model and validation. */
  default?: unknown;
}

/** Static, registry-level description of a tool. */
export interface ToolDefinition {
  /** Unique tool name (e.g. `"read"`, `"git_status"`). */
  name: string;
  /** One-line description of what the tool does. */
  description: string;
  /** Category for grouping and default permission resolution. */
  category: ToolCategory;
  /** Schema for the tool's arguments (typically an `object` schema). */
  parameters: ToolParameterSchema;
  /** Default permission disposition; may be overridden by config. */
  permission: ToolPermission;
}

/**
 * Execution context handed to a tool at call time.
 *
 * The context is the tool's *only* sanctioned window onto the outside world:
 * working directory, environment, cancellation, user confirmation and logging.
 */
export interface ToolContext {
  /** Absolute working directory the tool should resolve paths against. */
  cwd: string;
  /** Read-only snapshot of the process environment. */
  env: Readonly<Record<string, string | undefined>>;
  /** Cancellation signal; tools SHOULD abort promptly when aborted. */
  signal?: AbortSignal;
  /**
   * Request interactive confirmation for an `"ask"`-permission action.
   * Resolves `true` to proceed, `false` to refuse. Absent in non-interactive
   * contexts — tools must treat absence as "no confirmation available".
   */
  confirm?: (msg: string) => Promise<boolean>;
  /** Structured logger scoped to this execution. */
  logger: Logger;
}

/**
 * Outcome of a single tool execution. Always returned, never thrown.
 *
 * @typeParam T - shape of the successful `output` payload.
 */
export interface ToolResult<T = unknown> {
  /** `true` on success; `false` when `error` is populated. */
  ok: boolean;
  /** Result payload. On failure this is implementation-defined (often `null`). */
  output: T;
  /** Populated iff `ok === false`; a JSON-safe error description. */
  error?: SerializedError;
  /** Wall-clock execution time in milliseconds. */
  durationMs: number;
  /** `true` when `output` was truncated to respect output limits. */
  truncated?: boolean;
}

/**
 * The implementable tool interface.
 *
 * @typeParam TArgs - validated argument shape produced by {@link ITool.validate}.
 * @typeParam TOut  - successful output payload type.
 *
 * Contract:
 * - `validate(args)` parses/narrows untrusted input, throwing
 *   {@link ValidationError} on any mismatch.
 * - `execute(args, ctx)` performs the work and **always** resolves with a
 *   {@link ToolResult}; it must not reject. Permission denial, timeouts and
 *   not-found conditions are reported as `ok: false` with the appropriate
 *   serialised error code.
 */
export interface ITool<TArgs = Record<string, unknown>, TOut = unknown> {
  /** Static description used by the registry and the model. */
  readonly definition: ToolDefinition;
  /**
   * Validate and narrow raw arguments.
   * @throws {ValidationError} when `args` does not satisfy the schema.
   */
  validate(args: unknown): TArgs;
  /** Execute the tool. Resolves with a {@link ToolResult}; never rejects. */
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult<TOut>>;
}
