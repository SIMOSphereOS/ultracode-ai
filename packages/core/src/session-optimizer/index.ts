/**
 * `@ultracode/core/session-optimizer` — running, incremental, non-blocking
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

export { createSessionOptimizer } from "./SessionOptimizer.js";
export type { SessionOptimizerOptions } from "./SessionOptimizer.js";
export {
  dedupMessages,
  extractiveSummary,
  mergeSummary,
} from "./SessionOptimizer.js";

export { extractPinnedFacts, extractPinnedFromText } from "./pinned.js";

export {
  SESSION_OPTIMIZED_EVENT,
  emitSessionOptimizedEvent,
} from "./events.js";
export type { SessionOptimizedEvent } from "./events.js";

export { DEFAULT_THRESHOLDS } from "./types.js";
export type {
  SessionOptimizationResult,
  SessionOptimizer,
  SessionOptState,
  Thresholds,
  WorkingSet,
} from "./types.js";
