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

// Centralised default parameters / magic values. The constants already
// re-exported via cache.js, stages.js and events.js
// (ANTHROPIC_MAX_CACHE_BREAKPOINTS, DEDUP_PLACEHOLDER, DEFAULT_IMMUTABLE_OPEN,
// DEFAULT_IMMUTABLE_CLOSE, DEFAULT_TOOL_DESC_MAX, TOKENS_OPTIMIZED_EVENT) keep
// their existing entry points; the remainder are surfaced here.
export {
  PREFIX_KEY_HEX_LENGTH,
  BLOCK_HASH_HEX_LENGTH,
  DEFAULT_KEEP_HEAD,
  KEEP_HEAD_FLOOR,
  DEFAULT_KEEP_TAIL,
  KEEP_TAIL_FLOOR,
  SUMMARIZER_TRANSCRIPT_MAX_CHARS,
  SUMMARIZER_MAX_TOKENS,
  SUMMARIZER_SYSTEM_PROMPT,
  PER_MESSAGE_OVERHEAD,
  PER_TOOL_CALL_OVERHEAD,
  WORD_WEIGHT,
  CHARS_PER_TOKEN,
  WORD_TO_TOKEN,
  PUNCTUATION_PENALTY,
  CJK_OR_ASTRAL_PENALTY,
  MIN_TOKENS_NON_EMPTY,
} from "./defaults.js";
