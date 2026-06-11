/**
 * Change Analysis Engine — the data-gathering half of the AI versioning layer.
 *
 * Collects file changes, parsed commits, breaking changes (from commit
 * metadata and a lightweight API diff of exported symbols) and static
 * security findings for a git revision range.
 */

import { VersioningError } from "@ultracode/shared";
import type {
  BreakingChange,
  ChangeAnalysis,
  CommitInfo,
  FileChange,
  Logger,
  SecurityFinding,
} from "@ultracode/shared";
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
    const files = await this.collectFiles(resolved.base, resolved.head);

    const breakingChanges: BreakingChange[] = commits
      .filter((c) => c.breaking)
      .map((c) => ({
        source: "commit" as const,
        description: c.subject,
        location: c.hash,
      }));
    breakingChanges.push(...(await this.apiDiff(resolved.base, resolved.head, files)));

    const securityFindings = await this.scanSecurity(resolved.head, files);
    const categories = this.tally(commits);

    return { files, commits, breakingChanges, categories, securityFindings };
  }

  /** Resolves an explicit or default range to base/head revisions. */
  private async resolveRange(range?: string): Promise<ResolvedRange> {
    if (range !== undefined && range.trim() !== "") {
      const trimmed = range.trim();
      const match = /^(.*?)\.{2,3}(.*)$/.exec(trimmed);
      if (match) {
        const base = (match[1] ?? "").trim() || "HEAD";
        const head = (match[2] ?? "").trim() || "HEAD";
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

  /** Collects file changes from `git diff --name-status` plus `--numstat`. */
  private async collectFiles(base: string, head: string): Promise<FileChange[]> {
    const nameStatusOut = await this.git.output([
      "diff",
      "--name-status",
      "-M",
      "-z",
      base,
      head,
    ]);
    const numstatOut = await this.git.output(["diff", "--numstat", "-M", "-z", base, head]);

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
      if (kind === "R" || kind === "C") {
        // rename/copy: <status> NUL <old> NUL <new>
        path = tokens[i + 2] ?? tokens[i + 1] ?? "";
        i += 3;
      } else {
        path = tokens[i + 1] ?? "";
        i += 2;
      }
      if (path === "") continue;
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
   * Simple API diff: exported symbols removed from modified TypeScript files
   * are reported as breaking changes.
   */
  private async apiDiff(
    base: string,
    head: string,
    files: FileChange[],
  ): Promise<BreakingChange[]> {
    const breaking: BreakingChange[] = [];
    for (const file of files) {
      if (file.status !== "modified" || !API_DIFF_FILE_RE.test(file.path)) continue;
      const oldContent = await this.git.tryOutput(["show", `${base}:${file.path}`]);
      const newContent = await this.git.tryOutput(["show", `${head}:${file.path}`]);
      if (oldContent === null || newContent === null) continue;
      const oldNames = extractExportedNames(oldContent);
      const newNames = extractExportedNames(newContent);
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
  const declRe =
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|class|interface|enum|type|const|let|var|namespace)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = declRe.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) names.add(name);
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
