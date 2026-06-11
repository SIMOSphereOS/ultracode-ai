/**
 * Cross-platform `~` expansion.
 *
 * The shared constants (`USER_CONFIG_DIR`, `USER_ENV_FILE`, ...) are
 * tilde-prefixed. `~` does not exist on Windows, so every consumer must expand
 * it via this helper before touching the filesystem.
 */

import os from "node:os";
import path from "node:path";

/**
 * Expand a leading `~` (or `~/`, `~\`) to the user's home directory.
 *
 * Paths without a leading tilde are returned unchanged. `~user` style paths
 * are NOT expanded (not portable).
 *
 * @param p - the (possibly tilde-prefixed) path.
 * @param homedir - home directory override, mainly for tests; defaults to
 *   `os.homedir()`.
 */
export function resolveHome(p: string, homedir: string = os.homedir()): string {
  if (p === "~") return homedir;
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(homedir, p.slice(2));
  }
  return p;
}
