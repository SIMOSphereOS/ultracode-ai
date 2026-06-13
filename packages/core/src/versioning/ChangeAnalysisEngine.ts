/**
 * Change Analysis Engine — the data-gathering half of the AI versioning layer.
 *
 * Collects file changes, parsed commits, breaking changes (from commit
 * metadata and a lightweight API diff of exported symbols) and static
 * security findings for a git revision range.
 */

import { VersioningError } from "ultracode-shared";
import type {
  BreakingChange,
  ChangeAnalysis,
  CommitInfo,
  FileChange,
  Logger,
  SecurityFinding,
} from "ultracode-shared";
import { GitClient } from "./GitClient.js";
import type { GitRunner } from "./GitClient.js";
import { hasBreakingFooter, parseConventionalSubject } from "./conventional.js";
import { scanFileForFindings } from "./securityRules.js";

/** Well-known SHA-1 hash of git's empty tree (used to diff a full history). */
const EMPTY_TREE_SHA1 = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Field/record separators for `git log` parsing (ASCII unit/record separator). */
const FIELD_SEP = "\u001f";
const RECORD_SEP = "\u001e";

/** Extensions considered for the exported-symbol API diff. */
const API_DIFF_FILE_RE = /\.(ts|tsx|mts|cts)$/;

/**
 * Rejects a user-controlled git ref token that would be parsed as an option by
 * the git CLI (anything beginning with `-`). Without this guard a crafted
 * range such as `--output=/tmp/x` or `-foo` would be passed straight through to
 * `git log`/`git diff`, enabling argument injection (e.g. arbitrary file
 * writes). The literal `--` separator added at each call site cannot precede a
 * revision argument, so leading-dash refs must be refused outright.
 */
function assertSafeRef(ref: string, kind: "base" | "head" | "range"): void {
  if (ref.startsWith("-")) {
    throw new VersioningError(
      `invalid git ${kind} "${ref}": refs must not begin with "-" (argument injection guard)`,
      { details: { kind, ref } },
    );
  }
}

/** Construction options for {@link ChangeAnalysisEngine}. */
export interface ChangeAnalysisEngineOptions {
  /** Repository working directory. */
  cwd: string;
  /** Logger for diagnostics. */
  logger: Logger;
  /** Pre-built git client (wins over {@link ChangeAnalysisEngineOptions.runner}). */
  git?: GitClient;
  /** Injectable git runner for tests. */
  runner?: GitRunner;
  /** Abort signal applied to all git commands. */
  signal?: AbortSignal;
}

/** A fully-zeroed {@link ChangeAnalysis} (e.g. for repositories without commits). */
function emptyAnalysis(): ChangeAnalysis {
  return {
    files: [],
    commits: [],
    breakingChanges: [],
    categories: { feat: 0, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 },
    securityFindings: [],
  };
}

/** Internal: resolved revision range. */
interface ResolvedRange {
  /** Base revision for diffs (may be the empty tree for full history). */
  base: string;
  /** Head revision. */
  head: string;
  /** Range argument for `git log`, or `undefined` for the full history. */
  logRange: string | undefined;
}

/**
 * Analyses a git revision range and produces a {@link ChangeAnalysis}.
 *
 * Default range: `<last tag>..HEAD`; when no tag exists the entire history is
 * analysed. Throws {@link VersioningError} when the directory is not a git
 * repository or git is unavailable. A repository without commits yields an
 * empty analysis instead of an error.
 */
export class ChangeAnalysisEngine {
  private readonly git: GitClient;
  private readonly logger: Logger;

