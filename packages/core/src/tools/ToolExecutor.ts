/**
 * ToolExecutor — the single gateway through which tools are executed.
 *
 * Responsibilities (in order):
 * 1. Tool lookup (`TOOL_NOT_FOUND` as an `ok: false` result).
 * 2. Permission resolution from {@link UltraCodeConfig} (`tools.disabled` /
 *    `tools.enabled` / `tools.perTool[name].permission`) merged with the
 *    tool's own default. `"never"` → denied; `"ask"` → `ctx.confirm`, with a
 *    missing confirm callback treated as **deny**.
 * 3. Argument validation via the tool's `validate` (ValidationError → result).
 * 4. Timeout enforcement via `AbortSignal` + timer (`perTool[name].timeout`
 *    in **seconds**, default 30) → `TOOL_TIMEOUT` result.
 * 5. Total exception safety: any thrown/rejected error becomes an `ok: false`
 *    result with `serializeError`.
 * 6. Output truncation to `MAX_TOOL_OUTPUT_CHARS` (`truncated: true`).
 * 7. `durationMs` is always set (measured by the executor).
 * 8. Optional `tool.executed` event emission on the {@link IEventBus}.
 */

import {
  MAX_TOOL_OUTPUT_CHARS,
  ToolError,
  ToolNotFoundError,
  ToolPermissionDeniedError,
  ToolTimeoutError,
  isPlainObject,
  serializeError,
  truncate,
} from "ultracode-shared";
import type {
  IEventBus,
  Logger,
  ToolContext,
  ToolPermission,
  ToolResult,
  UltraCodeConfig,
} from "ultracode-shared";
import type { ToolRegistry } from "./ToolRegistry.js";

/** Default per-tool execution timeout, in seconds. */
export const DEFAULT_TOOL_TIMEOUT_SECONDS = 30;

/** Truncate a single string value to the global output budget. */
function truncateString(value: string): { value: string; changed: boolean } {
  // `length` (UTF-16 units) is an upper bound on code points, so short strings
  // can skip the (potentially expensive) code-point walk entirely.
  if (value.length <= MAX_TOOL_OUTPUT_CHARS) return { value, changed: false };
  const truncated = truncate(value, MAX_TOOL_OUTPUT_CHARS);
  return { value: truncated, changed: truncated !== value };
}

/**
 * Apply the global output budget to a tool result payload.
 *
 * Strings are truncated directly; plain objects have their top-level string
 * properties truncated (covers `content`, `stdout`, `diff`, … without
 * reshaping the payload). Other shapes pass through unchanged.
 */
function truncateOutput(output: unknown): { output: unknown; truncated: boolean } {
  if (typeof output === "string") {
    const r = truncateString(output);
    return { output: r.value, truncated: r.changed };
  }
  if (isPlainObject(output)) {
    let copy: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(output)) {
      if (typeof value === "string") {
        const r = truncateString(value);
        if (r.changed) {
          copy ??= { ...output };
          copy[key] = r.value;
        }
      }
    }
    return { output: copy ?? output, truncated: copy !== undefined };
  }
  return { output, truncated: false };
}

/** Best-effort, size-bounded JSON preview of tool arguments for prompts. */
function previewArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args);
    return truncate(json ?? "undefined", 500);
  } catch {
    return "[unserializable arguments]";
  }
}

/**
 * Executes registered tools with permission checks, timeouts, exception
 * containment, output truncation and event emission.
 */
export class ToolExecutor {
  /**
   * @param registry - registry to resolve tool names against.
   * @param config - resolved configuration (permissions / timeouts).
   * @param logger - structured logger.
   * @param events - optional event bus for `tool.executed` events.
   */
  constructor(
    private readonly registry: ToolRegistry,
    private readonly config: UltraCodeConfig,
    private readonly logger: Logger,
    private readonly events?: IEventBus,
  ) {}

