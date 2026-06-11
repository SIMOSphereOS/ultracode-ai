/**
 * Local execution-boundary types.
 *
 * The execution engine must not import neighbouring core modules (tools,
 * providers, …) directly. Instead it depends on this narrow, locally defined
 * runner interface, built purely from `@ultracode/shared` contract types.
 * The integrator adapts the real `ToolRegistry`/`ToolExecutor` pair to it.
 */

import type { ToolContext, ToolDefinition, ToolResult } from "@ultracode/shared";

/**
 * Narrow tool-execution boundary injected into the execution engine.
 *
 * Contract (mirrors the shared tool contract):
 * - `execute` **never rejects** — failures (including unknown tools and
 *   permission denials) are reported as a {@link ToolResult} with `ok: false`.
 * - `list` returns the static definitions of every tool available through
 *   this runner.
 */
export interface IToolRunner {
  /** Execute the named tool with the given (already-parsed) arguments. */
  execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult>;
  /** List the tool definitions available through this runner. */
  list(): ToolDefinition[];
}
