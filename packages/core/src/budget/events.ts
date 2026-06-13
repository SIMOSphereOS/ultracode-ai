/**
 * Core-local budget reporting events.
 *
 * The frozen `ultracode-shared` `UltraCodeEvent` union is 1.0 and not extended
 * here. We define separate, core-local event types and tiny emitters that
 * publish them onto any provided {@link IEventBus} via a structural cast,
 * falling back to `logger` when no bus is available. Subscribers that know the
 * `"budget.*"` string types can listen for them; the shared union is untouched.
 */

import type { IEventBus, Logger } from "ultracode-shared";
import type { BudgetCategory, BudgetDecision, CostEstimate, LedgerEntry } from "./types.js";

/** Discriminator: a budget check completed (allowed/approval decision made). */
export const BUDGET_CHECKED_EVENT = "budget.checked" as const;
/** Discriminator: a hard cap was exceeded (spend refused). */
export const BUDGET_EXCEEDED_EVENT = "budget.exceeded" as const;
/** Discriminator: a spend was recorded to the ledger. */
export const BUDGET_SPENT_EVENT = "budget.spent" as const;

/** Emitted whenever {@link BudgetPlanner.check} resolves a decision. */
export interface BudgetCheckedEvent {
  type: typeof BUDGET_CHECKED_EVENT;
  /** Category the estimate was checked against. */
  category: BudgetCategory;
  /** Estimated USD (point estimate). */
  estimatedUsd: number;
  /** The decision returned to the caller. */
  decision: BudgetDecision;
}

/** Emitted when a hard cap is breached and the spend is refused. */
export interface BudgetExceededEvent {
  type: typeof BUDGET_EXCEEDED_EVENT;
  /** Category whose cap was breached. */
  category: BudgetCategory;
  /** Estimated USD that would have been spent. */
  estimatedUsd: number;
  /** The cap (USD) that would have been exceeded. */
  capUsd: number;
  /** Which period's cap was breached. */
  scope: "run" | "daily" | "monthly" | "total";
}

/** Emitted after a ledger entry is appended. */
export interface BudgetSpentEvent {
  type: typeof BUDGET_SPENT_EVENT;
  /** The recorded ledger entry. */
  entry: LedgerEntry;
  /** Lifetime USD spent in this category after the entry. */
  categoryTotalUsd: number;
}

/** Emitted when cumulative spend crosses a 50/80/100 % alert threshold. */
export interface BudgetAlertEvent {
  /** Alert discriminator (`"budget.alert"`). */
  type: "budget.alert";
  /** Category that crossed a threshold. */
  category: BudgetCategory;
  /** Which limit (period) the threshold is measured against. */
  scope: "daily" | "monthly" | "total";
  /** The percentage band crossed (50, 80 or 100). */
  pct: 50 | 80 | 100;
  /** USD spent so far against the limit. */
  spentUsd: number;
  /** The limit (USD) the percentage is relative to. */
  limitUsd: number;
}

/** Any core-local budget event. */
export type BudgetEvent =
  | BudgetCheckedEvent
  | BudgetExceededEvent
  | BudgetSpentEvent
  | BudgetAlertEvent;

/**
 * Publish a budget event onto `events` (structurally, keeping the shared union
 * frozen) and always log a one-line summary via `logger`. Never throws.
 *
 * @param event - The core-local budget event to publish.
 * @param events - Optional event bus.
 * @param logger - Optional logger for the summary line.
 */
export function emitBudgetEvent(
  event: BudgetEvent,
  events: IEventBus | undefined,
  logger: Logger | undefined,
): void {
  try {
    (events as { emit?: (e: unknown) => void } | undefined)?.emit?.(event);
  } catch {
    /* the bus isolates handler errors; belt-and-braces */
  }
  switch (event.type) {
    case BUDGET_CHECKED_EVENT:
      logger?.info("budget.checked", {
        category: event.category,
        estimatedUsd: event.estimatedUsd,
        allowed: event.decision.allowed,
        requiresApproval: event.decision.requiresApproval,
      });
      break;
    case BUDGET_EXCEEDED_EVENT:
      logger?.warn("budget.exceeded", {
        category: event.category,
        estimatedUsd: event.estimatedUsd,
        capUsd: event.capUsd,
        scope: event.scope,
      });
      break;
    case BUDGET_SPENT_EVENT:
      logger?.info("budget.spent", {
        category: event.entry.category,
        actualUsd: event.entry.actualUsd,
        categoryTotalUsd: event.categoryTotalUsd,
      });
      break;
    case "budget.alert":
      logger?.warn("budget.alert", {
        category: event.category,
        scope: event.scope,
        pct: event.pct,
        spentUsd: event.spentUsd,
        limitUsd: event.limitUsd,
      });
      break;
  }
}
