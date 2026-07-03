/**
 * `ultracode-core/tokens` — deterministic, offline token optimization.
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

export {
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
  cachePrefixHint,
  computePrefixKey,
} from "./cache.js";
// Centralised default parameters / magic values. The constants already
// re-exported via cache.js, stages.js and events.js
// (ANTHROPIC_MAX_CACHE_BREAKPOINTS, DEDUP_PLACEHOLDER, DEFAULT_IMMUTABLE_OPEN,
// DEFAULT_IMMUTABLE_CLOSE, DEFAULT_TOOL_DESC_MAX, TOKENS_OPTIMIZED_EVENT) keep
// their existing entry points; the remainder are surfaced here.
export {
  BLOCK_HASH_HEX_LENGTH,
  CHARS_PER_TOKEN,
  CJK_OR_ASTRAL_PENALTY,
  DEFAULT_KEEP_HEAD,
  DEFAULT_KEEP_TAIL,
  KEEP_HEAD_FLOOR,
  KEEP_TAIL_FLOOR,
  MIN_TOKENS_NON_EMPTY,
  PER_MESSAGE_OVERHEAD,
  PER_TOOL_CALL_OVERHEAD,
  PREFIX_KEY_HEX_LENGTH,
  PUNCTUATION_PENALTY,
  SUMMARIZER_MAX_TOKENS,
  SUMMARIZER_SYSTEM_PROMPT,
  SUMMARIZER_TRANSCRIPT_MAX_CHARS,
  WORD_TO_TOKEN,
  WORD_WEIGHT,
} from "./defaults.js";
export type { TokensOptimizedEvent } from "./events.js";
export {
  reportOptimization,
  TOKENS_OPTIMIZED_EVENT,
  toTokensOptimizedEvent,
} from "./events.js";
export type {
  ConversationCompactionOptions,
  SystemPromptMinifyOptions,
  ToolSchemaSlimOptions,
} from "./stages.js";
export {
  ConversationCompactionStage,
  DEDUP_PLACEHOLDER,
  DEFAULT_IMMUTABLE_CLOSE,
  DEFAULT_IMMUTABLE_OPEN,
  DEFAULT_TOOL_DESC_MAX,
  DedupContextStage,
  omittedNote,
  SystemPromptMinifyStage,
  ToolSchemaSlimStage,
  WhitespaceNormalizeStage,
} from "./stages.js";
export type { ProviderTokenCounter, TokenCounter } from "./TokenCounter.js";
export { HeuristicTokenCounter } from "./TokenCounter.js";
export type {
  CreateDefaultOptimizerOptions,
  OptimizeResult,
  StageSaving,
  TokenOptimizerOptions,
} from "./TokenOptimizer.js";
export {
  computeStats,
  createDefaultOptimizer,
  TokenOptimizer,
} from "./TokenOptimizer.js";
export type {
  CacheHint,
  OptimizeContext,
  OptimizerStage,
  PromptPayload,
  TokenStats,
} from "./types.js";
