/**
 * Recursive file-system walker shared by `grep` and `glob`.
 *
 * Pure JS (no ripgrep / find binaries — must work on Windows). Skips a fixed
 * set of noisy directories, never follows symlinks (loop + escape safety) and
 * honours an optional `AbortSignal`.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";

/** Directory names skipped during traversal. */
export const DEFAULT_IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
]);

/** Options for {@link walkFiles}. */
export interface WalkOptions {
  /** Directory names to skip (defaults to {@link DEFAULT_IGNORED_DIRS}). */
  ignoreDirs?: ReadonlySet<string>;
  /** Abort the walk; throws the signal's reason. */
  signal?: AbortSignal;
  /** Hard cap on yielded files (safety valve). Default `100_000`. */
  maxFiles?: number;
}

/**
 * Recursively yield absolute paths of all regular files under `root`.
 *
 * Symlinks (files and directories) are skipped entirely. Unreadable
 * directories are skipped silently. Traversal order is deterministic
 * (directory entries sorted by name).
 *
 * @param root - absolute directory to walk.
 * @param options - ignore list, abort signal, file cap.
 */
export async function* walkFiles(
  root: string,
  options: WalkOptions = {},
): AsyncGenerator<string> {
  const ignore = options.ignoreDirs ?? DEFAULT_IGNORED_DIRS;
  const maxFiles = options.maxFiles ?? 100_000;
  let yielded = 0;

  const stack: string[] = [root];
  while (stack.length > 0) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error("File walk aborted");
    }
    const dir = stack.pop();
    if (dir === undefined) break;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable / vanished directory
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const subdirs: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name)) subdirs.push(full);
        continue;
      }
      if (entry.isFile()) {
        yield full;
        yielded += 1;
        if (yielded >= maxFiles) return;
      }
    }
    // Push in reverse so the stack pops them in sorted order.
    for (let i = subdirs.length - 1; i >= 0; i -= 1) {
      const sub = subdirs[i];
      if (sub !== undefined) stack.push(sub);
    }
  }
}
