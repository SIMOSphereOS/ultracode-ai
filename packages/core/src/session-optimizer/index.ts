/**
 * `ultracode-core/session-optimizer` — running, incremental, non-blocking
 * session compaction (v1.2.0).
 *
 * Public surface:
 * - {@link SessionOptimizer} / {@link createSessionOptimizer} — the optimizer
 *   contract and its factory.
 * - The pure helpers ({@link extractPinnedFacts}, {@link dedupMessages},
 *   {@link extractiveSummary}, {@link mergeSummary}) for reuse and testing.
 * - The core-local `session.optimized` reporting event.
 * - All public types ({@link SessionOptimizationResult}, {@link WorkingSet},
 *   {@link Thresholds}, …).
 *
 * Sidecar state lives under `~/.ultracode/sessions-opt/<id>.json`; the raw
 * session record is never mutated.
 */

export {
  BARE_FILE_RE,
  BUDGET_CATEGORY,
  CHEAP_MODEL_ROUTES,
  CODE_SYMBOL_MIN_CHARS,
  DECISION_RE,
  DEDUP_BACKREF_TEMPLATE,
  DEDUP_MIN_CONTENT_CHARS,
  DEFAULT_ENABLE_LLM_SUMMARY,
  DEFAULT_MIN_MESSAGES,
  DEFAULT_RECENT_KEEP,
  DEFAULT_SUMMARY_MAX_CHARS,
  FILE_PATH_RE,
  FIRST_SENTENCE_MAX_CHARS,
  IDENTIFIER_RE,
  LLM_SUMMARY_BUDGET_NOTE,
  LLM_SUMMARY_MAX_TOKENS,
  LLM_SUMMARY_SYSTEM_PROMPT,
  LLM_SUMMARY_TEMPERATURE,
  MAX_FACT_CHARS,
  MAX_FACTS,
  SENTENCE_BOUNDARY_RE,
  SIDECAR_FILENAME_UNSAFE_RE,
  SIDECAR_ROOT,
  TODO_RE,
  VERSION_RE,
} from "./defaults.js";
export type { SessionOptimizedEvent } from "./events.js";
export {
  emitSessionOptimizedEvent,
  SESSION_OPTIMIZED_EVENT,
} from "./events.js";

export { extractPinnedFacts, extractPinnedFromText } from "./pinned.js";
export type { SessionOptimizerOptions } from "./SessionOptimizer.js";
export {
  createSessionOptimizer,
  dedupMessages,
  extractiveSummary,
  mergeSummary,
} from "./SessionOptimizer.js";
export type {
  SessionOptimizationResult,
  SessionOptimizer,
  SessionOptState,
  Thresholds,
  WorkingSet,
} from "./types.js";
export { DEFAULT_THRESHOLDS } from "./types.js";
