/**
 * Centralised default parameters & magic values for the authoring module.
 *
 * Every hard-coded threshold, limit, weight, path, name and seed array that was
 * previously inlined across the authoring sources lives here as a named,
 * documented constant. Values are reproduced **exactly** — extracting them must
 * not change behaviour.
 *
 * ## Overridability
 *
 * Constants tagged `@overridable` back a factory-option fallback and can be
 * overridden at construction time (e.g. {@link createAuthoring} options or
 * {@link createSkillInjector} options). Constants tagged `@internal` are pure
 * implementation detail and are not meant to be overridden.
 */

/* ------------------------------------------------------------------------- *
 * --- Tools ---
 * ------------------------------------------------------------------------- */

/**
 * The default universe of tools an authored agent may be granted.
 *
 * @overridable via `AuthoringOptions.allowedTools`.
 */
export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  "read",
  "grep",
  "glob",
  "write",
  "edit",
  "bash",
  "git_status",
  "git_diff",
  "git_log",
];

/**
 * Base tools always seeded into the inferred (pre-clamp) tool wishlist before
 * scanning code snippets.
 *
 * @internal
 */
export const INFER_TOOLS_BASE: readonly string[] = ["read", "grep"];

/* ------------------------------------------------------------------------- *
 * --- Budget / Refinement ---
 * ------------------------------------------------------------------------- */

/**
 * Budget category authored work (LLM refinement spend) is charged to.
 *
 * @internal
 */
export const AUTHORING_CATEGORY = "development";

/**
 * Default model id used for refinement requests.
 *
 * @overridable via `AuthoringOptions.model`.
 */
export const DEFAULT_MODEL = "local";

/* ------------------------------------------------------------------------- *
 * --- Versioning ---
 * ------------------------------------------------------------------------- */

/**
 * Initial SemVer assigned to a freshly created skill.
 *
 * @internal
 */
export const INITIAL_SKILL_VERSION = "1.0.0";

/**
 * Fallback SemVer used when an existing version string cannot be parsed.
 *
 * @internal
 */
export const FALLBACK_SKILL_VERSION = "1.0.0";

/**
 * SemVer release type applied when upgrading an existing skill.
 *
 * @internal
 */
export const SKILL_UPGRADE_RELEASE = "minor";

/**
 * Fallback "from" version reported when an upgrade diff cannot be parsed.
 *
 * @internal
 */
export const UNKNOWN_FROM_VERSION = "0.0.0";

/* ------------------------------------------------------------------------- *
 * --- Limits / Sizes ---
 * ------------------------------------------------------------------------- */

/**
 * Maximum length of a slugified skill name (characters).
 *
 * @internal
 */
export const SLUG_MAX_LENGTH = 64;

/**
 * Maximum length of a heuristic skill description (characters) before it is
 * truncated at a sentence/word boundary.
 *
 * @internal
 */
export const HEURISTIC_DESCRIPTION_MAX_LENGTH = 160;

/**
 * Default cap on the number of skills the injector may inject.
 *
 * @overridable via `SkillInjectorOptions.maxSkills`.
 */
export const DEFAULT_MAX_SKILLS = 3;

/**
 * Default cap on the total injected skill-body character count.
 *
 * @overridable via `SkillInjectorOptions.maxChars`.
 */
export const DEFAULT_MAX_CHARS = 4000;

/**
 * Fraction of the remaining character budget that must be retained when no late
 * whitespace boundary is found while clipping an injected skill body.
 *
 * @internal
 */
export const CLIP_MIN_BUDGET_FRACTION = 0.6;

/* ------------------------------------------------------------------------- *
 * --- Scoring weights ---
 * ------------------------------------------------------------------------- */

/**
 * Maximum points contributed by description quality.
 *
 * @internal
 */
export const SCORE_DESCRIPTION_MAX = 25;

/**
 * Description length (characters) at which the description score saturates.
 *
 * @internal
 */
export const SCORE_DESCRIPTION_TARGET_LENGTH = 80;

