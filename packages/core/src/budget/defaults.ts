/**
 * Central catalogue of default parameters and magic values for the budget
 * module.
 *
 * Every hard-coded threshold, limit, factor, price, filename and seed envelope
 * that used to live inline across `BudgetPlanner.ts`, `pricing.ts` and
 * `paths.ts` is collected here as a named, documented constant. Values are
 * carried over **exactly** — nothing in this file changes runtime behaviour.
 *
 * Constants are grouped by category. Those marked *overridable* have a
 * factory-options / config path that lets embedders replace them at runtime
 * (e.g. `createBudgetPlanner({ fxRate, priceTable })` or wizard answers);
 * the rest are purely internal tuning constants of the cost model.
 */

import type { ModelPrice, PriceTable } from "./types.js";

// --- Cost-formula factors ---

/**
 * System-prompt/context overhead multiplier (`O_sys`) applied to base token
 * counts. Internal cost-model constant.
 */
export const OVERHEAD_FACTOR = 1.2;

/** Retry/variance multiplier (`R`) applied to base token counts. Internal. */
export const RETRY_FACTOR = 1.1;

/** Batch discount multiplier applied to the per-model USD figure. Internal. */
export const BATCH_FACTOR = 0.5;

/**
 * Default safety multiplier on the final cost. Overridable per estimate via
 * {@link EstimateInput.safetyFactor}.
 */
export const DEFAULT_SAFETY_FACTOR = 2.0;

// --- FX & estimate band ---

/**
 * EUR per 1 USD used when no fx rate is configured. Overridable via
 * `createBudgetPlanner({ fxRate })`, plan persistence, or wizard answers.
 */
export const DEFAULT_FX_RATE = 0.92;

/**
 * Lower multiplier bracketing the point USD estimate (heuristic error band).
 * Internal.
 */
export const USD_LOW_FACTOR = 0.85;

/** Upper multiplier bracketing the point USD estimate. Internal. */
export const USD_HIGH_FACTOR = 1.25;

// --- Rounding / token scale ---

/**
 * Scale used to round USD/EUR figures to 6 decimal places
 * (`Math.round(n * ROUND_SCALE) / ROUND_SCALE`). Internal.
 */
export const ROUND_SCALE = 1e6;

/** Tokens per million — divisor converting token counts to per-MTok pricing. */
export const TOKENS_PER_MILLION = 1e6;

// --- Date slicing ---

/** End index of the `YYYY-MM-DD` day key slice on an ISO timestamp. Internal. */
export const DAY_KEY_LENGTH = 10;

/** End index of the `YYYY-MM` month key slice on a day key. Internal. */
export const MONTH_KEY_LENGTH = 7;

// --- Alerts ---

/**
 * Alert thresholds (percent of a limit) that fire at most once per crossing.
 * Internal.
 */
export const ALERT_BANDS: ReadonlyArray<50 | 80 | 100> = [50, 80, 100];

// --- Pricing ---

/** The model id used when an {@link EstimateInput} omits explicit routing. */
export const DEFAULT_MODEL = "mistral-small";

/** Zero-cost price entry shared by `local`/Ollama models. */
export const FREE_PRICE: ModelPrice = { inputPerMTok: 0, outputPerMTok: 0 };

/**
 * Built-in default price table (USD per 1M tokens). Overridable (merged) via
 * `createBudgetPlanner({ priceTable })`.
 *
 * Values follow the module contract: Mistral Small 0.05/0.15, Haiku 0.50/2.50,
 * Sonnet 1.50/7.50, and any local backend at 0.
 */
export const DEFAULT_PRICE_TABLE: PriceTable = {
  "mistral-small": { inputPerMTok: 0.05, outputPerMTok: 0.15 },
  "claude-3-5-haiku": { inputPerMTok: 0.5, outputPerMTok: 2.5 },
  "claude-3-5-sonnet": { inputPerMTok: 1.5, outputPerMTok: 7.5 },
  haiku: { inputPerMTok: 0.5, outputPerMTok: 2.5 },
  sonnet: { inputPerMTok: 1.5, outputPerMTok: 7.5 },
  local: FREE_PRICE,
  ollama: FREE_PRICE,
};

// --- Paths / filenames ---

/** File name of the persisted budget plan (TOML). */
export const PLAN_FILENAME = "plan.toml";

/** File name of the append-only spend ledger (JSON Lines). */
export const LEDGER_FILENAME = "ledger.jsonl";

/** Top-level config directory segment under the home dir. Internal. */
export const BUDGET_DIR_ROOT = ".ultracode";

/** Sub-directory segment holding budget persistence. Internal. */
export const BUDGET_DIR_NAME = "budget";

// --- Plan policy & defaults ---

/** The only implemented plan policy. Internal. */
export const DEFAULT_PLAN_POLICY = "ask-threshold" as const;

// --- Seeds: installDefaultPlan envelopes ---

/**
 * Best-practice default envelopes installed by
 * {@link BudgetPlanner.installDefaultPlan}. Carried over verbatim; serves as a
 * seed users can later override via {@link BudgetPlanner.setPlan}.
 */
export const DEFAULT_PLAN_ENVELOPES: ReadonlyArray<{
  readonly category: "development" | "learning" | "operations";
  readonly perRunUsd: number | null;
  readonly dailyUsd: number | null;
  readonly monthlyUsd: number | null;
  readonly totalUsd: number | null;
  readonly askThresholdUsd: number | null;
}> = [
  {
    category: "development",
    perRunUsd: 2,
    dailyUsd: 10,
    monthlyUsd: 100,
    totalUsd: null,
    askThresholdUsd: 0.5,
  },
  {
    category: "learning",
    perRunUsd: 5,
    dailyUsd: 15,
    monthlyUsd: 50,
    totalUsd: 200,
    askThresholdUsd: 1,
  },
  {
    category: "operations",
    perRunUsd: 1,
    dailyUsd: 5,
    monthlyUsd: 30,
    totalUsd: null,
    askThresholdUsd: 0.25,
  },
];

// --- Seeds: planInteractive wizard fallbacks ---

/** Fallback ask-threshold (USD) when the wizard answer is a falsy non-null. */
export const WIZARD_DEFAULT_ASK_THRESHOLD_USD = 0.5;

/** Fallback monthly cap (USD) for the development envelope in the wizard. */
export const WIZARD_DEVELOPMENT_MONTHLY_USD = 100;

/** Fallback monthly cap (USD) for the learning envelope in the wizard. */
export const WIZARD_LEARNING_MONTHLY_USD = 50;

/** Fallback monthly cap (USD) for the operations envelope in the wizard. */
export const WIZARD_OPERATIONS_MONTHLY_USD = 30;

/** Per-run cap (USD) seeded for the development envelope in the wizard. */
export const WIZARD_DEVELOPMENT_PER_RUN_USD = 2;

/** Per-run cap (USD) seeded for the learning envelope in the wizard. */
export const WIZARD_LEARNING_PER_RUN_USD = 5;

/** Per-run cap (USD) seeded for the operations envelope in the wizard. */
export const WIZARD_OPERATIONS_PER_RUN_USD = 1;

/** Divisor turning a monthly cap into the seeded daily cap (`monthly / N`). */
export const WIZARD_DAILY_FROM_MONTHLY_DIVISOR = 10;
