/**
 * `@ultracode/core/tokens` — deterministic, offline token optimization.
 *
 * Public surface:
 * - {@link TokenCounter} / {@link HeuristicTokenCounter} — offline token
 *   estimation.
 * - {@link PromptPayload} / {@link TokenStats} / {@link OptimizerStage} —
 *   the prompt model and the stage interface.
 * - The five stages and their options.
 * - {@link TokenOptimizer} / {@link createDefaultOptimizer} — the runner and a
 *   sensible default chain.
 * - {@link CacheHint} and the cache helpers — provider prompt-caching hints.
 * - The core-local `tokens.optimized` reporting event.
 *
 * See `README.md` in this directory for the architecture and the *honest*
 * limits of every technique.
 */

export type { TokenCounter, ProviderTokenCounter } from "./TokenCounter.js";
export { HeuristicTokenCounter } from "./TokenCounter.js";

export type {
  PromptPayload,
  TokenStats,
  OptimizeContext,
  OptimizerStage,
  CacheHint,
} from "./types.js";

export {
  DedupContextStage,
  DEDUP_PLACEHOLDER,
  WhitespaceNormalizeStage,
  SystemPromptMinifyStage,
  DEFAULT_IMMUTABLE_OPEN,
  DEFAULT_IMMUTABLE_CLOSE,
  ToolSchemaSlimStage,
  DEFAULT_TOOL_DESC_MAX,
  ConversationCompactionStage,
  omittedNote,
} from "./stages.js";
export type {
  SystemPromptMinifyOptions,
  ToolSchemaSlimOptions,
  ConversationCompactionOptions,
} from "./stages.js";

export {
  TokenOptimizer,
  createDefaultOptimizer,
  computeStats,
} from "./TokenOptimizer.js";
export type {
  TokenOptimizerOptions,
  CreateDefaultOptimizerOptions,
  OptimizeResult,
  StageSaving,
} from "./TokenOptimizer.js";

export {
  computePrefixKey,
  cachePrefixHint,
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
} from "./cache.js";

export {
  reportOptimization,
  toTokensOptimizedEvent,
  TOKENS_OPTIMIZED_EVENT,
} from "./events.js";
export type { TokensOptimizedEvent } from "./events.js";