  /**
   * Execute the named tool. **Never rejects** — every failure mode is
   * reported as a {@link ToolResult} with `ok: false`.
   *
   * @param name - registered tool name.
   * @param args - raw (unvalidated) arguments.
   * @param ctx - execution context (cwd, env, signal, confirm, logger).
   */
  async execute<T = unknown>(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult<T>> {
    const start = Date.now();

    const finish = (result: ToolResult<unknown>): ToolResult<T> => {
      const final: ToolResult<T> = {
        ...(result as ToolResult<T>),
        durationMs: Date.now() - start,
      };
      this.events?.emit({
        type: "tool.executed",
        toolName: name,
        ok: final.ok,
        durationMs: final.durationMs,
      });
      return final;
    };

    const fail = (err: unknown): ToolResult<T> =>
      finish({
        ok: false,
        output: null,
        error: serializeError(err),
        durationMs: 0,
      });

    // (0) Lookup -------------------------------------------------------------
    const tool = this.registry.get(name);
    if (!tool) {
      return fail(new ToolNotFoundError(`Tool "${name}" is not registered`, { toolName: name }));
    }

    // (1) Permission ----------------------------------------------------------
    const toolsConfig = this.config.tools;
    const isDisabled =
      toolsConfig.disabled.includes(name) && !toolsConfig.enabled.includes(name);
    if (isDisabled) {
      return fail(
        new ToolPermissionDeniedError(`Tool "${name}" is disabled by configuration`, {
          toolName: name,
        }),
      );
    }

    const configured = toolsConfig.perTool[name]?.permission;
    const permission: ToolPermission = configured ?? tool.definition.permission;

    if (permission === "never") {
      return fail(
        new ToolPermissionDeniedError(
          `Tool "${name}" is blocked (permission "never")`,
          { toolName: name },
        ),
      );
    }

    if (permission === "ask") {
      if (typeof ctx.confirm !== "function") {
        return fail(
          new ToolPermissionDeniedError(
            `Tool "${name}" requires confirmation but no confirmation channel is available`,
            { toolName: name },
          ),
        );
      }
      let confirmed = false;
      try {
        confirmed = await ctx.confirm(
          `Allow tool "${name}" to run with arguments ${previewArgs(args)}?`,
        );
      } catch (err) {
        return fail(
          new ToolPermissionDeniedError(`Confirmation for tool "${name}" failed`, {
            toolName: name,
            cause: err,
          }),
        );
      }
      if (!confirmed) {
        return fail(
          new ToolPermissionDeniedError(`Tool "${name}" was denied by the user`, {
            toolName: name,
          }),
        );
      }
    }

    // (2) Validation ----------------------------------------------------------
    let validArgs: unknown;
    try {
      validArgs = tool.validate(args);
    } catch (err) {
      return fail(err);
    }

    // (3) Timeout + execution ---------------------------------------------------
    const rawTimeout = toolsConfig.perTool[name]?.timeout;
    const timeoutSeconds =
      typeof rawTimeout === "number" && Number.isFinite(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : DEFAULT_TOOL_TIMEOUT_SECONDS;
    const timeoutMs = timeoutSeconds * 1000;

    const controller = new AbortController();
    const upstream = ctx.signal;
    let detachUpstream: (() => void) | undefined;
    if (upstream) {
      if (upstream.aborted) {
        controller.abort(upstream.reason);
      } else {
        const propagate = () => controller.abort(upstream.reason);
        upstream.addEventListener("abort", propagate, { once: true });
        detachUpstream = () => upstream.removeEventListener("abort", propagate);
      }
    }

    if (controller.signal.aborted) {
      detachUpstream?.();
      return fail(
        new ToolError(`Tool "${name}" was aborted before execution`, {
          toolName: name,
          cause: controller.signal.reason,
        }),
      );
    }

    let rejectOnTimeout!: (err: unknown) => void;
    const timeoutPromise = new Promise<never>((_, reject) => {
      rejectOnTimeout = reject;
    });
    // Avoid unhandled rejection when the tool wins the race.
    timeoutPromise.catch(() => undefined);

    const timer = setTimeout(() => {
      const err = new ToolTimeoutError(
        `Tool "${name}" timed out after ${timeoutSeconds}s`,
        { toolName: name },
      );
      controller.abort(err);
      rejectOnTimeout(err);
    }, timeoutMs);

    try {
      const childCtx: ToolContext = { ...ctx, signal: controller.signal };
      const raw = await Promise.race([
        Promise.resolve(tool.execute(validArgs, childCtx)),
        timeoutPromise,
      ]);

      // (4) Normalise + truncate ------------------------------------------------
      if (!isPlainObject(raw) || typeof (raw as { ok?: unknown }).ok !== "boolean") {
        return fail(
          new ToolError(`Tool "${name}" returned a malformed result`, { toolName: name }),
        );
      }
      const result = raw as ToolResult<unknown>;
      if (!result.ok && result.error === undefined) {
        result.error = serializeError(
          new ToolError(`Tool "${name}" reported failure without an error`, {
            toolName: name,
          }),
        );
      }
      const { output, truncated } = truncateOutput(result.output);
      const final: ToolResult<unknown> = { ...result, output };
      if (truncated || result.truncated) final.truncated = true;
      return finish(final);
    } catch (err) {
      this.logger.warn(`tool "${name}" failed`, { error: serializeError(err) });
      return fail(err);
    } finally {
      clearTimeout(timer);
      detachUpstream?.();
    }
  }
}
