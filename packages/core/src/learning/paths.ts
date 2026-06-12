/**
 * Cross-platform path helpers for `core/learning`.
 *
 * Persistence lives under `~/.ultracode/learning/`, expanded from `~` via the
 * canonical {@link resolveHome} (re-exported from the config module). All path
 * building uses `node:path` so Windows separators behave correctly.
 */

import os from "node:os";
import path from "node:path";

import { resolveHome } from "../config/paths.js";

export { resolveHome } from "../config/paths.js";

/** Root learning directory (`~/.ultracode/learning`). */
export function learningDir(homeDir: string = os.homedir()): string {
  return path.join(resolveHome("~", homeDir), ".ultracode", "learning");
}

/** Absolute path of the TOML source library (`learning/sources.toml`). */
export function sourcesFile(homeDir: string = os.homedir()): string {
  return path.join(learningDir(homeDir), "sources.toml");
}

/** Directory holding per-source crawl state/checkpoints (`learning/state`). */
export function stateDir(homeDir: string = os.homedir()): string {
  return path.join(learningDir(homeDir), "state");
}

/**
 * Absolute path of a source's state file under {@link stateDir}.
 *
 * The `sourceId` is sanitised to a safe slug to defend against traversal
 * (`../`) and separators leaking into the filesystem path.
 */
export function stateFile(sourceId: string, ext: string, homeDir: string = os.homedir()): string {
  const safe = sanitizeId(sourceId);
  return path.join(stateDir(homeDir), `${safe}.${ext}`);
}

/**
 * Reduce an arbitrary id to a filesystem-safe slug (alphanumerics, dash,
 * underscore). Empty results collapse to `"_"` so a file name always exists.
 */
export function sanitizeId(id: string): string {
  const slug = id.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "_";
}
