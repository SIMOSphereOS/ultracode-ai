/**
 * Cross-platform path helpers for the memory subsystem.
 *
 * Shared constants such as `DEFAULT_SESSION_DIR` use a `~` prefix that does
 * not exist on Windows; {@link resolveHome} expands it via `os.homedir()`.
 */

import os from "node:os";
import path from "node:path";

/**
 * Expand a leading `~` (the user's home directory) in a path.
 *
 * Handles `~`, `~/...` and `~\...` (Windows separators). Any other value —
 * including `~user/...` — is returned unchanged. The result uses the
 * platform's native separators via `path.join`.
 *
 * @param p - A path that may start with `~`.
 * @returns The expanded, platform-native path.
 */
export function resolveHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
