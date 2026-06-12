/**
 * Default provider price table and pricing helpers.
 *
 * Prices are USD per 1,000,000 tokens, split into input (prompt) and output
 * (completion). The `"local"` / Ollama backends cost nothing. The table is a
 * sensible default; embedders may override any subset via
 * `createBudgetPlanner({ priceTable })`.
 *
 * The concrete values live in {@link ./defaults.ts}; they are re-exported here
 * to preserve the established `./pricing.js` public surface.
 */

import type { ModelPrice, PriceTable } from "./types.js";
import {
  DEFAULT_FX_RATE,
  DEFAULT_MODEL,
  DEFAULT_PRICE_TABLE,
  FREE_PRICE,
  USD_HIGH_FACTOR,
  USD_LOW_FACTOR,
} from "./defaults.js";

export {
  DEFAULT_FX_RATE,
  DEFAULT_MODEL,
  DEFAULT_PRICE_TABLE,
  FREE_PRICE,
  USD_HIGH_FACTOR,
  USD_LOW_FACTOR,
};

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
