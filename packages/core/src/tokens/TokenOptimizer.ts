/**
 * The {@link TokenOptimizer}: runs a chain of {@link OptimizerStage}s and
 * reports an **honest** before/after token reduction.
 *
 * The optimizer measures the payload with the injected {@link TokenCounter}
 * before the chain and after *every* stage, so the per-stage `saved` figures
 * sum to the total saving and never hide a regression: a stage that saves
 * nothing reports `0`, and a (theoretically) inflating stage reports a negative
 * `saved` rather than being silently clamped.
 */

import type { Logger } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import type { OptimizeContext, OptimizerStage, PromptPayload, TokenStats } from "./types.js";
import type { TokenCounter } from "./TokenCounter.js";
import { HeuristicTokenCounter } from "./TokenCounter.js";
import {
  ConversationCompactionStage,
  DedupContextStage,
  SystemPromptMinifyStage,
  ToolSchemaSlimStage,
  WhitespaceNormalizeStage,
} from "./stages.js";

/** Per-stage saving entry in an {@link OptimizeResult}. */
export interface StageSaving {
  /** {@link OptimizerStage.name} of the stage. */
  stage: string;
  /** Tokens saved by this stage (before − after); may be `0` or negative. */
  saved: number;
}

/** The full result of {@link TokenOptimizer.optimize}. */
export interface OptimizeResult {
  /** The optimized payload (safe to send to the provider). */
  payload: PromptPayload;
  /** Token stats before any stage ran. */
  before: TokenStats;
  /** Token stats after the whole chain. */
  after: TokenStats;
  /**
   * Total reduction as a percentage of `before.total`, rounded to one decimal.
   * `0` when `before.total` is `0`. Negative is possible and reported honestly.
   */
  reductionPct: number;
  /** Per-stage savings, in execution order. */
  perStage: StageSaving[];
}

/** Construction options for {@link TokenOptimizer}. */
export interface TokenOptimizerOptions {
  /** Token counter used for all measurements. */
  counter: TokenCounter;
  /** Ordered stage chain. */
  stages: OptimizerStage[];
  /** Optional logger for a one-line reduction summary. */
  logger?: Logger;
}

/**
 * Computes {@link TokenStats} for a payload with a given counter.
 */
export function computeStats(payload: PromptPayload, counter: TokenCounter): TokenStats {
  const system = counter.count(payload.system);
  const tools = toolsTokens(payload, counter);
  const messages = counter.countMessages(payload.messages);
  const context = counter.count(payload.context ?? "");
  return { system, tools, messages, context, total: system + tools + messages + context };
}

/** Token cost of the tool definitions (name + description + schema JSON). */
function toolsTokens(payload: PromptPayload, counter: TokenCounter): number {
  let n = 0;
  for (const t of payload.tools) {
    n += counter.count(t.name) + counter.count(t.description);
    try {
      n += counter.count(JSON.stringify(t.parameters) ?? "");
    } catch {
      /* ignore unserializable schema */
    }
  }
  return n;
}

/**
 * Runs a deterministic stage chain over a {@link PromptPayload} and reports the
 * measured reduction.
 *
 * @example
 * ```ts
 * const optimizer = createDefaultOptimizer();
 * const { payload, reductionPct } = await optimizer.optimize(payload, {
 *   counter: new HeuristicTokenCounter(),
 *   tokenBudget: 8_000,
 * });
 * ```
 */
export class TokenOptimizer {
  private readonly counter: TokenCounter;
  private readonly stages: OptimizerStage[];
  private readonly logger: Logger;

  constructor(options: TokenOptimizerOptions) {
    this.counter = options.counter;
    this.stages = [...options.stages];
    this.logger = options.logger ?? new NoopLogger();
  }

