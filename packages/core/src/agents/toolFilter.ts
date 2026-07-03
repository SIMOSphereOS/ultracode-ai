/**
 * Tool filtering for agents.
 *
 * Agents restrict the global tool set via `enabledTools` (allow-list, wins
 * when present) and `disabledTools` (deny-list). Both support `*` wildcards
 * (e.g. `"git_*"`). {@link FilteredToolRunner} wraps an {@link IToolRunner}
 * with such a filter while preserving the never-throw execution contract.
 */

import type { AgentDefinition, ToolContext, ToolDefinition, ToolResult } from "ultracode-shared";
import { serializeError, ToolNotFoundError } from "ultracode-shared";
import type { IToolRunner } from "../execution/types.js";

/** Escape all regex metacharacters except `*`. */
function escapeForPattern(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Test a tool name against a pattern. Patterns without `*` match exactly;
 * `*` matches any (possibly empty) substring — e.g. `"git_*"` matches
 * `"git_status"` and `"git_"`, but not `"git"`.
 */
export function matchesToolPattern(pattern: string, name: string): boolean {
  if (!pattern.includes("*")) return pattern === name;
  const regex = new RegExp(`^${escapeForPattern(pattern).replace(/\*/g, ".*")}$`);
  return regex.test(name);
}

/** `true` when `name` matches at least one of the given patterns. */
function matchesAny(patterns: readonly string[], name: string): boolean {
  return patterns.some((p) => matchesToolPattern(p, name));
}

/**
 * Build the predicate deciding tool availability for an agent definition.
 * When `enabledTools` is present it acts as an allow-list and overrides
 * `disabledTools`; otherwise every tool not matching `disabledTools` is
 * available.
 */
export function toolPredicateFor(
  definition: Pick<AgentDefinition, "enabledTools" | "disabledTools">,
): (name: string) => boolean {
  const enabled = definition.enabledTools;
  if (enabled !== undefined) {
    return (name) => matchesAny(enabled, name);
  }
  const disabled = definition.disabledTools ?? [];
  return (name) => !matchesAny(disabled, name);
}

/**
 * Resolve the effective tool definitions for an agent against the full
 * registry listing.
 */
export function resolveEffectiveTools(
  definition: Pick<AgentDefinition, "enabledTools" | "disabledTools">,
  allTools: readonly ToolDefinition[],
): ToolDefinition[] {
  const allowed = toolPredicateFor(definition);
  return allTools.filter((tool) => allowed(tool.name));
}

/**
 * An {@link IToolRunner} view restricted to the tools an agent may use.
 *
 * - `list()` only returns allowed tools.
 * - `execute()` refuses disallowed tools with an `ok: false` result carrying
 *   a serialised {@link ToolNotFoundError} — it never throws.
 */
export class FilteredToolRunner implements IToolRunner {
  private readonly inner: IToolRunner;
  private readonly allowed: (name: string) => boolean;

  constructor(inner: IToolRunner, allowed: (name: string) => boolean) {
    this.inner = inner;
    this.allowed = allowed;
  }

  /** List only the tools available through this filtered view. */
  list(): ToolDefinition[] {
    return this.inner.list().filter((tool) => this.allowed(tool.name));
  }

  /** Execute an allowed tool; refuse disallowed ones with `ok: false`. */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (!this.allowed(name)) {
      return {
        ok: false,
        output: null,
        error: serializeError(
          new ToolNotFoundError(`Tool "${name}" is not available to this agent`, {
            toolName: name,
          }),
        ),
        durationMs: 0,
      };
    }
    return this.inner.execute(name, args, ctx);
  }
}
