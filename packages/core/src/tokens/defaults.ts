/**
 * Centralised default parameters and magic values for the token-optimization
 * module.
 *
 * Every hard-coded threshold, limit, weight, factor and seed string used across
 * `core/tokens` lives here as a named, documented constant. Behaviour is
 * **unchanged**: the values are exactly those that were previously inlined.
 *
 * Constants are grouped by category. Where a value is the default fallback of a
 * factory/stage option (and therefore overridable via that option), the JSDoc
 * notes it as *overridable*. Purely internal calibration constants are not
 * exposed as options and are *not* overridable.
 */

/* ========================================================================== *
 * --- Limits ---
 * ========================================================================== */

/**
 * Maximum cache breakpoints Anthropic accepts on a single request.
 *
 * Internal protocol limit — not overridable.
 */
export const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;

/**
 * Length (chars) of the short hex digest returned by {@link computePrefixKey}
 * (slice of a sha256 hex string).
 *
 * Internal — not overridable.
 */
export const PREFIX_KEY_HEX_LENGTH = 32;

/**
 * Length (chars) of the short hex block hash used for context dedup.
 *
 * Internal — not overridable.
 */
export const BLOCK_HASH_HEX_LENGTH = 16;

/**
 * Default maximum length (chars) for a tool description after slimming.
 *
 * Overridable via `ToolSchemaSlimOptions.maxDescriptionChars` (and
 * `CreateDefaultOptimizerOptions.maxToolDescriptionChars`).
 */
export const DEFAULT_TOOL_DESC_MAX = 200;

/**
 * Default number of leading messages always kept by
 * {@link ConversationCompactionStage}.
 *
 * Overridable via `ConversationCompactionOptions.keepHead` (and
 * `CreateDefaultOptimizerOptions.keepHead`).
 */
export const DEFAULT_KEEP_HEAD = 2;

/** Floor (minimum) enforced on `keepHead`. Internal — not overridable. */
export const KEEP_HEAD_FLOOR = 0;

/**
 * Default number of trailing messages always kept by
 * {@link ConversationCompactionStage}.
 *
 * Overridable via `ConversationCompactionOptions.keepTail` (and
 * `CreateDefaultOptimizerOptions.keepTail`).
 */
export const DEFAULT_KEEP_TAIL = 6;

/** Floor (minimum) enforced on `keepTail`. Internal — not overridable. */
export const KEEP_TAIL_FLOOR = 1;

/* ========================================================================== *
 * --- Summarizer ---
 * ========================================================================== */

/**
 * Maximum characters of the omitted transcript sent to the summarizer provider
 * in {@link ConversationCompactionStage.applyAsync}.
 *
 * Internal safety cap — not overridable.
 */
export const SUMMARIZER_TRANSCRIPT_MAX_CHARS = 8_000;

/**
 * `maxTokens` requested from the summarizer provider when summarizing the
 * omitted conversation middle.
 *
 * Internal — not overridable.
 */
export const SUMMARIZER_MAX_TOKENS = 512;

/**
 * System instruction sent to the summarizer provider.
 *
 * Internal — not overridable.
 */
export const SUMMARIZER_SYSTEM_PROMPT =
  "Summarize the following conversation excerpt in at most 5 bullet points. Preserve decisions, facts and open questions. Do not invent content.";

/* ========================================================================== *
 * --- Counter weights & factors ---
 * ========================================================================== */

/** Per-message structural overhead added by `countMessages`. Internal. */
export const PER_MESSAGE_OVERHEAD = 4;

/** Extra tokens charged for each tool-call envelope on an assistant message. Internal. */
export const PER_TOOL_CALL_OVERHEAD = 8;

/** Weight applied to the word-based estimate when blending the two models. Internal. */
export const WORD_WEIGHT = 0.5;

/** Average characters per token assumed by the chars/N model (English-ish). Internal. */
export const CHARS_PER_TOKEN = 4;

/** Multiplier turning a word count into a rough token count (sub-word splits). Internal. */
export const WORD_TO_TOKEN = 1.3;

/** Per-punctuation/symbol token surcharge added on top of the base estimate. Internal. */
export const PUNCTUATION_PENALTY = 0.3;

/** Per-CJK/astral-codepoint token surcharge added on top of the base estimate. Internal. */
export const CJK_OR_ASTRAL_PENALTY = 1.2;

/** Minimum token count returned for any non-empty input. Internal. */
export const MIN_TOKENS_NON_EMPTY = 1;

/* ========================================================================== *
 * --- Markers & placeholders ---
 * ========================================================================== */

/**
 * Reference inserted in place of a repeated context block by
 * {@link DedupContextStage}.
 *
 * Internal — not overridable.
 */
export const DEDUP_PLACEHOLDER = "[identical to block above]";

/**
 * Default opening marker delimiting an immutable (never-edited) system-prompt
 * span.
 *
 * Overridable via `SystemPromptMinifyOptions.immutableOpen`.
 */
export const DEFAULT_IMMUTABLE_OPEN = "<!--immutable-->";

/**
 * Default closing marker for an immutable span.
 *
 * Overridable via `SystemPromptMinifyOptions.immutableClose`.
 */
export const DEFAULT_IMMUTABLE_CLOSE = "<!--/immutable-->";

/* ========================================================================== *
 * --- Events ---
 * ========================================================================== */

/** Discriminator for the core-local token-optimization event. Internal. */
export const TOKENS_OPTIMIZED_EVENT = "tokens.optimized" as const;