  /**
   * Apply the stage chain. If a {@link ConversationCompactionStage} is present
   * and was configured with a summarizer, its async path is used; all other
   * stages are synchronous. Measures before/after each stage.
   */
  public async optimize(payload: PromptPayload, ctx?: Partial<OptimizeContext>): Promise<OptimizeResult> {
    const fullCtx: OptimizeContext = {
      counter: ctx?.counter ?? this.counter,
      ...(ctx?.prompt !== undefined ? { prompt: ctx.prompt } : {}),
      ...(ctx?.tokenBudget !== undefined ? { tokenBudget: ctx.tokenBudget } : {}),
    };

    const before = computeStats(payload, fullCtx.counter);
    let current = payload;
    let runningTotal = before.total;
    const perStage: StageSaving[] = [];

    for (const stage of this.stages) {
      let next: PromptPayload;
      if (stage instanceof ConversationCompactionStage) {
        next = await stage.applyAsync(current, fullCtx);
      } else {
        next = stage.apply(current, fullCtx);
      }
      const afterStage = computeStats(next, fullCtx.counter).total;
      perStage.push({ stage: stage.name, saved: runningTotal - afterStage });
      runningTotal = afterStage;
      current = next;
    }

    const after = computeStats(current, fullCtx.counter);
    const reductionPct =
      before.total > 0 ? round1(((before.total - after.total) / before.total) * 100) : 0;

    this.logger.info("tokens optimized", {
      before: before.total,
      after: after.total,
      reductionPct,
    });

    return { payload: current, before, after, reductionPct, perStage };
  }
}

/** Round to one decimal place. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Options for {@link createDefaultOptimizer}. */
export interface CreateDefaultOptimizerOptions {
  /** Counter to use. Defaults to {@link HeuristicTokenCounter}. */
  counter?: TokenCounter;
  /** Logger forwarded to the optimizer. */
  logger?: Logger;
  /** Maximum tool-description length. */
  maxToolDescriptionChars?: number;
  /** Immutable-span regexes forwarded to {@link SystemPromptMinifyStage}. */
  immutableMarkers?: RegExp[];
  /**
   * Include the {@link ConversationCompactionStage} in the chain. Default
   * `true`; compaction is a no-op unless an `OptimizeContext.tokenBudget` is
   * provided and exceeded.
   */
  includeCompaction?: boolean;
  /** keepHead for compaction. */
  keepHead?: number;
  /** keepTail for compaction. */
  keepTail?: number;
}

/**
 * Build a {@link TokenOptimizer} with the recommended default chain:
 *
 * 1. {@link DedupContextStage} — fold byte-identical context blocks.
 * 2. {@link WhitespaceNormalizeStage} — collapse blank lines (code-safe).
 * 3. {@link SystemPromptMinifyStage} — lossless system-prompt minify
 *    (immutable-span aware).
 * 4. {@link ToolSchemaSlimStage} — slim long tool descriptions (keeps all
 *    tools + their schemas).
 * 5. {@link ConversationCompactionStage} — only when over `tokenBudget`.
 *
 * All five are safe by construction; the first four are lossless/idempotent.
 */
export function createDefaultOptimizer(options: CreateDefaultOptimizerOptions = {}): TokenOptimizer {
  const counter = options.counter ?? new HeuristicTokenCounter();
  const stages: OptimizerStage[] = [
    new DedupContextStage(),
    new WhitespaceNormalizeStage(),
    new SystemPromptMinifyStage(
      options.immutableMarkers ? { immutableMarkers: options.immutableMarkers } : {},
    ),
    new ToolSchemaSlimStage(
      options.maxToolDescriptionChars !== undefined
        ? { maxDescriptionChars: options.maxToolDescriptionChars }
        : {},
    ),
  ];
  if (options.includeCompaction !== false) {
    stages.push(
      new ConversationCompactionStage({
        ...(options.keepHead !== undefined ? { keepHead: options.keepHead } : {}),
        ...(options.keepTail !== undefined ? { keepTail: options.keepTail } : {}),
      }),
    );
  }
  const opts: TokenOptimizerOptions = { counter, stages };
  if (options.logger !== undefined) opts.logger = options.logger;
  return new TokenOptimizer(opts);
}
