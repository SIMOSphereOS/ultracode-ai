/**
 * Pure-JS glob matcher.
 *
 * Supports `**` (any number of path segments), `*` (within a segment), `?`
 * (single character within a segment) and `{a,b}` alternation (including
 * nesting). No external binaries, no `minimatch` — works identically on
 * Linux, macOS and Windows. Patterns always use `/` as separator; candidate
 * paths must be normalised to `/` before matching.
 */

import { ToolError } from "ultracode-shared";

/** Maximum number of patterns a single brace expansion may produce. */
export const MAX_BRACE_EXPANSIONS = 1000;

/**
 * Maximum number of path segments a single glob pattern may contain. Guards
 * against pathological patterns (segment bombs) before regex compilation.
 */
export const MAX_GLOB_SEGMENTS = 100;

/**
 * Expand `{a,b,...}` alternations (recursively, supporting nesting) into the
 * list of plain glob patterns they represent.
 *
 * Unbalanced braces are treated literally. Expansion is capped at
 * {@link MAX_BRACE_EXPANSIONS} to defuse pattern bombs.
 *
 * @throws {ToolError} when the expansion budget is exceeded.
 */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];

  // Find the matching closing brace, tracking nesting depth.
  let depth = 0;
  let close = -1;
  for (let i = open; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [pattern]; // unbalanced — literal

  const prefix = pattern.slice(0, open);
  const body = pattern.slice(open + 1, close);
  const suffix = pattern.slice(close + 1);

  // Split body on top-level commas only.
  const alternatives: string[] = [];
  let current = "";
  let level = 0;
  for (const ch of body) {
    if (ch === "{") level += 1;
    else if (ch === "}") level -= 1;
    if (ch === "," && level === 0) {
      alternatives.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  alternatives.push(current);

  const out: string[] = [];
  for (const alt of alternatives) {
    for (const expanded of expandBraces(prefix + alt + suffix)) {
      out.push(expanded);
      if (out.length > MAX_BRACE_EXPANSIONS) {
        throw new ToolError(
          `Glob pattern expands to more than ${MAX_BRACE_EXPANSIONS} alternatives`,
          { toolName: "glob" },
        );
      }
    }
  }
  return out;
}

/** Escape regex metacharacters in a literal chunk. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert one `/`-separated segment (no `**`) to a regex fragment. */
function segmentToRegex(segment: string): string {
  let out = "";
  for (const ch of segment) {
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += escapeRegex(ch);
  }
  return out;
}

/**
 * Normalise a pattern's segment list:
 * - collapse `//` (empty interior segments),
 * - collapse runs of consecutive `**` into a single `**`.
 *
 * Collapsing consecutive `**` is semantics-preserving (`a/**​/**​/b` matches
 * exactly the same paths as `a/**​/b`) and is the key defence against
 * catastrophic regex backtracking: each non-trailing `**` emits a
 * `(?:[^/]+/)*` group, and several of those in a row produce exponential
 * backtracking on long non-matching inputs.
 */
function normaliseSegments(pattern: string): string[] {
  const raw = pattern.split("/").filter((s, i) => !(s === "" && i > 0)); // collapse `//`
  const out: string[] = [];
  for (const segment of raw) {
    if (segment === "**" && out.length > 0 && out[out.length - 1] === "**") {
      continue; // collapse consecutive `**`
    }
    out.push(segment);
  }
  return out;
}

/**
 * Compile a single (already brace-expanded) glob pattern to an anchored
 * RegExp matching `/`-separated relative paths.
 *
 * @throws {ToolError} when the pattern has more than {@link MAX_GLOB_SEGMENTS}
 *   segments (after normalisation) — a defence against segment bombs.
 */
export function globToRegExp(pattern: string): RegExp {
  const segments = normaliseSegments(pattern);
  if (segments.length > MAX_GLOB_SEGMENTS) {
    throw new ToolError(`Glob pattern has more than ${MAX_GLOB_SEGMENTS} path segments`, {
      toolName: "glob",
    });
  }
  let re = "^";
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] ?? "";
    const isLast = i === segments.length - 1;
    if (segment === "**") {
      if (isLast) {
        // `src/**` matches everything under src (at least one segment).
        re += ".*";
      } else {
        // `a/**/b` matches a/b, a/x/b, a/x/y/b, …
        re += "(?:[^/]+/)*";
      }
      continue;
    }
    re += segmentToRegex(segment);
    if (!isLast) re += "/";
  }
  re += "$";
  return new RegExp(re);
}

/** A compiled glob: tests `/`-separated relative paths. */
export type GlobMatcher = (relativePath: string) => boolean;

/**
 * Compile a glob pattern (with brace alternation) into a matcher function.
 *
 * @throws {ToolError} when the pattern is malformed or expands too far.
 */
export function compileGlob(pattern: string): GlobMatcher {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new ToolError("Glob pattern must be a non-empty string", { toolName: "glob" });
  }
  const regexes = expandBraces(pattern).map((p) => globToRegExp(p));
  return (relativePath: string) => regexes.some((r) => r.test(relativePath));
}

/**
 * One-shot convenience: does `relativePath` (using `/` separators) match the
 * glob `pattern`?
 */
export function matchGlob(pattern: string, relativePath: string): boolean {
  return compileGlob(pattern)(relativePath);
}