  constructor(options: ChangeAnalysisEngineOptions) {
    this.logger = options.logger;
    this.git =
      options.git ??
      new GitClient({
        cwd: options.cwd,
        ...(options.runner !== undefined ? { runner: options.runner } : {}),
        logger: options.logger,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
  }

  /**
   * Runs the full analysis for the given range (e.g. `"v1.0.0..HEAD"`,
   * `"v1.0.0"`, or omitted for the default last-tag range).
   */
  public async analyze(range?: string): Promise<ChangeAnalysis> {
    if (!(await this.git.isInsideWorkTree())) {
      throw new VersioningError("not a git repository — run inside a git work tree", {
        details: { range },
      });
    }
    if (!(await this.git.hasCommits())) {
      this.logger.debug("versioning: repository has no commits, returning empty analysis");
      return emptyAnalysis();
    }

    const resolved = await this.resolveRange(range);
    const commits = await this.collectCommits(resolved.logRange);
    const renames = new Map<string, string>();
    const files = await this.collectFiles(resolved.base, resolved.head, renames);

    const breakingChanges: BreakingChange[] = commits
      .filter((c) => c.breaking)
      .map((c) => ({
        source: "commit" as const,
        description: c.subject,
        location: c.hash,
      }));
    breakingChanges.push(...(await this.apiDiff(resolved.base, resolved.head, files, renames)));

    const securityFindings = await this.scanSecurity(resolved.head, files);
    const categories = this.tally(commits);

    return { files, commits, breakingChanges, categories, securityFindings };
  }

  /** Resolves an explicit or default range to base/head revisions. */
  private async resolveRange(range?: string): Promise<ResolvedRange> {
    if (range !== undefined && range.trim() !== "") {
      const trimmed = range.trim();
      assertSafeRef(trimmed, "range");
      const match = /^(.*?)\.{2,3}(.*)$/.exec(trimmed);
      if (match) {
        const base = (match[1] ?? "").trim() || "HEAD";
        const head = (match[2] ?? "").trim() || "HEAD";
        assertSafeRef(base, "base");
        assertSafeRef(head, "head");
        return { base, head, logRange: `${base}..${head}` };
      }
      return { base: trimmed, head: "HEAD", logRange: `${trimmed}..HEAD` };
    }
    const tag = await this.git.lastTag();
    if (tag !== null) {
      return { base: tag, head: "HEAD", logRange: `${tag}..HEAD` };
    }
    return { base: await this.emptyTreeHash(), head: "HEAD", logRange: undefined };
  }

  /** Hash of the empty tree, computed cross-platform with a constant fallback. */
  private async emptyTreeHash(): Promise<string> {
    const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
    const out = await this.git.tryOutput(["hash-object", "-t", "tree", nullDevice]);
    const hash = out?.trim();
    return hash ? hash : EMPTY_TREE_SHA1;
  }

  /** Collects and parses commits via `git log` with unambiguous separators. */
  private async collectCommits(logRange: string | undefined): Promise<CommitInfo[]> {
    const args = ["log", `--format=%H${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`];
    if (logRange !== undefined) args.push(logRange);
    // Separate revisions from pathspecs so a crafted range can never be
    // reinterpreted as a path; leading-dash refs are already rejected upstream.
    args.push("--");
    const out = await this.git.output(args);
    const commits: CommitInfo[] = [];
    for (const record of out.split(RECORD_SEP)) {
      if (record.trim() === "") continue;
      const parts = record.replace(/^\r?\n/, "").split(FIELD_SEP);
      const hash = (parts[0] ?? "").trim();
      if (hash === "") continue;
      const subject = parts[1] ?? "";
      const body = parts[2] ?? "";
      const parsed = parseConventionalSubject(subject);
      commits.push({
        hash,
        type: parsed.type,
        scope: parsed.scope,
        subject,
        breaking: parsed.breakingMarker || hasBreakingFooter(body),
      });
    }
    return commits;
  }

  /**
   * Collects file changes from `git diff --name-status` plus `--numstat`. When
   * `renames` is supplied, each renamed file's `new path → old path` mapping is
   * recorded so the API diff can compare the old and new exported symbols.
   */
  private async collectFiles(
    base: string,
    head: string,
    renames?: Map<string, string>,
  ): Promise<FileChange[]> {
    const nameStatusOut = await this.git.output([
      "diff",
      "--name-status",
      "-M",
      "-z",
      base,
      head,
      "--",
    ]);
    const numstatOut = await this.git.output(["diff", "--numstat", "-M", "-z", base, head, "--"]);

    const counts = this.parseNumstat(numstatOut);
    const files: FileChange[] = [];
    const tokens = nameStatusOut.split("\0");
    let i = 0;
    while (i < tokens.length) {
      const statusToken = tokens[i] ?? "";
      if (statusToken.trim() === "") {
        i += 1;
        continue;
      }
      const kind = statusToken.charAt(0);
      let path: string;
      let oldPath: string | undefined;
      if (kind === "R" || kind === "C") {
        // rename/copy: <status> NUL <old> NUL <new>
        oldPath = tokens[i + 1] ?? "";
        path = tokens[i + 2] ?? tokens[i + 1] ?? "";
        i += 3;
      } else {
        path = tokens[i + 1] ?? "";
        i += 2;
      }
      if (path === "") continue;
      if (kind === "R" && renames !== undefined && oldPath !== undefined && oldPath !== "") {
        renames.set(path, oldPath);
      }
      const status: FileChange["status"] =
        kind === "A" || kind === "C"
          ? "added"
          : kind === "D"
            ? "deleted"
            : kind === "R"
              ? "renamed"
              : "modified";
      const stat = counts.get(path) ?? { additions: 0, deletions: 0 };
      files.push({ path, status, additions: stat.additions, deletions: stat.deletions });
    }
    return files;
  }

  /** Parses `git diff --numstat -z` output (binary files report `-` → 0). */
  private parseNumstat(out: string): Map<string, { additions: number; deletions: number }> {
    const counts = new Map<string, { additions: number; deletions: number }>();
    const tokens = out.split("\0");
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i] ?? "";
      if (token.trim() === "") {
        i += 1;
        continue;
      }
      const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(token);
      if (!match) {
        i += 1;
        continue;
      }
      const additions = match[1] === "-" ? 0 : Number.parseInt(match[1] ?? "0", 10);
      const deletions = match[2] === "-" ? 0 : Number.parseInt(match[2] ?? "0", 10);
      let path = match[3] ?? "";
      if (path === "") {
        // rename: counts NUL <old> NUL <new>
        path = tokens[i + 2] ?? "";
        i += 3;
      } else {
        i += 1;
      }
      if (path !== "") counts.set(path, { additions, deletions });
    }
    return counts;
  }