/**
 * Maximum points contributed by the number of triggers.
 *
 * @internal
 */
export const SCORE_TRIGGERS_MAX = 25;

/**
 * Trigger count at which the trigger score saturates.
 *
 * @internal
 */
export const SCORE_TRIGGERS_TARGET = 4;

/**
 * Maximum points contributed by cited sources.
 *
 * @internal
 */
export const SCORE_SOURCES_MAX = 20;

/**
 * Source count at which the source score saturates.
 *
 * @internal
 */
export const SCORE_SOURCES_TARGET = 3;

/**
 * Maximum points contributed by body substance.
 *
 * @internal
 */
export const SCORE_BODY_MAX = 20;

/**
 * Body length (characters) at which the body score saturates.
 *
 * @internal
 */
export const SCORE_BODY_TARGET_LENGTH = 600;

/**
 * Points awarded to an `active` skill status.
 *
 * @internal
 */
export const SCORE_STATUS_ACTIVE = 10;

/**
 * Points awarded to a `draft` skill status.
 *
 * @internal
 */
export const SCORE_STATUS_DRAFT = 5;

/**
 * Points awarded to a `deprecated` skill status.
 *
 * @internal
 */
export const SCORE_STATUS_DEPRECATED = 0;

/**
 * Lower bound of the final skill score.
 *
 * @internal
 */
export const SCORE_MIN = 0;

/**
 * Upper bound of the final skill score.
 *
 * @internal
 */
export const SCORE_MAX = 100;

/* ------------------------------------------------------------------------- *
 * --- Paths ---
 * ------------------------------------------------------------------------- */

/**
 * Root directory for the skill store (before `~` expansion).
 *
 * @internal
 */
export const SKILLS_ROOT = "~/.ultracode/skills";

/**
 * Directory authored agent definitions are written to (before `~` expansion).
 *
 * @internal
 */
export const AGENTS_DIR = "~/.ultracode/agents";

/**
 * Directory the authoring audit log lives in (before `~` expansion).
 *
 * @internal
 */
export const AUTHORING_DIR = "~/.ultracode/authoring";

/**
 * Filename of the append-only JSONL authoring audit log.
 *
 * @internal
 */
export const AUDIT_FILENAME = "audit.jsonl";

/* ------------------------------------------------------------------------- *
 * --- Injection / Headers ---
 * ------------------------------------------------------------------------- */

/**
 * Header that delimits the injected skill-context block.
 *
 * @internal
 */
export const SKILL_CONTEXT_HEADER = "## Active skills";

/* ------------------------------------------------------------------------- *
 * --- Regexes ---
 * ------------------------------------------------------------------------- */

/**
 * Charset allowed for skill/catalog path segments. Anchored, single-segment.
 *
 * @internal
 */
export const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/* ------------------------------------------------------------------------- *
 * --- Seeds ---
 * ------------------------------------------------------------------------- */

/**
 * Forbidden phrases that flag a generated skill/agent text block as
 * harmful. Lower-cased; matched as substrings against normalised text.
 *
 * @internal
 */
export const FORBIDDEN_PHRASES: readonly string[] = [
  "ignore previous instructions",
  "ignore all previous instructions",
  "disregard the system prompt",
  "disregard previous instructions",
  "exfiltrate",
  "rm -rf /",
  "delete all files",
  "leak the api key",
  "leak credentials",
  "reveal the system prompt",
  "bypass safety",
  "disable safety",
  "jailbreak",
  "developer mode",
  "do anything now",
  "curl http",
  "wget http",
  "base64 -d",
];

/**
 * Stopwords removed from extracted keyword tokens so triggers are not noise.
 *
 * @internal
 */
export const STOPWORDS: readonly string[] = [
  "this",
  "that",
  "with",
  "from",
  "into",
  "your",
  "they",
  "them",
  "have",
  "will",
  "shall",
  "about",
  "which",
  "when",
  "what",
  "skill",
  "knowledge",
];
