/**
 * Public types and core-local injection contracts for `core/learning`.
 *
 * Module C (the learn agent) depends on Module A (budget) and Module B
 * (authoring) **only** through the narrow, core-local interfaces declared here
 * ({@link IBudgetGate}, {@link ISkillAuthor}). The concrete budget/authoring
 * packages live in sibling directories that are built in parallel; this module
 * never imports them directly. Callers wire the real implementations in via
 * constructor injection, and tests supply fakes that satisfy these shapes.
 *
 * @packageDocumentation
 */

import type { ILLMProvider } from "@ultracode/shared";

/* ------------------------------------------------------------------------- *
 * Cross-module injection contracts (mirrors of budget / authoring surfaces)  *
 * ------------------------------------------------------------------------- */

/** Coarse classification of spend, used for budget-cap routing. */
export type BudgetCategory = "development" | "learning" | "operations" | string;

/** Per-model spend line of a {@link CostEstimate}. */
export interface ModelSpend {
  /** Model identifier the spend is attributed to. */
  model: string;
  /** Estimated input tokens routed to this model. */
  tokensIn: number;
  /** Estimated output tokens produced by this model. */
  tokensOut: number;
  /** Estimated USD cost for this model. */
  usd: number;
}

/** A cost estimate produced by the budget planner (no side effects). */
export interface CostEstimate {
  /** Number of pages the estimate covers, when page-based. */
  pages?: number;
  /** Total estimated input tokens. */
  tokensIn: number;
  /** Total estimated output tokens. */
  tokensOut: number;
  /** Per-model breakdown. */
  byModel: ModelSpend[];
  /** Lower bound of the USD range. */
  usdLow: number;
  /** Upper bound of the USD range. */
  usdHigh: number;
  /** Converted EUR figure (midpoint × `fxRate`). */
  eur: number;
  /** USD→EUR conversion rate used. */
  fxRate: number;
  /** Human-readable assumptions baked into the estimate. */
  assumptions: string[];
}

/** A routing share entry (`model` gets `share` of the work, 0..1). */
export interface RoutingShare {
  /** Model identifier. */
  model: string;
  /** Fraction of items routed to this model (0..1). */
  share: number;
}

/** Input to {@link IBudgetGate.estimate}. */
export interface EstimateInput {
  /** Spend category. */
  category: BudgetCategory;
  /** Page count, when the work is page-based. */
  pages?: number;
  /** Estimated input tokens per item. */
  perItemTokensIn?: number;
  /** Estimated output tokens per item. */
  perItemTokensOut?: number;
  /** Model routing distribution. */
  routing?: RoutingShare[];
  /** Batch size multiplier. */
  batch?: number;
  /** Safety factor applied on top of the raw estimate. */
  safetyFactor?: number;
  /** Optional raw texts, used for token estimation when provided. */
  texts?: string[];
}

/** A budget gate decision for a planned operation. */
export interface BudgetDecision {
  /** Whether the operation is permitted at all. */
  allowed: boolean;
  /** Whether a human approval step is required before proceeding. */
  requiresApproval: boolean;
  /** Remaining USD headroom under the active cap. */
  remainingUsd: number;
  /** Active USD cap, or `null` when uncapped. */
  capUsd: number | null;
  /** Human-readable rationale. */
  reason: string;
}

/**
 * Narrow injection surface of Module A consumed by the learn agent. The full
 * `BudgetPlanner` exposes more; the learn agent only needs these four members.
 */
export interface IBudgetGate {
  /** Produce a cost estimate without recording anything. */
  estimate(input: EstimateInput): CostEstimate;
  /** Decide whether an estimated operation may proceed. */
  check(estimate: CostEstimate, category: BudgetCategory): BudgetDecision;
  /** Record actual spend to the ledger. */
  record(entry: LedgerEntry): Promise<void>;
  /** Render an estimate + decision as a human-readable report. */
  formatReport(estimate: CostEstimate, decision: BudgetDecision): string;
}

/** A ledger line recording planned vs. actual spend. */
export interface LedgerEntry {
  /** ISO-8601 timestamp. */
  ts: string;
  /** Spend category. */
  category: BudgetCategory;
  /** Model the spend is attributed to, when known. */
  model?: string;
  /** Estimated USD at planning time. */
  estimatedUsd: number;
  /** Actual USD after execution. */
  actualUsd: number;
  /** Optional free-text note. */
  note?: string;
}

/* ------------------------------------------------------------------------- *
 * Authoring (Module B) — consumed surface                                    *
 * ------------------------------------------------------------------------- */

