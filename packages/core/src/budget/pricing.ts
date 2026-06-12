/**
 * Default provider price table and pricing helpers.
 *
 * Prices are USD per 1,000,000 tokens, split into input (prompt) and output
 * (completion). The `"local"` / Ollama backends cost nothing. The table is a
 * sensible default; embedders may override any subset via
 * `createBudgetPlanner({ priceTable })`.
 */

import type { ModelPrice, PriceTable } from "./types.js";

/** EUR per 1 USD used when no fx rate is configured. */
export const DEFAULT_FX_RATE = 0.92;

/** Low/high multipliers bracketing the point USD estimate (heuristic error band). */
export const USD_LOW_FACTOR = 0.85;
/** Upper multiplier bracketing the point USD estimate. */
export const USD_HIGH_FACTOR = 1.25;

/** Zero-cost price entry shared by `local`/Ollama models. */
export const FREE_PRICE: ModelPrice = { inputPerMTok: 0, outputPerMTok: 0 };

/**
 * Built-in default price table (USD per 1M tokens).
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

/** The model id used when an {@link EstimateInput} omits explicit routing. */
export const DEFAULT_MODEL = "mistral-small";

/**
 * Resolve the {@link ModelPrice} for `model`, treating any `local`/`ollama`
 * variant as free and falling back to the default model's price for unknown
 * ids (so an estimate is never silently zero for a real cloud model).
 *
 * @param model - Model id to price.
 * @param table - Active price table.
 */
export function priceFor(model: string, table: PriceTable): ModelPrice {
  const direct = table[model];
  if (direct) return direct;
  const lower = model.toLowerCase();
  if (lower === "local" || lower.includes("ollama")) return FREE_PRICE;
  return table[DEFAULT_MODEL] ?? FREE_PRICE;
}
