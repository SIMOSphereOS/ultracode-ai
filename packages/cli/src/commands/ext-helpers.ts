/**
 * Shared helpers for the budget/authoring/learning command groups.
 *
 * The `@ultracode/core` `UltraCode` facade now exposes the additive
 * `budget` / `authoring` / `learning` sub-APIs directly (Modules A/B/C of
 * v1.2.0), so these helpers simply create/dispose a facade and narrow to the
 * relevant sub-API — no casts, no ambient shapes.
 */

import type { BudgetFacade, AuthoringFacade, LearningFacade } from "@ultracode/core";
import type { CliContext, UltraCodeFacade } from "../context.js";
import { safeDispose } from "../context.js";

/** The facade as consumed by the budget/authoring/learning command groups. */
export type ExtendedFacade = UltraCodeFacade;

/**
 * Run `fn` against a freshly created facade, always disposing it afterwards
 * (even on throw). Mirrors the `withFacade` pattern of the other command
 * groups.
 */
export async function withExtFacade<T>(
  ctx: CliContext,
  fn: (facade: ExtendedFacade) => Promise<T>,
): Promise<T> {
  const facade = await ctx.createFacade({ cwd: ctx.cwd });
  try {
    return await fn(facade);
  } finally {
    await safeDispose(facade);
  }
}

/** Narrow accessor for the budget sub-API. */
export function budgetOf(facade: ExtendedFacade): BudgetFacade {
  return facade.budget;
}

/** Narrow accessor for the authoring sub-API. */
export function authoringOf(facade: ExtendedFacade): AuthoringFacade {
  return facade.authoring;
}

/** Narrow accessor for the learning sub-API. */
export function learningOf(facade: ExtendedFacade): LearningFacade {
  return facade.learning;
}
