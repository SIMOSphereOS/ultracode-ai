/**
 * Core-local types for the budget module.
 *
 * These types live in `core/budget` and are **not** part of the frozen
 * `@ultracode/shared` 1.0 contract. They model cost estimation, spend tracking,
 * and budget-policy decisions for LLM-backed work (authoring, learning,
 * operations).
 *
 * Money is represented in two currencies: estimates are computed in USD (the
 * unit all provider price tables are published in) and presented EUR-first via
 * a configurable {@link CostEstimate.fxRate}. All timestamps are ISO-8601.
 */

/**
 * A budget category / envelope. The three canonical envelopes are
 * `"development"`, `"learning"` and `"operations"`; the open `string` keeps the
 * type extensible for embedders that add their own pots.
 */
export type BudgetCategory = "development" | "learning" | "operations" | (string & {});

/** Per-model spend, broken into input/output tokens and the resulting USD. */
export interface ModelSpend {
  /** Model id (e.g. `"mistral-small"`, `"claude-3-5-haiku"`, `"local"`). */
  model: string;
  /** Estimated input (prompt) tokens billed to this model. */
  tokensIn: number;
  /** Estimated output (completion) tokens billed to this model. */
  tokensOut: number;
  /** Estimated USD cost for this model's share. */
  usd: number;
}

/**
 * A full cost estimate for a unit of work.
 *
 * `usdLow`/`usdHigh` bracket the point estimate to reflect the heuristic
 * token-count error band; `eur` is the point estimate converted at `fxRate`.
 */
export interface CostEstimate {
  /** Number of pages/items the estimate covers, when applicable. */
  pages?: number;
  /** Total estimated input tokens across all models. */
  tokensIn: number;
  /** Total estimated output tokens across all models. */
  tokensOut: number;
  /** Per-model breakdown (sums to the totals above). */
  byModel: ModelSpend[];
  /** Lower bound of the USD estimate (point estimate × low factor). */
  usdLow: number;
  /** Upper bound of the USD estimate (point estimate × high factor). */
  usdHigh: number;
  /** Point-estimate cost converted to EUR at {@link fxRate}. */
  eur: number;
  /** USD→EUR conversion rate used (EUR per 1 USD). */
  fxRate: number;
  /** Human-readable assumptions that fed the estimate. */
  assumptions: string[];
}

/** One leg of a model-routing split: a model and the fraction of work it does. */
export interface RoutingShare {
  /** Model id the share routes to. */
  model: string;
  /** Fraction of items routed to this model (`0..1`; shares are normalised). */
  share: number;
}

/**
 * Input to {@link BudgetPlanner.estimate}.
 *
 * Either supply per-item token counts (`perItemTokensIn`/`perItemTokensOut`)
 * together with `batch`/`pages`, or supply `texts` to have the input token
 * count derived from a {@link TokenCounter}. `routing` defaults to a single
 * default model when omitted.
 */
export interface EstimateInput {
  /** Budget category the work belongs to. */
  category: BudgetCategory;
  /** Pages/items covered (defaults to `batch` or `texts.length` or `1`). */
  pages?: number;
  /** Input tokens per item (ignored when `texts` is given). */
  perItemTokensIn?: number;
  /** Output tokens per item. */
  perItemTokensOut?: number;
  /** Model routing split; defaults to 100 % of the planner's default model. */
  routing?: RoutingShare[];
  /** Number of items in the batch (defaults to `pages`/`texts.length`/`1`). */
  batch?: number;
  /** Safety multiplier on the final cost (defaults to `2.0`). */
  safetyFactor?: number;
  /** When given, input tokens are counted from these texts via the counter. */
  texts?: string[];
}

/** The outcome of checking an estimate against the active budget plan. */
export interface BudgetDecision {
  /** Whether the spend is permitted at all (false only on a hard-cap breach). */
  allowed: boolean;
  /** Whether human approval is required before proceeding. */
  requiresApproval: boolean;
  /** Remaining USD in the relevant envelope after this spend would land. */
  remainingUsd: number;
  /** Hard cap (USD) of the envelope, or `null` when uncapped. */
  capUsd: number | null;
  /** Machine/human readable reason for the decision. */
  reason: string;
}

