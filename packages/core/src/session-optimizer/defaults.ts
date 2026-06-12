/**
 * Centralised default values and magic constants for the
 * `@ultracode/core/session-optimizer` subsystem.
 *
 * Every hard-coded threshold, limit, size, model name, prompt, regular
 * expression and seed value used by the optimizer lives here as a single
 * named, JSDoc-documented constant so that behaviour-affecting tuning is
 * discoverable in one place and overridable through factory options / config.
 *
 * IMPORTANT: the values here are *exact* extractions — they must never change
 * the runtime behaviour of the optimizer. Constants flagged "overridable" feed
 * a default-fallback that callers may override via factory options (e.g.
 * {@link Thresholds}); constants flagged "internal" are implementation details
 * that are not surfaced as options.
 */

/* ----------------------------------------------------------------------------
 * Thresholds (overridable via {@link Thresholds} factory options)
 * ------------------------------------------------------------------------- */

/**
 * Below this message count `processIncremental` is a no-op.
 * Overridable via `Thresholds.minMessages`.
 */
export const DEFAULT_MIN_MESSAGES = 12;

/**
 * Number of most-recent messages always kept verbatim in the working set.
 * Overridable via `Thresholds.recentKeep`.
 */
export const DEFAULT_RECENT_KEEP = 8;

/**
 * Hard cap on the durable-summary length (characters).
 * Overridable via `Thresholds.summaryMaxChars`.
 */
export const DEFAULT_SUMMARY_MAX_CHARS = 4000;

/**
 * Whether an LLM may be used to summarise aged-out turns (subject to a budget
 * check). `false` keeps summarisation purely extractive (zero cost).
 * Overridable via `Thresholds.enableLlmSummary`.
 */
export const DEFAULT_ENABLE_LLM_SUMMARY = false;

/* ----------------------------------------------------------------------------
 * Paths & Categories (internal)
 * ------------------------------------------------------------------------- */

/** Root directory for the optimizer sidecars (before `~` expansion). Internal. */
export const SIDECAR_ROOT = "~/.ultracode/sessions-opt";

/** Budget category charged for optional LLM summarisation. Internal. */
export const BUDGET_CATEGORY = "operations";

/**
 * Sanitises a session id into a filesystem-safe sidecar basename: any
 * character outside `[A-Za-z0-9._-]` is replaced. Internal.
 */
export const SIDECAR_FILENAME_UNSAFE_RE = /[^A-Za-z0-9._-]/g;

/* ----------------------------------------------------------------------------
 * Dedup (internal)
 * ------------------------------------------------------------------------- */

/**
 * Minimum content length (characters) for a tool/assistant block to be
 * considered for dedup collapse. Shorter blocks are always kept. Internal.
 */
export const DEDUP_MIN_CONTENT_CHARS = 80;

/**
 * Template for the terse back-reference that replaces a collapsed duplicate
 * message. `{role}` is substituted with the message's role. Internal.
 */
export const DEDUP_BACKREF_TEMPLATE =
  "[duplicate of an earlier {role} message — content elided]";

/* ----------------------------------------------------------------------------
 * Summarisation (internal)
 * ------------------------------------------------------------------------- */

/** Maximum length (characters) of a single extracted "first sentence". Internal. */
export const FIRST_SENTENCE_MAX_CHARS = 160;

/** Matches a sentence terminator followed by whitespace or end-of-string. Internal. */
export const SENTENCE_BOUNDARY_RE = /[.!?](?:\s|$)/;

/** System prompt steering the optional cheap-model rolling summary. Internal. */
export const LLM_SUMMARY_SYSTEM_PROMPT =
  "Summarise the following conversation turns into a terse, factual " +
  "running summary. Preserve decisions, file paths, identifiers and open tasks.";

/** Note recorded against the budget ledger for a rolling-summary charge. Internal. */
export const LLM_SUMMARY_BUDGET_NOTE = "session-optimizer rolling summary";

/** Maximum output tokens requested for the cheap-model rolling summary. Internal. */
export const LLM_SUMMARY_MAX_TOKENS = 512;

/** Sampling temperature for the cheap-model rolling summary (deterministic). Internal. */
export const LLM_SUMMARY_TEMPERATURE = 0;

/* ----------------------------------------------------------------------------
 * Cheap-model routing (internal)
 * ------------------------------------------------------------------------- */

/**
 * Mapping from a provider-name substring to the cheap model id used for the
 * optional rolling summary. Probed in array order; the first matching
 * `nameSubstring` wins, otherwise the provider's own name is used. Internal.
 */
export const CHEAP_MODEL_ROUTES: ReadonlyArray<{
  readonly nameSubstring: string;
  readonly model: string;
}> = [
  { nameSubstring: "anthropic", model: "claude-3-5-haiku-latest" },
  { nameSubstring: "openai", model: "gpt-4o-mini" },
  { nameSubstring: "mistral", model: "mistral-small-latest" },
];

/* ----------------------------------------------------------------------------
 * Pinned-fact limits (internal)
 * ------------------------------------------------------------------------- */

/** Upper bound on a single pinned fact's length (characters). Internal. */
export const MAX_FACT_CHARS = 200;

/** Hard cap on the number of pinned facts returned (earliest kept). Internal. */
export const MAX_FACTS = 64;

/* ----------------------------------------------------------------------------
 * Pinned-fact extraction patterns (internal)
 * ------------------------------------------------------------------------- */

/** File paths: POSIX or Windows, with a recognised file extension (unicode-aware). Internal. */
export const FILE_PATH_RE =
  /(?:[A-Za-z]:\\|\.{0,2}[/\\])?(?:[\p{L}\p{N}.@_-]+[/\\])+[\p{L}\p{N}.@_-]+\.[A-Za-z][A-Za-z0-9]{0,9}/gu;

/** Bare dotted/extensioned filenames (e.g. `config.toml`, `café.md`). Internal. */
export const BARE_FILE_RE = /[\p{L}\p{N}_-]+\.(?:[A-Za-z][A-Za-z0-9]{0,9})\b/gu;

/** Semantic-ish version numbers (e.g. `1.2.0`, `v3.4`, `2.0.0-rc.1`). Internal. */
export const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/g;

/**
 * Identifiers / code symbols: CamelCase, snake_case, or `a.b.c()` member chains,
 * optionally ending in a `()` call. No trailing `\b` so the `()` is captured.
 * Internal.
 */
export const IDENTIFIER_RE = /(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:\(\))?/g;

/** Lines that look like a decision ("we decided to use X", "chosen: Y"). Internal. */
export const DECISION_RE =
  /(?:^|[\s.;])((?:decided|decide|chosen|choose|chose|use|using|adopt(?:ed)?|pick(?:ed)?|go with|selected|prefer(?:red)?)\b[^.!?\n]{0,180})/gi;

/** Lines that look like an open task ("TODO: …", "FIXME …", "next step …"). Internal. */
export const TODO_RE =
  /\b(?:TODO|FIXME|XXX|HACK|next step|open task|action item)\b[^.\n]{0,180}/gi;

/** Minimum token length for a candidate to be considered a code symbol. Internal. */
export const CODE_SYMBOL_MIN_CHARS = 3;