  /**
   * Simple API diff over TypeScript files: exported symbols that disappear
   * between the old and new revision are reported as breaking changes.
   *
   * Three change kinds are covered:
   *  - `modified`: old vs new content at the same path.
   *  - `deleted`: every symbol exported by the old file is treated as removed.
   *  - `renamed`: old content at the pre-rename path is compared against the
   *    new content at the post-rename path (`renames` maps new → old path), so
   *    a rename that also drops an export is still flagged.
   */
  private async apiDiff(
    base: string,
    head: string,
    files: FileChange[],
    renames?: Map<string, string>,
  ): Promise<BreakingChange[]> {
    const breaking: BreakingChange[] = [];
    for (const file of files) {
      if (!API_DIFF_FILE_RE.test(file.path)) continue;
      // `git show <rev>:<path>` takes a single object spec; a `--` separator
      // would turn it into a pathspec, so we rely on base/head being validated
      // non-dash refs (see assertSafeRef) to prevent option injection here.
      let oldNames: Set<string>;
      let newNames: Set<string>;
      if (file.status === "deleted") {
        const oldContent = await this.git.tryOutput(["show", `${base}:${file.path}`]);
        if (oldContent === null) continue;
        oldNames = extractExportedNames(oldContent);
        // A deleted file exports nothing afterwards: every old symbol is removed.
        newNames = new Set<string>();
      } else if (file.status === "renamed") {
        const oldPath = renames?.get(file.path) ?? file.path;
        const oldContent = await this.git.tryOutput(["show", `${base}:${oldPath}`]);
        const newContent = await this.git.tryOutput(["show", `${head}:${file.path}`]);
        if (oldContent === null || newContent === null) continue;
        oldNames = extractExportedNames(oldContent);
        newNames = extractExportedNames(newContent);
      } else if (file.status === "modified") {
        const oldContent = await this.git.tryOutput(["show", `${base}:${file.path}`]);
        const newContent = await this.git.tryOutput(["show", `${head}:${file.path}`]);
        if (oldContent === null || newContent === null) continue;
        oldNames = extractExportedNames(oldContent);
        newNames = extractExportedNames(newContent);
      } else {
        continue;
      }
      for (const name of oldNames) {
        if (!newNames.has(name)) {
          breaking.push({
            source: "api-diff",
            description: `Exported symbol "${name}" was removed from ${file.path}`,
            location: file.path,
          });
        }
      }
    }
    return breaking;
  }

