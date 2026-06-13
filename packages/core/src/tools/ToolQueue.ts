/**
 * ToolQueue — bounded-concurrency FIFO execution of tool calls.
 *
 * Wraps a {@link ToolExecutor} and runs enqueued calls with at most
 * `maxConcurrent` (default 4) in flight. Order of *start* is strictly FIFO.
 * Abort signals propagate: calls whose `ctx.signal` is already aborted when
 * they would start are resolved as failed results without executing.
 */

import { ToolError, serializeError } from "ultracode-shared";
import type { ToolContext, ToolResult } from "ultracode-shared";
import type { ToolExecutor } from "./ToolExecutor.js";

/** A single queued tool invocation. */
export interface ToolQueueItem {
  /** Registered tool name. */
  name: string;
  /** Raw arguments (validated by the executor/tool). */
  args: unknown;
  /** Execution context; its `signal` aborts the call. */
  ctx: ToolContext;
}

/** Options for {@link ToolQueue}. */
export interface ToolQueueOptions {
  /** Maximum number of concurrently running tools. Default `4`, min `1`. */
  maxConcurrent?: number;
}

interface Job {
  item: ToolQueueItem;
  resolve: (result: ToolResult<unknown>) => void;
}

/** Default maximum concurrency of the queue. */
export const DEFAULT_MAX_CONCURRENT = 4;

/**
 * FIFO queue with bounded parallelism on top of a {@link ToolExecutor}.
 */
export class ToolQueue {
  private readonly maxConcurrent: number;
  private readonly queue: Job[] = [];
  private active = 0;

  /**
   * @param executor - executor used to run each queued call.
   * @param options - concurrency options.
   */
  constructor(
    private readonly executor: ToolExecutor,
    options: ToolQueueOptions = {},
  ) {
    const raw = options.maxConcurrent;
    this.maxConcurrent =
      typeof raw === "number" && Number.isFinite(raw) && raw >= 1
        ? Math.floor(raw)
        : DEFAULT_MAX_CONCURRENT;
  }

  /** Number of calls currently executing. */
  get running(): number {
    return this.active;
  }

  /** Number of calls waiting to start. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Enqueue a tool call. Resolves with the call's {@link ToolResult} once it
   * has run (or has been refused due to an aborted signal). **Never rejects.**
   */
  enqueue<T = unknown>(item: ToolQueueItem): Promise<ToolResult<T>> {
    return new Promise<ToolResult<T>>((resolve) => {
      this.queue.push({ item, resolve: resolve as (r: ToolResult<unknown>) => void });
      this.pump();
    });
  }

  /**
   * Convenience: enqueue many calls and await all results (same order as the
   * input). Never rejects — failures are `ok: false` results.
   */
  runAll<T = unknown>(items: readonly ToolQueueItem[]): Promise<ToolResult<T>[]> {
    return Promise.all(items.map((item) => this.enqueue<T>(item)));
  }

  /** Start queued jobs while capacity allows. */
  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      this.active += 1;

      const { name, args, ctx } = job.item;
      const signal = ctx.signal;
      const run: Promise<ToolResult<unknown>> =
        signal?.aborted === true
          ? Promise.resolve<ToolResult<unknown>>({
              ok: false,
              output: null,
              error: serializeError(
                signal.reason ??
                  new ToolError(`Tool "${name}" was aborted while queued`, {
                    toolName: name,
                  }),
              ),
              durationMs: 0,
            })
          : this.executor.execute(name, args, ctx);

      void run
        .then(
          (result) => result,
          // Defensive: the executor contract says it never rejects.
          (err): ToolResult<unknown> => ({
            ok: false,
            output: null,
            error: serializeError(err),
            durationMs: 0,
          }),
        )
        .then((result) => {
          // Release capacity *before* resolving so callers awaiting the
          // result observe consistent running/pending counters.
          this.active -= 1;
          job.resolve(result);
          this.pump();
        });
    }
  }
}
