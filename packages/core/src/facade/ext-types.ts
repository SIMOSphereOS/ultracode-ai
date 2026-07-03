/**
 * Public type surface of the additive `budget` / `authoring` / `learning`
 * sub-APIs exposed on the {@link UltraCode} facade (Modules A/B/C of v1.2.0).
 *
 * These are thin, CLI-facing *adapter* shapes layered over the concrete
 * `BudgetPlanner`, `Authoring` and `LearnAgent` modules. They give the CLI a
 * stable, ergonomic surface (e.g. an aggregated budget status, a partial
 * source-add helper) without leaking each module's full internal API. The
 * underlying value types ({@link CostEstimate}, {@link BudgetDecision},
 * {@link LedgerEntry}, {@link Skill}, {@link LearnSource}, …) are the **real**
 * core types, re-used directly.
 */

import type {
  AuthoringProposal,
  KnowledgeMaterial,
  Skill,
  SkillFrontmatter,
  TestResult,
} from "../authoring/index.js";
import type {
  BudgetCategory,
  BudgetDecision,
  CostEstimate,
  EstimateInput,
  LedgerEntry,
} from "../budget/index.js";
import type {
  LearnProgress,
  LearnRunPlan,
  LearnRunReport,
  LearnSource,
} from "../learning/index.js";

/**
 * Aggregated, CLI-friendly snapshot of budget spend, flattened from the
 * planner's per-category status. `capUsd`/`remainingUsd` reflect the broadest
 * (lifetime/total) envelope cap when one is configured, else `null`.
 */
export interface BudgetStatusView {
  /** ISO-8601 timestamp marking the start of the reporting period, when known. */
  periodStart?: string;
  /** Total USD spent across all categories (lifetime). */
  spentUsd: number;
  /** The governing USD cap, or `null` when unconstrained. */
  capUsd: number | null;
  /** Remaining USD under the cap (`cap - spent`, never negative), or `cap` is `null`. */
  remainingUsd: number;
  /** Per-category lifetime spend. */
  byCategory?: Record<string, number>;
  /** Number of ledger entries observed. */
  entries?: number;
}

/**
 * CLI-friendly view of the active budget plan: the headline cap and approval
 * threshold, plus per-category caps. Mirrors what `ultracode budget plan`
 * reads and writes.
 */
export interface BudgetPlanView {
  /** Monthly/total USD cap, or `null` for no cap. */
  capUsd: number | null;
  /** Per-category USD caps (monthly), when configured. */
  categories?: Record<string, number>;
  /** Per-run USD threshold above which a run requires approval. */
  approvalThresholdUsd?: number;
}

/** Answers accepted by {@link BudgetFacade.plan} to mutate the plan. */
export interface BudgetPlanAnswers {
  /** Monthly/total USD cap, or `null` for no cap. */
  capUsd?: number | null;
  /** Per-run USD approval threshold. */
  approvalThresholdUsd?: number | null;
  /** Per-category monthly USD caps. */
  categories?: Record<string, number>;
  /** EUR per 1 USD for reporting. */
  fxRate?: number;
}

/** The `ultra.budget` facade sub-API (Module A surface used by the CLI). */
export interface BudgetFacade {
  /** Aggregated spend snapshot. */
  status(): Promise<BudgetStatusView>;
  /** Read (no answers) or build (with answers) the budget plan view. */
  plan(answers?: BudgetPlanAnswers): Promise<BudgetPlanView>;
  /** Persist a budget plan view as the active plan. */
  setPlan(plan: BudgetPlanView): Promise<void>;
  /** Estimate the cost of a unit of work. */
  estimate(input: EstimateInput): CostEstimate;
  /** Check an estimate against the plan for a category. */
  check(estimate: CostEstimate, category: BudgetCategory): BudgetDecision;
  /** Human-readable cost report ending in a JA/NEIN prompt. */
  formatReport(estimate: CostEstimate, decision: BudgetDecision): string;
  /** Read the spend ledger (most-recent first), optionally capped. */
  history(limit?: number): Promise<LedgerEntry[]>;
}

/** The `ultra.authoring` facade sub-API (Module B surface used by the CLI). */
export interface AuthoringFacade {
  /** Read-only skill registry view. */
  skills: {
    /** List skill frontmatter, optionally filtered by catalog. */
    list(catalog?: string): Promise<SkillFrontmatter[]>;
    /** Fetch a full skill by name (`null` when absent). */
    get(name: string): Promise<Skill | null>;
  };
  /** Create or upgrade a skill from distilled material (proposal only). */
  createSkill(material: KnowledgeMaterial): Promise<AuthoringProposal>;
  /** Create a new agent from distilled material (proposal only). */
  createAgent(material: KnowledgeMaterial): Promise<AuthoringProposal>;
  /** Evolve an existing agent from distilled material (proposal only). */
  evolveAgent(material: KnowledgeMaterial): Promise<AuthoringProposal>;
  /** Offline-test a proposal. */
  test(proposal: AuthoringProposal): Promise<TestResult>;
  /** Persist a proposal (only when `approved`). */
  persist(proposal: AuthoringProposal, opts: { approved: boolean }): Promise<void>;
  /** Heuristic quality score (0–100) for a skill. */
  scoreSkill(skill: Skill): number;
}

/** Fields accepted when registering a new learning source. */
export interface SourceAddInput {
  /** Documentation root URL or sitemap (required). */
  url: string;
  /** Stable source id (slug); derived from `url` when omitted. */
  id?: string;
  /** Catalog generated skills are filed under. */
  catalog?: string;
  /** Refresh schedule. */
  schedule?: string;
  /** URL path scope filter. */
  scope?: string;
  /** Default locale (e.g. `de-de`). */
  localeDefault?: string;
}

/** The `ultra.learning` facade sub-API (Module C surface used by the CLI). */
export interface LearningFacade {
  /** Persisted documentation-source library accessors. */
  sources: {
    /** List all sources (seeding the catalogue on first access). */
    list(): Promise<LearnSource[]>;
    /** Register a new source, returning the materialised record. */
    add(source: SourceAddInput): Promise<LearnSource>;
    /** Remove a source by id (`true` when one was removed). */
    remove(id: string): Promise<boolean>;
  };
  /** Plan a learn run: discover candidate pages + cost estimate. */
  plan(sourceId: string): Promise<LearnRunPlan>;
  /**
   * Run a learn job. Without `approved: true` it refuses immediately (no
   * network, no LLM).
   */
  run(
    sourceId: string,
    opts: { approved: boolean; signal?: AbortSignal; onProgress?: (p: LearnProgress) => void },
  ): Promise<LearnRunReport>;
}
