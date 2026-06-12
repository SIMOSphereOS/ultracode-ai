/**
 * `@ultracode/core/learning` — Module C: the documentation learn agent.
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

import { LearnAgent } from "./LearnAgent.js";
import type { LearnAgentOptions } from "./LearnAgent.js";

export { LearnAgent, CHECKPOINT_INTERVAL, PER_PAGE_TOKENS_IN, PER_PAGE_TOKENS_OUT } from "./LearnAgent.js";
export type { LearnAgentOptions, LearnRunOptions } from "./LearnAgent.js";

export { SourceLibrary, SEED_SOURCES } from "./SourceLibrary.js";

export { NativeCrawlerProvider } from "./NativeCrawlerProvider.js";
export type { NativeCrawlerOptions } from "./NativeCrawlerProvider.js";

export {
  createCheckpointStore,
  defaultSqliteLoader as defaultLearnSqliteLoader,
} from "./checkpoint.js";
export type { Checkpoint, CheckpointStore, SqliteLoader as LearnSqliteLoader } from "./checkpoint.js";

export { Semaphore, mapWithConcurrency } from "./concurrency.js";

export {
  chunkText,
  distillPage,
  estimateTokens,
  sha256,
  routeModel,
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_OVERLAP,
  DEFAULT_ROUTING,
} from "./extract.js";
export type { Chunk, DistillOptions, DistillUsage } from "./extract.js";

export { extractText, decodeEntities } from "./html.js";
export type { ExtractedDoc } from "./html.js";

export { parseSitemap, extractTocHrefs, decodeXml } from "./sitemap.js";
export type { SitemapResult, SitemapUrl } from "./sitemap.js";

export { normalizeUrl, normalizeAndDedup, sameHost } from "./url.js";

export { parseRobots, isAllowed, urlAllowed } from "./robots.js";
export type { RobotsTxt } from "./robots.js";

export {
  isFetchAllowed,
  isFetchAllowedAsync,
  assertFetchAllowed,
  isBlockedIp,
  nodeDnsLookupAll,
} from "./urlGuard.js";
export type { FetchAllowDecision, FetchGuardOptions, DnsLookupAll } from "./urlGuard.js";

export {
  learningDir,
  sourcesFile,
  stateDir,
  stateFile,
  sanitizeId,
  resolveHome,
} from "./paths.js";

export {
  LEARN_STARTED_EVENT,
  LEARN_ESTIMATED_EVENT,
  LEARN_COMPLETED_EVENT,
  emitLearningEvent,
  startedEvent,
  estimatedEvent,
  completedEvent,
} from "./events.js";
export type {
  LearningEvent,
  LearnStartedEvent,
  LearnEstimatedEvent,
  LearnCompletedEvent,
} from "./events.js";

export { LearnError, LearnCapError } from "./errors.js";

export type {
  // injection contracts
  IBudgetGate,
  ISkillAuthor,
  // budget surface
  BudgetCategory,
  ModelSpend,
  CostEstimate,
  EstimateInput,
  RoutingShare,
  BudgetDecision,
  LedgerEntry,
  // authoring surface
  SkillFrontmatter,
  Skill,
  KnowledgeMaterial,
  AuthoringProposal,
  // learning domain
  LearnSource,
  DocPage,
  PageValidators,
  DocIngestionProvider,
  IngestionContext,
  FetchImpl,
  FetchResponseLike,
  LearnRunPlan,
  LearnRunReport,
  LearnProgress,
  NowFn,
} from "./types.js";

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
