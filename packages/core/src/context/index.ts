/**
 * `core/context` — context engine.
 *
 * Public surface:
 * - {@link createContextEngine} — factory per the monorepo-wide contract.
 * - {@link ContextEngine} — collector + compressor facade.
 * - {@link ContextCollector} — fault-tolerant multi-source collection.
 * - {@link ContextCompressor} — token estimation, ranking and trimming.
 */

export type {
  ContextCollectorOptions,
  ContextSection,
  GitRunner,
  GitRunResult,
} from "./ContextCollector.js";
export { ContextCollector, DEFAULT_IGNORE } from "./ContextCollector.js";
export type { CompressOptions } from "./ContextCompressor.js";
export { CONTEXT_HEADER, ContextCompressor, cutAtWordBoundary } from "./ContextCompressor.js";
export type { ContextCollectRequest, ContextEngineDeps } from "./ContextEngine.js";
export { ContextEngine, createContextEngine } from "./ContextEngine.js";
