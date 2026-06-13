/**
 * Core-local error subclasses for the budget module.
 *
 * The frozen `ultracode-shared` error set does not include a budget-specific
 * error, so we extend its abstract {@link UltraCodeError} base with a stable
 * `BUDGET_ERROR` code. Persistence and validation failures inside the budget
 * planner surface as {@link BudgetError}; consumers can still catch the shared
 * {@link UltraCodeError} base.
 */

import { UltraCodeError } from "ultracode-shared";
import type { UltraCodeErrorOptions } from "ultracode-shared";

/** A budget plan/ledger operation failed (load, parse, persist, validate). */
export class BudgetError extends UltraCodeError {
  /**
   * @param message - Human-readable failure description.
   * @param options - Optional `cause`/`details` payload.
   */
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("BUDGET_ERROR", message, options);
  }
}
