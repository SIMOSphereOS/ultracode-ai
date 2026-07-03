/**
 * `ultracode-core/learning` — Module C: the documentation learn agent.
 *
 * Public surface:
 * - {@link LearnAgent} / {@link createLearnAgent} — plan + (approved) run.
 * - {@link SourceLibrary} / {@link SEED_SOURCES} — the persisted doc-source
 *   catalogue (`~/.ultracode/learning/sources.toml`).
 * - {@link NativeCrawlerProvider} — the default, dependency-free
 *   {@link DocIngestionProvider} (sitemap/toc.json discovery, conditional GET,
 *   robots, HTML→text, content-hash dedup).
 * - The extraction pipeline ({@link chunkText}, {@link distillPage}), the
 *   {@link Semaphore}, the checkpoint store, and the core-local `learn.*`
 *   events.
 * - All domain types and the core-local injection contracts
 *   ({@link IBudgetGate}, {@link ISkillAuthor}).
 *
 * Cross-module dependencies (budget = Module A, authoring = Module B) are taken
 * **only** by constructor injection against the local interfaces; no sibling
 * module is imported.
 */

import os from "node:os";
import type { LearnAgentOptions } from "./LearnAgent.js";
import { LearnAgent } from "./LearnAgent.js";

export type {
  Checkpoint,
  CheckpointStore,
  SqliteLoader as LearnSqliteLoader,
} from "./checkpoint.js";
export {
  createCheckpointStore,
  defaultSqliteLoader as defaultLearnSqliteLoader,
} from "./checkpoint.js";
export { mapWithConcurrency, Semaphore } from "./concurrency.js";
export { LearnCapError, LearnError } from "./errors.js";
export type {
  LearnCompletedEvent,
  LearnEstimatedEvent,
  LearningEvent,
  LearnStartedEvent,
} from "./events.js";
export {
  completedEvent,
  emitLearningEvent,
  estimatedEvent,
  LEARN_COMPLETED_EVENT,
  LEARN_ESTIMATED_EVENT,
  LEARN_STARTED_EVENT,
  startedEvent,
} from "./events.js";
export type { Chunk, DistillOptions, DistillUsage } from "./extract.js";
export {
  chunkText,
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_OVERLAP,
  DEFAULT_ROUTING,
  distillPage,
  estimateTokens,
  routeModel,
  sha256,
} from "./extract.js";
export type { ExtractedDoc } from "./html.js";
export { decodeEntities, extractText } from "./html.js";
export type { LearnAgentOptions, LearnRunOptions } from "./LearnAgent.js";
export {
  CHECKPOINT_INTERVAL,
  LearnAgent,
  PER_PAGE_TOKENS_IN,
  PER_PAGE_TOKENS_OUT,
} from "./LearnAgent.js";
export type { NativeCrawlerOptions } from "./NativeCrawlerProvider.js";
export { NativeCrawlerProvider } from "./NativeCrawlerProvider.js";
export {
  learningDir,
  resolveHome,
  sanitizeId,
  sourcesFile,
  stateDir,
  stateFile,
} from "./paths.js";
export type { RobotsTxt } from "./robots.js";
export { isAllowed, parseRobots, urlAllowed } from "./robots.js";
export { SEED_SOURCES, SourceLibrary } from "./SourceLibrary.js";
export type { SitemapResult, SitemapUrl } from "./sitemap.js";
export { decodeXml, extractTocHrefs, parseSitemap } from "./sitemap.js";
export type {
  AuthoringProposal,
  // budget surface
  BudgetCategory,
  BudgetDecision,
  CostEstimate,
  DocIngestionProvider,
  DocPage,
  EstimateInput,
  FetchImpl,
  FetchResponseLike,
  // injection contracts
  IBudgetGate,
  IngestionContext,
  ISkillAuthor,
  KnowledgeMaterial,
  LearnProgress,
  LearnRunPlan,
  LearnRunReport,
  // learning domain
  LearnSource,
  LedgerEntry,
  ModelSpend,
  NowFn,
  PageValidators,
  RoutingShare,
  Skill,
  // authoring surface
  SkillFrontmatter,
} from "./types.js";
export { normalizeAndDedup, normalizeUrl, sameHost } from "./url.js";
export type { DnsLookupAll, FetchAllowDecision, FetchGuardOptions } from "./urlGuard.js";
export {
  assertFetchAllowed,
  isBlockedIp,
  isFetchAllowed,
  isFetchAllowedAsync,
  nodeDnsLookupAll,
} from "./urlGuard.js";

/**
 * Create a {@link LearnAgent} with the given injected dependencies.
 *
 * @param opts - Logger, events, budget gate, author, provider, ingestion,
 *   fetch, clock and home directory overrides.
 * @returns A ready {@link LearnAgent}.
 */
export function createLearnAgent(opts: LearnAgentOptions = {}): LearnAgent {
  return new LearnAgent({ homeDir: opts.homeDir ?? os.homedir(), ...opts });
}