  /** Runs the static security rules over the head version of changed files. */
  private async scanSecurity(head: string, files: FileChange[]): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    for (const file of files) {
      if (file.status === "deleted") continue;
      const content = await this.git.tryOutput(["show", `${head}:${file.path}`]);
      if (content === null || content.includes("\u0000")) continue; // missing or binary
      findings.push(...scanFileForFindings(file.path, content));
    }
    return findings;
  }

  /** Counts commits per conventional category. */
  private tally(commits: CommitInfo[]): ChangeAnalysis["categories"] {
    const categories = { feat: 0, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 };
    for (const commit of commits) {
      switch (commit.type) {
        case "feat":
          categories.feat += 1;
          break;
        case "fix":
          categories.fix += 1;
          break;
        case "docs":
          categories.docs += 1;
          break;
        case "refactor":
          categories.refactor += 1;
          break;
        case "test":
          categories.test += 1;
          break;
        case "chore":
          categories.chore += 1;
          break;
        case "perf":
          categories.perf += 1;
          break;
        default:
          categories.other += 1;
          break;
      }
    }
    return categories;
  }
}

/**
 * Extracts exported top-level symbol names from TypeScript source via regex
 * (declaration exports plus `export { … }` lists). Heuristic by design.
 */
export function extractExportedNames(source: string): Set<string> {
  const names = new Set<string>();
  // `export default …` exposes the module's default export under the
  // conventional name "default".
  if (/export\s+default\b/.test(source)) names.add("default");
  const declRe =
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|class|interface|enum|type|const|let|var|namespace)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = declRe.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) names.add(name);
    // Comma-separated declarators share one keyword, e.g.
    // `export const a = 1, b = 2;` — only the first name is captured above, so
    // walk the remainder of the statement and collect the other binding names.
    if (/^(?:const|let|var)$/.test(declaratorKeyword(match[0]))) {
      for (const extra of extraDeclarators(source, declRe.lastIndex)) names.add(extra);
    }
  }
  const listRe = /export\s*(?:type\s*)?\{([^}]*)\}/g;
  while ((match = listRe.exec(source)) !== null) {
    for (const raw of (match[1] ?? "").split(",")) {
      let entry = raw.trim();
      if (entry === "") continue;
      if (entry.startsWith("type ")) entry = entry.slice(5).trim();
      const asMatch = /\bas\s+([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(entry);
      const name = asMatch?.[1] ?? entry.split(/\s+/)[0] ?? "";
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** Returns the `const`/`let`/`var`/… keyword from a matched declaration head. */
function declaratorKeyword(head: string): string {
  const m = /\b(const|let|var|function|class|interface|enum|type|namespace)\b/.exec(head);
  return m?.[1] ?? "";
}

/**
 * Given source and an index just past the first binding name of a
 * `const`/`let`/`var` statement, returns the remaining comma-separated binding
 * names (e.g. `b`, `c` in `export const a = 1, b = 2, c = 3;`).
 *
 * Scans with awareness of strings, template literals and bracket nesting so
 * commas inside initializers (calls, arrays, objects, generics) are ignored;
 * only top-level commas introduce a new binding. Stops at the terminating `;`
 * or at top-level depth once the statement clearly ends.
 *
 * Angle brackets (`<…>`) are tracked separately from `()[]{}` because `<` and
 * `>` are overloaded: they open/close type arguments (`Map<string, number>`)
 * but also appear as comparison/shift operators (`<`, `>`, `<=`, `>=`, `<<`,
 * `>>`, `=>`, `->`). A `<` only increments the angle depth when it plausibly
 * opens a type argument — i.e. it directly follows an identifier char or a
 * closing `>` and is not part of `<=`/`<<`/`=>`/`<<=`. A `>` only decrements
 * while angle depth is positive and it is not part of `>=`/`>>`/`=>`/`->`.
 * Commas split bindings only when both bracket depth and angle depth are zero;
 * because false-merge (under-splitting) is safe here while false-split creates
 * a phantom export, this errs toward not splitting.
 */
function extraDeclarators(source: string, start: number): string[] {
  const names: string[] = [];
  let depth = 0;
  let angleDepth = 0;
  let i = start;
  let expectName = false;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i, ch);
      expectName = false;
      continue;
    }
    if (ch === "<" && opensTypeArgument(source, i)) {
      angleDepth += 1;
      i += 1;
      continue;
    }
    if (ch === ">" && angleDepth > 0 && closesTypeArgument(source, i)) {
      angleDepth -= 1;
      i += 1;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break; // left the declaration context
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && ch === ";") break;
    if (depth === 0 && angleDepth === 0 && ch === ",") {
      expectName = true;
      i += 1;
      continue;
    }
    if (expectName) {
      const rest = source.slice(i);
      const idMatch = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(rest);
      if (idMatch?.[1] !== undefined) {
        names.push(idMatch[1]);
        i += idMatch[0].length;
        expectName = false;
        continue;
      }
      // Destructuring patterns (`, { x }` / `, [ y ]`) are not flat bindings —
      // skip the name slot and let bracket tracking handle the contents.
      if (/^\s*[[{]/.test(rest)) expectName = false;
    }
    i += 1;
  }
  return names;
}

/**
 * Decides whether the `<` at `i` plausibly opens a type-argument list rather
 * than acting as a less-than / shift / arrow operator. A type-argument `<`
 * directly follows an identifier char or a closing `>` (e.g. `Map<`,
 * `Foo<Bar><`) and is not the start of `<=` or `<<`. This conservative test
 * may miss exotic cases, but a missed open only under-splits (safe) whereas a
 * false split would resurrect the phantom-export bug.
 */
function opensTypeArgument(source: string, i: number): boolean {
  const next = source[i + 1] ?? "";
  if (next === "=" || next === "<") return false; // `<=`, `<<`
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j] ?? "")) j -= 1;
  const prev = source[j] ?? "";
  return /[A-Za-z0-9_$>]/.test(prev);
}

/**
 * Decides whether the `>` at `i` closes a type-argument list rather than acting
 * as a greater-than / shift / arrow operator. Only called while angle depth is
 * positive; rejects `>=`, `>>` and the `>` of `=>`/`->`.
 */
function closesTypeArgument(source: string, i: number): boolean {
  const next = source[i + 1] ?? "";
  if (next === "=" || next === ">") return false; // `>=`, `>>`
  const prev = source[i - 1] ?? "";
  if (prev === "=" || prev === "-") return false; // `=>`, `->`
  return true;
}

/** Advances past a string/template literal starting at `open`, returning the next index. */
function skipString(source: string, open: number, quote: string): number {
  let i = open + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return i;
}
