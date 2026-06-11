/**
 * Worker-thread entry point for {@link GrepTool}.
 *
 * The complete walk-and-match runs **off the main thread** so that a
 * catastrophic-backtracking (ReDoS) user regex — whose synchronous
 * `RegExp.prototype.test()` cannot be interrupted between input characters —
 * blocks only this worker, never the host event loop. The host enforces the
 * effective per-tool timeout by hard-terminating the worker
 * (`worker.terminate()`); a single pathological non-matching line therefore
 * fails fast as a timeout instead of hanging the process for minutes.
 *
 * Loaded as an ESM module worker. Resolved against the compiled sibling
 * (`grepWorker.js` in `dist/`) at runtime, with a `.ts` fallback for the vitest
 * transform pipeline — see {@link GrepTool}.
 *
 * IMPORTANT: this module is **self-contained** (only `node:*` builtins). A
 * `.ts` worker spawned under vitest is loaded by Node's native ESM loader, not
 * vitest's transform pipeline, so relative `./*.js` imports of sibling source
 * files would fail to resolve. The few helpers it needs (line splitting,
 * Unicode-safe truncation, the directory walk) are therefore inlined; they are
 * kept byte-for-byte equivalent to the shared implementations in `fsUtils.ts`,
 * `walk.ts` and `@ultracode/shared`'s `truncate`, which the main-thread code
 * still imports — so grep behaviour is identical.
 */

import nodePath from "node:path";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

/** Input handed to the worker via `workerData`. */
export interface GrepWorkerInput {
  /** User regex source. */
  pattern: string;
  /** Validated regex flags (subset of `imsu`). */
  flags: string;
  /** Resolved, sandbox-checked absolute search root (dir or single file). */
  root: string;
  /** `true` when `root` is a single file rather than a directory. */
  isFile: boolean;
  /** Base directory for relative-path reporting. */
  base: string;
  /** Hard cap on matches. */
  limit: number;
  /** Files larger than this (bytes) are skipped. */
  maxFileBytes: number;
  /** Reported match-line text is capped to this many code points. */
  maxLineChars: number;
}

/** A single grep match (mirrors `GrepMatch` in the tool). */
export interface GrepWorkerMatch {
  file: string;
  line: number;
  text: string;
}

/** Minimal JSON-safe error shape (mirror of shared `SerializedError`). */
export interface GrepWorkerError {
  name: string;
  message: string;
}

/** Message posted back to the host on completion. */
export type GrepWorkerResult =
  | { ok: true; matches: GrepWorkerMatch[]; limitReached: boolean }
  | { ok: false; error: GrepWorkerError };

/** Directory names skipped during traversal (mirror of `DEFAULT_IGNORED_DIRS`). */
const IGNORED_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git", "dist", "coverage"]);

/** Hard cap on walked files (mirror of `walkFiles`' default). */
const MAX_WALK_FILES = 100_000;

/** Split content into lines, tolerating `\n` and `\r\n` (mirror of `splitLines`). */
function splitLines(content: string): string[] {
  return content.split(/\r\n|\n/);
}

/**
 * Unicode-safe truncation to `max` code points without splitting a surrogate
 * pair (mirror of shared `truncate`, default suffix `…`).
 */
function truncate(value: string, max: number): string {
  if (max <= 0) return "";
  if (value.length <= max) return value;
  const chars = [...value];
  if (chars.length <= max) return value;
  const suffix = "…";
  const keep = Math.max(0, max - suffix.length);
  return chars.slice(0, keep).join("") + suffix;
}

/**
 * Recursively yield absolute paths of regular files under `root` (mirror of
 * `walkFiles`): skips ignored dirs, never follows symlinks, deterministic order.
 */
async function* walkFiles(root: string): AsyncGenerator<string> {
  let yielded = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
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
      const full = nodePath.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) subdirs.push(full);
        continue;
      }
      if (entry.isFile()) {
        yield full;
        yielded += 1;
        if (yielded >= MAX_WALK_FILES) return;
      }
    }
    for (let i = subdirs.length - 1; i >= 0; i -= 1) {
      const sub = subdirs[i];
      if (sub !== undefined) stack.push(sub);
    }
  }
}

/** Search a single file's contents, pushing matches; returns `"limit"` at the cap. */
async function searchFile(
  file: string,
  base: string,
  regex: RegExp,
  matches: GrepWorkerMatch[],
  input: GrepWorkerInput,
): Promise<"ok" | "limit"> {
  let buf: Buffer;
  try {
    const stat = await fs.stat(file);
    if (stat.size > input.maxFileBytes) return "ok";
    buf = await fs.readFile(file);
  } catch {
    return "ok"; // unreadable / vanished
  }
  // Binary heuristic: NUL byte in the first 8 KiB.
  if (buf.subarray(0, 8192).includes(0)) return "ok";

  const lines = splitLines(buf.toString("utf8"));
  const rel = nodePath.relative(base, file).split(nodePath.sep).join("/");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    // No haystack cap: the worker can run a pathological line to completion
    // because the host terminates it on timeout — the real ReDoS defence.
    if (regex.test(line)) {
      matches.push({ file: rel, line: i + 1, text: truncate(line, input.maxLineChars) });
      if (matches.length >= input.limit) return "limit";
    }
  }
  return "ok";
}

/** Coerce an unknown thrown value into a JSON-safe error shape. */
function toWorkerError(err: unknown): GrepWorkerError {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: "Error", message: String(err) };
}

/** Run the full search and resolve to a structured result (never throws). */
export async function runSearch(input: GrepWorkerInput): Promise<GrepWorkerResult> {
  let regex: RegExp;
  try {
    regex = new RegExp(input.pattern, input.flags);
  } catch (err) {
    return { ok: false, error: toWorkerError(err) };
  }

  const matches: GrepWorkerMatch[] = [];
  let limitReached = false;
  try {
    const files: AsyncIterable<string> | string[] = input.isFile
      ? [input.root]
      : walkFiles(input.root);
    for await (const file of files) {
      if ((await searchFile(file, input.base, regex, matches, input)) === "limit") {
        limitReached = true;
        break;
      }
    }
  } catch (err) {
    return { ok: false, error: toWorkerError(err) };
  }
  return { ok: true, matches, limitReached };
}

// Entry: only run when actually executed as a worker (guards accidental import).
if (parentPort) {
  const port = parentPort;
  void runSearch(workerData as GrepWorkerInput).then(
    (result) => port.postMessage(result),
    (err) => port.postMessage({ ok: false, error: toWorkerError(err) } satisfies GrepWorkerResult),
  );
}
