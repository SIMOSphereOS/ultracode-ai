/**
 * `@ultracode/core/budget` — deterministic, offline budget planning.
 *
 * Public surface:
 * - {@link BudgetPlanner} / {@link createBudgetPlanner} — cost estimation,
 *   ask-threshold policy checks, atomic append-only ledger, plan management.
 * - The {@link IBudgetGate} injection boundary other core modules depend on.
 * - The cost/plan/ledger types and the default price table.
 * - The core-local `budget.checked` / `budget.exceeded` / `budget.spent` /
 *   `budget.alert` reporting events.
 *
 * Persistence lives under `~/.ultracode/budget/` (`plan.toml`, `ledger.jsonl`).
 */

export {
  BudgetPlanner,
  createBudgetPlanner,
} from "./BudgetPlanner.js";
export type { BudgetPlannerOptions } from "./BudgetPlanner.js";

export { BudgetError } from "./errors.js";

export {
  DEFAULT_PRICE_TABLE,
  DEFAULT_FX_RATE,
  DEFAULT_MODEL,
  FREE_PRICE,
  USD_LOW_FACTOR,
  USD_HIGH_FACTOR,
  priceFor,
} from "./pricing.js";

export {
  budgetDir,
  planFile,
  ledgerFile,
  PLAN_FILENAME,
  LEDGER_FILENAME,
} from "./paths.js";

export {
  BUDGET_CHECKED_EVENT,
  BUDGET_EXCEEDED_EVENT,
  BUDGET_SPENT_EVENT,
  emitBudgetEvent,
} from "./events.js";
export type {
  BudgetEvent,
  BudgetCheckedEvent,
  BudgetExceededEvent,
  BudgetSpentEvent,
  BudgetAlertEvent,
} from "./events.js";

export type {
  BudgetCategory,
  ModelSpend,
  CostEstimate,
  RoutingShare,
  EstimateInput,
  BudgetDecision,
  LedgerEntry,
  BudgetPeriod,
  BudgetEnvelope,
  BudgetPlan,
  CategoryStatus,
  BudgetStatus,
  ModelPrice,
  PriceTable,
  IBudgetGate,
  PlanWizardAnswers,
} from "./types.js";
