/**
 * `grep` — regex search across a directory tree.
 *
 * Category: search • Default permission: always (architecture tool table).
 * Pure-JS implementation (recursive walk; no ripgrep/grep binaries — Windows
 * compatible). Skips `node_modules`, `.git`, `dist`, `coverage` and binary
 * files; reports 1-based line numbers; caps results at `max_matches`.
 *
 * ReDoS containment: the walk-and-match runs in a `node:worker_threads` worker
 * (see {@link file:./grepWorker.ts}). A user-supplied regex can exhibit
 * super-linear (catastrophic) backtracking; because `RegExp.prototype.test()`
 * is synchronous and cannot be interrupted mid-input, a single pathological
 * non-matching line (e.g. `"a".repeat(9999)+"b"` against `(a+)+$`) would block
 * the host event loop for minutes. Running it in a worker lets the host enforce
 * the effective per-tool timeout by hard-terminating the worker, turning the
 * previously-toothless tool timeout into a real abort path and returning a
 * {@link ToolTimeoutError} (`ok: false`) instead of hanging.
 */

import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { ToolError, ToolTimeoutError } from "ultracode-shared";
import { z } from "zod";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import type { GrepWorkerInput, GrepWorkerResult } from "./grepWorker.js";

/** Default cap on returned matches when not configured. */
export const DEFAULT_MAX_MATCHES = 1000;
/** Files larger than this are skipped during search (bytes). */
const MAX_SEARCH_FILE_BYTES = 5 * 1024 * 1024;
/** Match line text is capped at this many code points (for reporting). */
const MAX_LINE_CHARS = 500;
/**
 * Default effective grep timeout (ms) when none is configured. Mirrors the
 * executor's {@link DEFAULT_TOOL_TIMEOUT_SECONDS} (30 s) so a direct tool use
 * (no {@link ToolExecutor}) still bounds catastrophic-backtracking regexes.
 */
export const DEFAULT_GREP_TIMEOUT_MS = 30_000;

const schema = z.object({
  /** JavaScript regular expression source. */
  pattern: z.string().min(1),
  /** Directory (or single file) to search. Defaults to cwd. */
  path: z.string().optional(),
  /** Regex flags; only `i`, `m`, `s`, `u` are allowed. */
  flags: z
    .string()
    .regex(/^[imsu]*$/, "only the flags i, m, s and u are allowed")
    .optional(),
  /** Per-call cap on matches (cannot exceed the configured maximum). */
  max_matches: z.number().int().min(1).optional(),
});

/** A single grep match. */
export interface GrepMatch {
  /** File path relative to the search root (always `/`-separated). */
  file: string;
  /** 1-based line number. */
  line: number;
  /** Matching line text (truncated to {@link MAX_LINE_CHARS}). */
  text: string;
}

/** Successful output of the `grep` tool. */
export interface GrepToolOutput {
  /** All matches found (capped). */
  matches: GrepMatch[];
  /** Number of matches returned. */
  count: number;
  /** `true` when the match cap stopped the search early. */
  limitReached: boolean;
}

/** Construction options for {@link GrepTool}. */
export interface GrepToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
  /** Hard cap on matches (config `tools.grep.maxMatches`). Default 1000. */
  maxMatches?: number;
  /**
   * Effective timeout in milliseconds before the search worker is terminated
   * (config `tools.grep.timeout`, in seconds, × 1000). Default 30 s. This is
   * the real ReDoS backstop — see the file header.
   */
  timeoutMs?: number;
}

/**
 * Resolve the on-disk path of the grep worker, cross-environment:
 * - production (`dist/`): the compiled `grepWorker.js` sits beside this file;
 * - vitest: only the `grepWorker.ts` source exists and vitest's transform
 *   pipeline handles `.ts` workers.
 * Resolution is plain `node:url` + `existsSync`, never a string `eval`.
 */
function resolveWorkerUrl(): URL {
  const js = new URL("./grepWorker.js", import.meta.url);
  if (existsSync(fileURLToPath(js))) return js;
  return new URL("./grepWorker.ts", import.meta.url);
}