/** An append-only ledger entry recording an estimated or actual spend. */
export interface LedgerEntry {
  /** ISO-8601 timestamp of the entry. */
  ts: string;
  /** Category the spend is charged to. */
  category: BudgetCategory;
  /** Model id, when the spend is attributable to a single model. */
  model?: string;
  /** Estimated USD at the time the work was planned. */
  estimatedUsd: number;
  /** Actual USD once known (may equal the estimate). */
  actualUsd: number;
  /** Free-form note. */
  note?: string;
}

/** Time window a spending limit resets over. */
export type BudgetPeriod = "run" | "daily" | "monthly" | "total";

/** Limits for one budget envelope. Any field may be `null` to mean "uncapped". */
export interface BudgetEnvelope {
  /** Category this envelope governs. */
  category: BudgetCategory;
  /** Max USD per single run/estimate. */
  perRunUsd: number | null;
  /** Max USD per calendar day (UTC). */
  dailyUsd: number | null;
  /** Max USD per calendar month (UTC). */
  monthlyUsd: number | null;
  /** Max USD over the lifetime of the plan. */
  totalUsd: number | null;
  /**
   * Below this USD-per-run threshold spends auto-approve; at/above it human
   * approval is required. `null` means "always require approval".
   */
  askThresholdUsd: number | null;
}

/** The full, persisted budget plan. */
export interface BudgetPlan {
  /** Plan policy. Only `"ask-threshold"` is implemented today. */
  policy: "ask-threshold";
  /** EUR per 1 USD used for reporting. */
  fxRate: number;
  /** Per-category envelopes. */
  envelopes: BudgetEnvelope[];
  /** ISO-8601 timestamp of the last plan mutation. */
  updatedAt: string;
}

/** Aggregated spend for one category over the standard periods. */
export interface CategoryStatus {
  /** Category. */
  category: BudgetCategory;
  /** USD spent today (UTC). */
  spentTodayUsd: number;
  /** USD spent this month (UTC). */
  spentMonthUsd: number;
  /** USD spent over the lifetime of the ledger. */
  spentTotalUsd: number;
  /** The envelope governing this category, when one exists. */
  envelope: BudgetEnvelope | null;
}

/** Snapshot returned by {@link BudgetPlanner.status}. */
export interface BudgetStatus {
  /** Per-category spend rollup. */
  categories: CategoryStatus[];
  /** Total USD spent across all categories (lifetime). */
  totalSpentUsd: number;
  /** Number of ledger entries seen. */
  entryCount: number;
}

/** Per-model unit price (USD per 1M tokens). */
export interface ModelPrice {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
}

/** Price table: model id → {@link ModelPrice}. */
export type PriceTable = Record<string, ModelPrice>;

/**
 * Narrow injection boundary other core modules (authoring, learning) depend on.
 *
 * Mirrors the subset of {@link BudgetPlanner} those modules need, so they can
 * be constructed against an interface rather than the concrete class.
 */
export interface IBudgetGate {
  /** Estimate the cost of a unit of work. */
  estimate(input: EstimateInput): CostEstimate;
  /** Check an estimate against the active plan for `category`. */
  check(estimate: CostEstimate, category: BudgetCategory): BudgetDecision;
  /** Append a spend record to the ledger. */
  record(entry: LedgerEntry): Promise<void>;
  /** Human-readable cost report ending in a JA/NEIN confirmation prompt. */
  formatReport(estimate: CostEstimate, decision: BudgetDecision): string;
}

/** Answers consumed by {@link BudgetPlanner.planInteractive}. */
export interface PlanWizardAnswers {
  /** EUR per 1 USD (defaults to the planner's fx rate). */
  fxRate?: number;
  /** Monthly cap for the development envelope (USD). */
  developmentMonthlyUsd?: number | null;
  /** Monthly cap for the learning envelope (USD). */
  learningMonthlyUsd?: number | null;
  /** Monthly cap for the operations envelope (USD). */
  operationsMonthlyUsd?: number | null;
  /** Per-run auto-approval threshold applied to every envelope (USD). */
  askThresholdUsd?: number | null;
}
