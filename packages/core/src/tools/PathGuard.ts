/**
 * PathGuard — security-critical path containment utility.
 *
 * Every file-system touching tool resolves user-supplied paths through this
 * module. A path is only accepted when its fully resolved (symlink-aware) form
 * lies inside the tool's working directory or one of the configured
 * `allowedDirs`. Anything else — `../` traversal, absolute paths outside the
 * sandbox, symlinks escaping the sandbox — is rejected with a {@link ToolError}.
 *
 * Cross-platform notes:
 * - Comparisons are case-insensitive on win32 (NTFS default).
 * - All path math goes through `node:path`; no hard-coded separators.
 * - `~` is expanded via `os.homedir()` (the literal `~` does not exist on
 *   Windows).
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { ToolError } from "ultracode-shared";
import { resolveHome } from "../config/paths.js";

// Integration note: `resolveHome` is consolidated in `../config/paths.js` and
// re-exported here so the tool sandbox and its tests keep a single
// implementation. The config version adds an optional `homeDir` override but is
// otherwise behaviourally identical (`~`, `~/...`, `~\...` expansion).
export { resolveHome };

/** Normalise a path for containment comparison (case-folds on win32). */
function comparable(p: string): string {
  const normalized = path.normalize(p);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * Lexical containment check: is `child` equal to or inside `parent`?
 *
 * Both inputs should be absolute. The check is purely lexical (no file-system
 * access) and case-insensitive on win32.
 *
 * @param parent - candidate ancestor directory (absolute).
 * @param child - candidate descendant path (absolute).
 */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(comparable(parent), comparable(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolve symlinks for a path that may not (fully) exist yet.
 *
 * Walks up to the nearest existing ancestor, resolves that via `fs.realpath`,
 * and re-joins the non-existing remainder. This lets write targets be
 * validated before they are created while still catching symlinked ancestors
 * that point outside the sandbox.
 */
async function realpathDeep(p: string): Promise<string> {
  let current = p;
  const suffix: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(current);
      return suffix.length > 0 ? path.join(real, ...suffix) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        // Even the root could not be resolved — fall back to the lexical form.
        return p;
      }
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

/** Options for {@link resolvePath}. */
export interface ResolvePathOptions {
  /** Additional allow-listed root directories (besides `cwd`). May use `~`. */
  allowedDirs?: readonly string[];
  /** Tool name used in thrown {@link ToolError}s. */
  toolName?: string;
}

/**
 * Resolve `p` against `cwd` and verify the result stays inside the sandbox.
 *
 * The sandbox is `cwd` plus every entry of `options.allowedDirs`. Containment
 * is verified on the **symlink-resolved** path (via `fs.realpath`, with
 * graceful handling of not-yet-existing targets), so `../` traversal, absolute
 * escapes and symlinks pointing outside are all rejected.
 *
 * @param cwd - absolute working directory paths are resolved against.
 * @param p - user-supplied path (relative, absolute, or `~`-prefixed).
 * @param options - allow-list and error attribution.
 * @returns the fully resolved, symlink-free absolute path.
 * @throws {ToolError} when the path escapes the sandbox or is malformed.
 */
export async function resolvePath(
  cwd: string,
  p: string,
  options: ResolvePathOptions = {},
): Promise<string> {
  const toolName = options.toolName ?? "path-guard";
  if (typeof p !== "string" || p.length === 0) {
    throw new ToolError("Path must be a non-empty string", { toolName });
  }
  if (p.includes("\0")) {
    throw new ToolError("Path must not contain NUL bytes", { toolName });
  }

  const absoluteCwd = path.resolve(resolveHome(cwd));
  const target = path.resolve(absoluteCwd, resolveHome(p));

  const roots = [
    absoluteCwd,
    ...(options.allowedDirs ?? []).map((d) => path.resolve(absoluteCwd, resolveHome(d))),
  ];

  const [realTarget, ...realRoots] = await Promise.all([
    realpathDeep(target),
    ...roots.map((r) => realpathDeep(r)),
  ]);

  const contained = realRoots.some((root) => isPathInside(root, realTarget));
  if (!contained) {
    throw new ToolError(
      `Path "${p}" resolves outside of the allowed directories`,
      {
        toolName,
        details: { path: p, resolved: realTarget, allowedRoots: realRoots },
      },
    );
  }
  return realTarget;
}

/**
 * Reusable guard bound to a fixed allow-list.
 *
 * Tools construct one guard at registration time (with their configured
 * `allowedDirs`) and call {@link PathGuard.resolve} per execution with the
 * current `ctx.cwd`.
 */
export class PathGuard {
  private readonly allowedDirs: readonly string[];

  /**
   * @param options - `allowedDirs`: extra roots (besides the per-call `cwd`)
   *   that paths may resolve into. Entries may use `~`.
   */
  constructor(options: { allowedDirs?: readonly string[] } = {}) {
    this.allowedDirs = options.allowedDirs ?? [];
  }

  /**
   * Resolve and validate `p` against `cwd` plus the configured allow-list.
   *
   * @throws {ToolError} when the path escapes the sandbox.
   */
  resolve(cwd: string, p: string, toolName: string): Promise<string> {
    return resolvePath(cwd, p, { allowedDirs: this.allowedDirs, toolName });
  }
}
