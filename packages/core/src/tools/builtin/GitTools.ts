/**
 * `git_status` / `git_diff` / `git_log` — read-only git queries.
 *
 * Category: system • Default permission: ask (architecture tool table —
 * "System Operations: bash, git_*" → ask).
 *
 * Git is spawned with **argument arrays, never a shell** (no injection
 * surface). Clean errors when the git binary is missing or the directory is
 * not a repository.
 */

import { spawn } from "node:child_process";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { ToolError } from "ultracode-shared";
import { z } from "zod";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";
import { sanitizeEnv } from "../sanitizeEnv.js";

/** Options shared by the git tools. */
export interface GitToolOptions {
  /** Git executable. Default `"git"` (resolved via PATH). Test hook. */
  gitPath?: string;
  /**
   * Additional exact environment-variable names (case-insensitive) to strip
   * from the child environment, on top of the built-in credential patterns.
   * Mirrors {@link BashTool}'s `secretEnvKeys`: production wiring feeds the
   * configured provider API-key variable names (`config.providers.apiKeys` and
   * their `ULTRACODE_`-prefixed aliases).
   */
  secretEnvKeys?: readonly string[];
}

/** Result of a raw git invocation. */
interface GitRunResult {
  stdout: string;
  stderr: string;
}

/** Run git with an argument array (no shell). */
async function runGit(
  gitPath: string,
  args: readonly string[],
  cwd: string,
  toolName: string,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<GitRunResult> {
  return new Promise<GitRunResult>((resolve, reject) => {
    const child = spawn(gitPath, args as string[], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });

    const onAbort = (): void => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      const code = (err as NodeJS.ErrnoException).code;
      reject(
        new ToolError(
          code === "ENOENT"
            ? `git executable not found ("${gitPath}") — is git installed and on PATH?`
            : `Failed to run git: ${err.message}`,
          { toolName, cause: err },
        ),
      );
    });
    child.once("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(new ToolError("git command aborted", { toolName, cause: signal.reason }));
        return;
      }
      if (code !== 0) {
        reject(
          new ToolError(
            `git ${args[0] ?? ""} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`,
            { toolName, details: { exitCode: code, args: [...args] } },
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** A ref/path argument must not be mistakable for a git option. */
const safeRef = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("-"), { message: "must not start with '-'" });

/* ----------------------------------------------------------------------------
 * git_status
 * ------------------------------------------------------------------------- */

const statusSchema = z.object({}).passthrough().default({});

/** One entry of `git status --porcelain`. */
export interface GitStatusEntry {
  /** Two-letter porcelain status code (e.g. `" M"`, `"??"`). */
  status: string;
  /** File path as reported by git. */
  path: string;
}

/** Successful output of the `git_status` tool. */
export interface GitStatusOutput {
  /** Current branch name (or `null` when detached/unknown). */
  branch: string | null;
  /** Changed/untracked files. */
  files: GitStatusEntry[];
  /** `true` when the working tree is clean. */
  clean: boolean;
}

/** Reports `git status` (porcelain v1) for the working directory. */
export class GitStatusTool extends BaseTool<typeof statusSchema, GitStatusOutput> {
  readonly definition: ToolDefinition = {
    name: "git_status",
    description: "Show the git working-tree status",
    category: "system",
    parameters: { type: "object", properties: {} },
    permission: "ask",
  };
  protected readonly schema = statusSchema;
  private readonly gitPath: string;
  /** Extra exact secret variable names (upper-cased) to strip from child env. */
  private readonly secretEnvKeys: ReadonlySet<string>;

  constructor(options: GitToolOptions = {}) {
    super();
    this.gitPath = options.gitPath ?? "git";
    this.secretEnvKeys = new Set((options.secretEnvKeys ?? []).map((k) => k.toUpperCase()));
  }

  protected async run(
    _args: z.output<typeof statusSchema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<GitStatusOutput>> {
    this.throwIfAborted(ctx);
    const { stdout } = await runGit(
      this.gitPath,
      ["status", "--porcelain=v1", "--branch"],
      ctx.cwd,
      this.definition.name,
      sanitizeEnv(ctx.env, this.secretEnvKeys),
      ctx.signal,
    );

    let branch: string | null = null;
    const files: GitStatusEntry[] = [];
    for (const raw of stdout.split(/\r?\n/)) {
      if (raw === "") continue;
      if (raw.startsWith("## ")) {
        // "## main...origin/main [ahead 1]" or "## HEAD (no branch)"
        const info = raw.slice(3);
        const dots = info.indexOf("...");
        branch = (dots === -1 ? info : info.slice(0, dots)).trim() || null;
        continue;
      }
      files.push({ status: raw.slice(0, 2), path: raw.slice(3) });
    }
    return { output: { branch, files, clean: files.length === 0 } };
  }
}

/* ----------------------------------------------------------------------------
 * git_diff
 * ------------------------------------------------------------------------- */

const diffSchema = z.object({
  /** First ref to diff against (e.g. `"HEAD~1"`). */
  ref1: safeRef.optional(),
  /** Second ref (e.g. `"HEAD"`). */
  ref2: safeRef.optional(),
  /** Restrict the diff to a path. */
  path: safeRef.optional(),
});

/** Successful output of the `git_diff` tool. */
export interface GitDiffOutput {
  /** Unified diff text (possibly truncated by the executor). */
  diff: string;
}

/** Shows `git diff` between refs / against the working tree. */
export class GitDiffTool extends BaseTool<typeof diffSchema, GitDiffOutput> {
  readonly definition: ToolDefinition = {
    name: "git_diff",
    description: "Show a git diff (optionally between two refs or for a path)",
    category: "system",
    parameters: {
      type: "object",
      properties: {
        ref1: { type: "string", description: "First ref" },
        ref2: { type: "string", description: "Second ref" },
        path: { type: "string", description: "Limit the diff to this path" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = diffSchema;
  private readonly gitPath: string;
  /** Extra exact secret variable names (upper-cased) to strip from child env. */
  private readonly secretEnvKeys: ReadonlySet<string>;

  constructor(options: GitToolOptions = {}) {
    super();
    this.gitPath = options.gitPath ?? "git";
    this.secretEnvKeys = new Set((options.secretEnvKeys ?? []).map((k) => k.toUpperCase()));
  }

  protected async run(
    args: z.output<typeof diffSchema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<GitDiffOutput>> {
    this.throwIfAborted(ctx);
    const argv = ["diff", "--no-color"];
    if (args.ref1 !== undefined) argv.push(args.ref1);
    if (args.ref2 !== undefined) argv.push(args.ref2);
    if (args.path !== undefined) argv.push("--", args.path);
    const { stdout } = await runGit(
      this.gitPath,
      argv,
      ctx.cwd,
      this.definition.name,
      sanitizeEnv(ctx.env, this.secretEnvKeys),
      ctx.signal,
    );
    return { output: { diff: stdout } };
  }
}

/* ----------------------------------------------------------------------------
 * git_log
 * ------------------------------------------------------------------------- */

const logSchema = z.object({
  /** Maximum number of commits to return (default 10). */
  limit: z.number().int().min(1).max(1000).optional().default(10),
});

/** One commit as reported by `git_log`. */
export interface GitLogCommit {
  /** Full commit hash. */
  hash: string;
  /** Author name. */
  author: string;
  /** Author date (ISO-8601). */
  date: string;
  /** Commit subject line. */
  subject: string;
}

/** Successful output of the `git_log` tool. */
export interface GitLogOutput {
  /** Commits, most recent first. */
  commits: GitLogCommit[];
}

/** Lists recent commits. */
export class GitLogTool extends BaseTool<typeof logSchema, GitLogOutput> {
  readonly definition: ToolDefinition = {
    name: "git_log",
    description: "List recent git commits",
    category: "system",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Maximum number of commits (default 10)" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = logSchema;
  private readonly gitPath: string;
  /** Extra exact secret variable names (upper-cased) to strip from child env. */
  private readonly secretEnvKeys: ReadonlySet<string>;

  constructor(options: GitToolOptions = {}) {
    super();
    this.gitPath = options.gitPath ?? "git";
    this.secretEnvKeys = new Set((options.secretEnvKeys ?? []).map((k) => k.toUpperCase()));
  }

  protected async run(
    args: z.output<typeof logSchema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<GitLogOutput>> {
    this.throwIfAborted(ctx);
    // \x1f = unit separator between fields, \x1e = record separator.
    const { stdout } = await runGit(
      this.gitPath,
      [
        "log",
        `--max-count=${args.limit}`,
        "--no-color",
        "--pretty=format:%H%x1f%an%x1f%aI%x1f%s%x1e",
      ],
      ctx.cwd,
      this.definition.name,
      sanitizeEnv(ctx.env, this.secretEnvKeys),
      ctx.signal,
    );

    const commits: GitLogCommit[] = [];
    for (const record of stdout.split("\x1e")) {
      const trimmed = record.replace(/^[\r\n]+/, "");
      if (trimmed === "") continue;
      const [hash, author, date, subject] = trimmed.split("\x1f");
      if (hash === undefined || author === undefined || date === undefined) continue;
      commits.push({ hash, author, date, subject: subject ?? "" });
    }
    return { output: { commits } };
  }
}
