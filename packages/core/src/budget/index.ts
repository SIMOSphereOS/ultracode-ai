/**
 * `ultracode-core/budget` — deterministic, offline budget planning.
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

export type { BudgetPlannerOptions } from "./BudgetPlanner.js";
export {
  BudgetPlanner,
  createBudgetPlanner,
} from "./BudgetPlanner.js";
export {
  ALERT_BANDS,
  BATCH_FACTOR,
  BUDGET_DIR_NAME,
  BUDGET_DIR_ROOT,
  DAY_KEY_LENGTH,
  DEFAULT_PLAN_ENVELOPES,
  DEFAULT_PLAN_POLICY,
  DEFAULT_SAFETY_FACTOR,
  MONTH_KEY_LENGTH,
  OVERHEAD_FACTOR,
  RETRY_FACTOR,
  ROUND_SCALE,
  TOKENS_PER_MILLION,
  WIZARD_DAILY_FROM_MONTHLY_DIVISOR,
  WIZARD_DEFAULT_ASK_THRESHOLD_USD,
  WIZARD_DEVELOPMENT_MONTHLY_USD,
  WIZARD_DEVELOPMENT_PER_RUN_USD,
  WIZARD_LEARNING_MONTHLY_USD,
  WIZARD_LEARNING_PER_RUN_USD,
  WIZARD_OPERATIONS_MONTHLY_USD,
  WIZARD_OPERATIONS_PER_RUN_USD,
} from "./defaults.js";
export { BudgetError } from "./errors.js";
export type {
  BudgetAlertEvent,
  BudgetCheckedEvent,
  BudgetEvent,
  BudgetExceededEvent,
  BudgetSpentEvent,
} from "./events.js";
export {
  BUDGET_CHECKED_EVENT,
  BUDGET_EXCEEDED_EVENT,
  BUDGET_SPENT_EVENT,
  emitBudgetEvent,
} from "./events.js";
export {
  budgetDir,
  LEDGER_FILENAME,
  ledgerFile,
  PLAN_FILENAME,
  planFile,
} from "./paths.js";
export {
  DEFAULT_FX_RATE,
  DEFAULT_MODEL,
  DEFAULT_PRICE_TABLE,
  FREE_PRICE,
  priceFor,
  USD_HIGH_FACTOR,
  USD_LOW_FACTOR,
} from "./pricing.js";

export type {
  BudgetCategory,
  BudgetDecision,
  BudgetEnvelope,
  BudgetPeriod,
  BudgetPlan,
  BudgetStatus,
  CategoryStatus,
  CostEstimate,
  EstimateInput,
  IBudgetGate,
  LedgerEntry,
  ModelPrice,
  ModelSpend,
  PlanWizardAnswers,
  PriceTable,
  RoutingShare,
} from "./types.js";