/** Frontmatter describing a skill document. */
export interface SkillFrontmatter {
  /** Stable skill name (slug). */
  name: string;
  /** One-line description. */
  description: string;
  /** Semantic version string. */
  version: string;
  /** Catalog the skill belongs to. */
  catalog: string;
  /** Trigger phrases. */
  triggers: string[];
  /** Tool names the skill may use. */
  tools?: string[];
  /** Source URLs the skill was derived from. */
  sources: string[];
  /** Lifecycle status. */
  status: "draft" | "active" | "deprecated";
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/** A full skill: frontmatter plus markdown body. */
export interface Skill extends SkillFrontmatter {
  /** Markdown body. */
  body: string;
}

/** Distilled knowledge a learn run produces for one topic. */
export interface KnowledgeMaterial {
  /** Catalog the material belongs to. */
  catalog: string;
  /** Topic label. */
  topic: string;
  /** Short summary. */
  summary: string;
  /** Bullet-point facts. */
  facts: string[];
  /** Extracted code snippets. */
  codeSnippets: string[];
  /** Source URLs. */
  sources: string[];
}

/** A proposal to create or evolve a skill / agent. */
export interface AuthoringProposal {
  /** Whether this proposes a skill or an agent. */
  kind: "skill" | "agent";
  /** Name of the proposed artefact. */
  name: string;
  /** The proposed skill, when `kind === "skill"`. */
  skill?: Skill;
  /** The proposed agent definition, when `kind === "agent"`. */
  agent?: unknown;
  /** Why this proposal was made. */
  rationale: string;
  /** Optional diff summary vs. an existing artefact. */
  diffFromExisting?: string;
}

/**
 * Narrow injection surface of Module B consumed by the learn agent. The learn
 * agent turns {@link KnowledgeMaterial} into a skill proposal and persists it.
 */
export interface ISkillAuthor {
  /** Create or upgrade a skill from distilled knowledge. */
  createOrUpgradeSkill(material: KnowledgeMaterial): Promise<AuthoringProposal>;
  /** Persist a proposal (only writes when `approved`). */
  persist(proposal: AuthoringProposal, opts: { approved: boolean }): Promise<void>;
}

/* ------------------------------------------------------------------------- *
 * Learning domain types                                                      *
 * ------------------------------------------------------------------------- */

/** A documentation source the learn agent can crawl on demand. */
export interface LearnSource {
  /** Stable source id (slug). */
  id: string;
  /** Entry URL (sitemap/toc root or doc landing page). */
  url: string;
  /** Source type discriminator. */
  type: "web-docs";
  /** Catalog skills derived from this source land in. */
  catalog: string;
  /** Crawl schedule; `"on-demand"` never runs automatically. */
  schedule: "on-demand" | "annual" | string;
  /** Optional scope hint (free text or comma list). */
  scope?: string;
  /** Default locale for fetched pages. */
  localeDefault: string;
  /** ISO-8601 timestamp of the last successful processing, if any. */
  lastProcessed?: string;
  /** Opaque per-source state (e.g. last sitemap hash). */
  state?: Record<string, unknown>;
}

/** A single documentation page, after a (possibly conditional) fetch. */
export interface DocPage {
  /** Normalized page URL. */
  url: string;
  /** HTTP status of the fetch (`304` for not-modified). */
  status: number;
  /** Whether the content changed vs. the previously stored hash. */
  changed: boolean;
  /** Page title, when extracted. */
  title?: string;
  /** Cleaned, tag-stripped text body. */
  text?: string;
  /** `Last-Modified` value echoed back, when present. */
  lastmod?: string;
  /** SHA-256 of the cleaned text, when fetched. */
  contentHash?: string;
}

/** Conditional-GET validators carried between runs for a page. */
export interface PageValidators {
  /** Previously seen `ETag`. */
  etag?: string;
  /** Previously seen `Last-Modified`. */
  lastModified?: string;
  /** Previously computed content hash (for change detection). */
  contentHash?: string;
}

/** A `fetch`-shaped function; injected so tests never touch the network. */
export type FetchImpl = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/** Structural subset of the WHATWG `Response` the crawler relies on. */
export interface FetchResponseLike {
  /** HTTP status code. */
  status: number;
  /** Whether the status is in the 2xx range. */
  ok: boolean;
  /** Response headers (case-insensitive `get`). */
  headers: { get(name: string): string | null };
  /** Resolve the body as text. */
  text(): Promise<string>;
}

/** Options threaded into ingestion-provider calls. */
export interface IngestionContext {
  /** Network access, always injected. */
  fetchImpl: FetchImpl;
  /** Cancellation signal. */
  signal?: AbortSignal;
}

/**
 * Pluggable documentation ingestion strategy: discovery + per-page fetch. The
 * default implementation is {@link NativeCrawlerProvider}.
 */
export interface DocIngestionProvider {
  /** Discover candidate page URLs for a source. */
  discover(source: LearnSource, ctx: IngestionContext): Promise<string[]>;
  /** Fetch a single page using conditional-GET validators. */
  fetchPage(url: string, prev: PageValidators, ctx: IngestionContext): Promise<DocPage>;
}

/** Plan output: what *would* be crawled and the estimated cost. */
export interface LearnRunPlan {
  /** Source id the plan is for. */
  sourceId: string;
  /** Candidate page URLs discovered (no crawl performed). */
  candidatePages: string[];
  /** Cost estimate for processing the candidates. */
  estimate: CostEstimate;
}

/** Report output from an executed learn run. */
export interface LearnRunReport {
  /** Source id the run was for. */
  sourceId: string;
  /** Pages whose content was checked (conditional GET issued). */
  pagesChecked: number;
  /** Pages that returned `304 Not Modified`. */
  notModified: number;
  /** Pages fetched but unchanged by content hash. */
  unchanged: number;
  /** Pages whose content changed and were processed. */
  processed: number;
  /** Pages that errored irrecoverably (skipped). */
  errors: number;
  /** Estimated USD at plan time. */
  estimatedUsd: number;
  /** Actual USD spent. */
  actualUsd: number;
  /** Number of skills newly created. */
  skillsCreated: number;
  /** Number of skills updated. */
  skillsUpdated: number;
  /** ISO-8601 start timestamp. */
  startedAt: string;
  /** ISO-8601 finish timestamp. */
  finishedAt: string;
}

/** Progress callback payload emitted during {@link LearnAgent.run}. */
export interface LearnProgress {
  /** Pages processed so far. */
  done: number;
  /** Total candidate pages. */
  total: number;
  /** The URL just handled. */
  url: string;
  /** Outcome of the page. */
  outcome: "processed" | "unchanged" | "notModified" | "error";
}

/** Clock injection point (defaults to `Date.now`). */
export type NowFn = () => number;