/** Pure-JS recursive regex search (executed in a worker thread). */
export class GrepTool extends BaseTool<typeof schema, GrepToolOutput> {
  readonly definition: ToolDefinition = {
    name: "grep",
    description: "Search files for a regular expression (pure JS, recursive)",
    category: "search",
    parameters: {
      type: "object",
      required: ["pattern"],
      properties: {
        pattern: { type: "string", description: "Regular expression to search for" },
        path: { type: "string", description: "Directory or file to search (default: cwd)" },
        flags: { type: "string", description: "Regex flags (i, m, s, u)" },
        max_matches: { type: "integer", description: "Cap on returned matches" },
      },
    },
    permission: "always",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  private readonly maxMatches: number;
  private readonly timeoutMs: number;

  constructor(options: GrepToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.maxMatches =
      typeof options.maxMatches === "number" && options.maxMatches >= 1
        ? Math.floor(options.maxMatches)
        : DEFAULT_MAX_MATCHES;
    this.timeoutMs =
      typeof options.timeoutMs === "number" &&
      Number.isFinite(options.timeoutMs) &&
      options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_GREP_TIMEOUT_MS;
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<GrepToolOutput>> {
    this.throwIfAborted(ctx);
    const name = this.definition.name;
    const root = await this.guard.resolve(ctx.cwd, args.path ?? ".", name);

    // Fail fast on a syntactically-invalid regex (same error shape as before),
    // before paying for a worker thread.
    try {
      new RegExp(args.pattern, args.flags ?? "");
    } catch (err) {
      throw new ToolError(`Invalid regular expression: ${(err as Error).message}`, {
        toolName: name,
        cause: err,
      });
    }

    const limit = Math.min(args.max_matches ?? this.maxMatches, this.maxMatches);

    const rootStat = await fs.stat(root).catch(() => {
      throw new ToolError(`Search path not found: "${args.path ?? "."}"`, { toolName: name });
    });

    const input: GrepWorkerInput = {
      pattern: args.pattern,
      flags: args.flags ?? "",
      root,
      isFile: rootStat.isFile(),
      base: rootStat.isFile() ? path.dirname(root) : root,
      limit,
      maxFileBytes: MAX_SEARCH_FILE_BYTES,
      maxLineChars: MAX_LINE_CHARS,
    };

    const result = await this.runInWorker(input, ctx);
    if (!result.ok) {
      // The worker rebuilds the regex from the same validated source, so a
      // construction failure here is unexpected; surface it as a tool error.
      throw new ToolError(`grep search failed: ${result.error.message}`, {
        toolName: name,
        cause: result.error,
      });
    }
    return {
      output: {
        matches: result.matches,
        count: result.matches.length,
        limitReached: result.limitReached,
      },
      truncated: result.limitReached,
    };
  }

  /**
   * Run the search worker, enforcing the effective timeout and the abort
   * signal by hard-terminating the worker. Resolves with the worker's
   * structured result; rejects with {@link ToolTimeoutError} on timeout or the
   * abort reason on cancellation.
   */
  private runInWorker(input: GrepWorkerInput, ctx: ToolContext): Promise<GrepWorkerResult> {
    const name = this.definition.name;
    return new Promise<GrepWorkerResult>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(resolveWorkerUrl(), { workerData: input });

      const cleanup = (): void => {
        clearTimeout(timer);
        ctx.signal?.removeEventListener("abort", onAbort);
        void worker.terminate();
      };
      const settleResolve = (value: GrepWorkerResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const settleReject = (err: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const timer = setTimeout(() => {
        settleReject(
          new ToolTimeoutError(`grep timed out after ${this.timeoutMs}ms and was terminated`, {
            toolName: name,
          }),
        );
      }, this.timeoutMs);
      // Do not keep the process alive solely for this timer.
      if (typeof timer.unref === "function") timer.unref();

      const onAbort = (): void => {
        const reason = ctx.signal?.reason;
        settleReject(
          new ToolTimeoutError("grep aborted", {
            toolName: name,
            cause: reason instanceof Error ? reason : undefined,
          }),
        );
      };
      if (ctx.signal?.aborted) {
        // Already aborted before the worker could do anything.
        onAbort();
        return;
      }
      ctx.signal?.addEventListener("abort", onAbort, { once: true });

      worker.once("message", (msg: GrepWorkerResult) => settleResolve(msg));
      worker.once("error", (err: Error) => {
        settleReject(
          new ToolError(`grep worker failed: ${err.message}`, { toolName: name, cause: err }),
        );
      });
      worker.once("exit", (code: number) => {
        // A clean exit without a prior message/error is unexpected; termination
        // (timeout/abort) and crashes are already handled by the timer/abort/
        // error paths, which set `settled` first.
        if (!settled) {
          settleReject(
            new ToolError(`grep worker exited unexpectedly (code ${code})`, { toolName: name }),
          );
        }
      });
    });
  }
}
