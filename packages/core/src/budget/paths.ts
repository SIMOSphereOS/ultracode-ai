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

/** File name of the persisted budget plan (TOML). */
export const PLAN_FILENAME = "plan.toml";
/** File name of the append-only spend ledger (JSON Lines). */
export const LEDGER_FILENAME = "ledger.jsonl";

/**
 * Absolute path of the budget directory (`~/.ultracode/budget`).
 *
 * @param homeDir - Home directory override (defaults to `os.homedir()`).
 */
export function budgetDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".ultracode", "budget");
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
