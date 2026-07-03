/**
 * Cross-platform path helpers for the budget subsystem.
 *
 * Persistence lives under `~/.ultracode/budget/` (`plan.toml` + `ledger.jsonl`).
 * `~` is expanded via the canonical {@link resolveHome} from `../config/paths`
 * so behaviour is identical on Linux, macOS and Windows.
 */

import * as os from "node:os";
import * as path from "node:path";

import { resolveHome } from "../config/paths.js";
import { BUDGET_DIR_NAME, BUDGET_DIR_ROOT, LEDGER_FILENAME, PLAN_FILENAME } from "./defaults.js";

export { LEDGER_FILENAME, PLAN_FILENAME };

/**
 * Absolute path of the budget directory (`~/.ultracode/budget`).
 *
 * @param homeDir - Home directory override (defaults to `os.homedir()`).
 */
export function budgetDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, BUDGET_DIR_ROOT, BUDGET_DIR_NAME);
}

/**
 * Absolute path of the budget plan file.
 *
 * @param homeDir - Home directory override.
 */
export function planFile(homeDir: string = os.homedir()): string {
  return path.join(budgetDir(homeDir), PLAN_FILENAME);
}

/**
 * Absolute path of the budget ledger file.
 *
 * @param homeDir - Home directory override.
 */
export function ledgerFile(homeDir: string = os.homedir()): string {
  return path.join(budgetDir(homeDir), LEDGER_FILENAME);
}

export { resolveHome };
