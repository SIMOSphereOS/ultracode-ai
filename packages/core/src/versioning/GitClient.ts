/**
 * Thin, cross-platform git wrapper used by the AI versioning layer.
 *
 * All git access goes through {@link GitClient}, which itself delegates to an
 * injectable {@link GitRunner}. The default runner spawns `git` via
 * `child_process.spawn` with an argument array (never `shell: true`), so it is
 * safe on Linux, macOS and Windows. When git is missing or a command fails,
 * a {@link VersioningError} is raised — callers never see raw spawn errors.
 */

import { spawn } from "node:child_process";
import type { Logger } from "ultracode-shared";
import { VersioningError } from "ultracode-shared";

/** Result of a single git invocation. */
export interface GitCommandResult {
  /** Process exit code (`-1` when the process did not exit normally). */
  exitCode: number;
  /** Captured standard output (UTF-8). */
  stdout: string;
  /** Captured standard error (UTF-8). */
  stderr: string;
}

/** Options passed to a {@link GitRunner}. */
export interface GitRunnerOptions {
  /** Working directory in which to run git. */
  cwd: string;
  /** Optional abort signal cancelling the in-flight command. */
  signal?: AbortSignal;
}

/**
 * Executes `git` with the given argument array. Implementations resolve with
 * the command result for any exit code and reject only for spawn-level
 * failures (missing binary, abort, …). Injectable for tests.
 */
export type GitRunner = (
  args: readonly string[],
  options: GitRunnerOptions,
) => Promise<GitCommandResult>;

/**
 * Default {@link GitRunner}: spawns `git` with `shell: false` and collects
 * stdout/stderr as UTF-8. Rejects with the underlying spawn error (e.g.
 * `ENOENT` when git is not installed, `AbortError` on cancellation).
 */
export const defaultGitRunner: GitRunner = (args, options) =>
  new Promise<GitCommandResult>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", [...args], {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        signal: options.signal,
      });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });

/** Construction options for {@link GitClient}. */
export interface GitClientOptions {
  /** Repository working directory. */
  cwd: string;
  /** Custom runner (tests inject fakes here). Defaults to {@link defaultGitRunner}. */
  runner?: GitRunner;
  /** Optional logger for debug traces. */
  logger?: Logger;
  /** Optional abort signal applied to every command. */
  signal?: AbortSignal;
}

/**
 * Convenience wrapper around a {@link GitRunner} providing the small set of
 * git queries the versioning system needs. Spawn-level failures are converted
 * into graceful {@link VersioningError}s.
 */
export class GitClient {
  private readonly cwd: string;
  private readonly runner: GitRunner;
  private readonly logger: Logger | undefined;
  private readonly signal: AbortSignal | undefined;

  constructor(options: GitClientOptions) {
    this.cwd = options.cwd;
    this.runner = options.runner ?? defaultGitRunner;
    this.logger = options.logger;
    this.signal = options.signal;
  }

  /**
   * Runs git with the given arguments. Resolves for any exit code; throws
   * {@link VersioningError} only when git itself could not be executed
   * (missing binary, abort, runner failure).
   */
  public async run(args: readonly string[]): Promise<GitCommandResult> {
    this.logger?.debug("git", { args: [...args], cwd: this.cwd });
    try {
      const opts: GitRunnerOptions =
        this.signal !== undefined ? { cwd: this.cwd, signal: this.signal } : { cwd: this.cwd };
      return await this.runner(args, opts);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        throw new VersioningError(
          "git executable not found on PATH — install Git to use the versioning system",
          { cause: err, details: { args: [...args], cwd: this.cwd } },
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new VersioningError(`failed to run git ${args[0] ?? ""}: ${message}`, {
        cause: err,
        details: { args: [...args], cwd: this.cwd },
      });
    }
  }

  /**
   * Runs git and returns stdout. Throws {@link VersioningError} when the
   * command exits non-zero.
   */
  public async output(args: readonly string[]): Promise<string> {
    const result = await this.run(args);
    if (result.exitCode !== 0) {
      throw new VersioningError(
        `git ${args.join(" ")} exited with code ${result.exitCode}: ${result.stderr.trim()}`,
        { details: { args: [...args], exitCode: result.exitCode, stderr: result.stderr } },
      );
    }
    return result.stdout;
  }

  /** Runs git and returns stdout, or `null` when the command exits non-zero. */
  public async tryOutput(args: readonly string[]): Promise<string | null> {
    const result = await this.run(args);
    return result.exitCode === 0 ? result.stdout : null;
  }

  /** Whether {@link GitClientOptions.cwd} is inside a git work tree. */
  public async isInsideWorkTree(): Promise<boolean> {
    const result = await this.run(["rev-parse", "--is-inside-work-tree"]);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  }

  /** Whether the repository has at least one commit. */
  public async hasCommits(): Promise<boolean> {
    const result = await this.run(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return result.exitCode === 0;
  }

  /** Most recent tag reachable from `HEAD`, or `null` when no tag exists. */
  public async lastTag(): Promise<string | null> {
    const out = await this.tryOutput(["describe", "--tags", "--abbrev=0"]);
    const trimmed = out?.trim();
    return trimmed ? trimmed : null;
  }
}
