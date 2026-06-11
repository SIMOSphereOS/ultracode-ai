/**
 * Quality Gate System — pre-release checks with weighted scoring.
 *
 * Gates: `tests`, `coverage`, `docs`, `security`, `review`. Every external
 * effect is injectable (command runner) or read from the local filesystem, so
 * the system is deterministic and offline-testable. Skipped gates redistribute
 * their weight across the remaining gates.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { clamp } from "@ultracode/shared";
import type {
  ChangeAnalysis,
  Logger,
  QualityGateResult,
  QualityReport,
  VersioningConfig,
} from "@ultracode/shared";
import { spawn } from "node:child_process";

/** Result of an external command execution. */
export interface CommandResult {
  /** Process exit code (`-1` when the process did not exit normally). */
  exitCode: number;
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
}

/** Executes an external command; injectable for tests. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; signal?: AbortSignal },
) => Promise<CommandResult>;

/** Default {@link CommandRunner} based on `child_process.spawn` (no shell). */
export const defaultCommandRunner: CommandRunner = (command, args, options) =>
  new Promise<CommandResult>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, [...args], {
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
    child.once("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
  });

/** A test command (executable + argument array, run without a shell). */
export interface TestCommand {
  /** Executable name or path. */
  command: string;
  /** Argument array. */
  args?: string[];
}

/** Construction options for {@link QualityGateSystem}. */
export interface QualityGateSystemOptions {
  /** Project root directory (README, CHANGELOG, coverage are resolved here). */
  cwd: string;
  /** Logger for diagnostics. */
  logger: Logger;
  /** Versioning config (minCoverage, requireReview). */
  config?: VersioningConfig;
  /** Injectable command runner (defaults to a spawn-based runner). */
  runner?: CommandRunner;
}

/** Per-check input for {@link QualityGateSystem.check}. */
export interface QualityCheckInput {
  /** Change analysis feeding the security gate (gate is skipped when absent). */
  analysis?: ChangeAnalysis;
  /** Test command to execute; the tests gate is skipped when absent. */
  testCommand?: TestCommand;
  /** Skip the tests gate explicitly. */
  skipTests?: boolean;
  /** Confirmation that a code review took place (review gate). */
  reviewApproved?: boolean;
  /** Abort signal forwarded to the command runner. */
  signal?: AbortSignal;
}

/** Gate weights for the overall score. */
const GATE_WEIGHTS = { tests: 35, coverage: 25, security: 25, docs: 10, review: 5 } as const;

/** Internal gate result with skip tracking. */
interface InternalGateResult {
  gate: keyof typeof GATE_WEIGHTS;
  passed: boolean;
  skipped: boolean;
  score?: number;
  details: string;
}

/** Maximum number of source files scanned by the docs heuristic. */
const MAX_DOC_SCAN_FILES = 200;

/**
 * Runs the configured quality gates and aggregates them into a
 * {@link QualityReport} with a weighted 0–100 score.
 */
export class QualityGateSystem {
  private readonly cwd: string;
  private readonly logger: Logger;
  private readonly config: VersioningConfig | undefined;
  private readonly runner: CommandRunner;

  constructor(options: QualityGateSystemOptions) {
    this.cwd = options.cwd;
    this.logger = options.logger;
    this.config = options.config;
    this.runner = options.runner ?? defaultCommandRunner;
  }

  /** Executes all gates and aggregates the report. */
  public async check(input: QualityCheckInput = {}): Promise<QualityReport> {
    const results: InternalGateResult[] = [
      await this.testsGate(input),
      await this.coverageGate(),
      await this.docsGate(),
      this.securityGate(input.analysis),
      this.reviewGate(input.reviewApproved),
    ];

    const active = results.filter((r) => !r.skipped);
    const totalWeight = active.reduce((sum, r) => sum + GATE_WEIGHTS[r.gate], 0);
    const overallScore =
      totalWeight === 0
        ? 100
        : Math.round(
            active.reduce(
              (sum, r) => sum + GATE_WEIGHTS[r.gate] * (r.score ?? (r.passed ? 100 : 0)),
              0,
            ) / totalWeight,
          );
    const passed = active.every((r) => r.passed);

    const gates: QualityGateResult[] = results.map((r) => {
      const out: QualityGateResult = {
        gate: r.gate,
        passed: r.passed,
        details: r.skipped ? `skipped: ${r.details}` : r.details,
      };
      if (r.score !== undefined) out.score = r.score;
      return out;
    });

    return { passed, gates, overallScore };
  }

  /** Gate 1: run the configured test command (exit code 0 → passed). */
  private async testsGate(input: QualityCheckInput): Promise<InternalGateResult> {
    if (input.skipTests === true) {
      return { gate: "tests", passed: true, skipped: true, details: "tests skipped by request" };
    }
    if (input.testCommand === undefined) {
      return {
        gate: "tests",
        passed: true,
        skipped: true,
        details: "no test command configured",
      };
    }
    const { command, args = [] } = input.testCommand;
    try {
      const opts: { cwd: string; signal?: AbortSignal } =
        input.signal !== undefined ? { cwd: this.cwd, signal: input.signal } : { cwd: this.cwd };
      const result = await this.runner(command, args, opts);
      const passed = result.exitCode === 0;
      const stderrHint = result.stderr.trim().split(/\r?\n/)[0] ?? "";
      return {
        gate: "tests",
        passed,
        skipped: false,
        score: passed ? 100 : 0,
        details: passed
          ? `test command "${command}" exited with code 0`
          : `test command "${command}" exited with code ${result.exitCode}${
              stderrHint ? ` — ${stderrHint}` : ""
            }`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn("versioning: tests gate failed to execute", { error: message });
      return {
        gate: "tests",
        passed: false,
        skipped: false,
        score: 0,
        details: `test command could not be executed: ${message}`,
      };
    }
  }

  /** Gate 2: coverage from `coverage/coverage-summary.json` vs. minCoverage. */
  private async coverageGate(): Promise<InternalGateResult> {
    const minCoverage = this.config?.quality.minCoverage ?? 80;
    const summaryPath = path.join(this.cwd, "coverage", "coverage-summary.json");
    let raw: string;
    try {
      raw = await fs.readFile(summaryPath, "utf8");
    } catch {
      return {
        gate: "coverage",
        passed: true,
        skipped: true,
        details: `no coverage data (${path.join("coverage", "coverage-summary.json")} not found)`,
      };
    }
    try {
      const parsed = JSON.parse(raw) as { total?: { lines?: { pct?: unknown } } };
      const pct = parsed.total?.lines?.pct;
      if (typeof pct !== "number" || Number.isNaN(pct)) {
        throw new Error("total.lines.pct missing or not a number");
      }
      const passed = pct >= minCoverage;
      return {
        gate: "coverage",
        passed,
        skipped: false,
        score: Math.round(clamp(pct, 0, 100)),
        details: `line coverage ${pct}% (minimum ${minCoverage}%)`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        gate: "coverage",
        passed: false,
        skipped: false,
        score: 0,
        details: `invalid coverage data: ${message}`,
      };
    }
  }

  /** Gate 3: README/CHANGELOG presence plus a JSDoc-coverage heuristic. */
  private async docsGate(): Promise<InternalGateResult> {
    const hasReadme = await this.fileExists(path.join(this.cwd, "README.md"));
    const hasChangelog = await this.fileExists(path.join(this.cwd, "CHANGELOG.md"));
    const { exported, documented } = await this.computeJsdocStats();
    const ratio = exported === 0 ? 1 : documented / exported;
    const score = Math.round((hasReadme ? 25 : 0) + (hasChangelog ? 25 : 0) + ratio * 50);
    const passed = hasReadme && hasChangelog;
    const missing = [
      ...(hasReadme ? [] : ["README.md"]),
      ...(hasChangelog ? [] : ["CHANGELOG.md"]),
    ];
    return {
      gate: "docs",
      passed,
      skipped: false,
      score,
      details:
        (missing.length > 0 ? `missing: ${missing.join(", ")}; ` : "") +
        `JSDoc coverage ${documented}/${exported} exported symbol(s) (${Math.round(ratio * 100)}%)`,
    };
  }

  /** Gate 4: no high/critical security findings in the provided analysis. */
  private securityGate(analysis: ChangeAnalysis | undefined): InternalGateResult {
    if (analysis === undefined) {
      return {
        gate: "security",
        passed: true,
        skipped: true,
        details: "no change analysis available",
      };
    }
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of analysis.securityFindings) counts[finding.severity] += 1;
    const blocking = counts.critical + counts.high;
    const score = Math.round(
      clamp(100 - 40 * counts.critical - 25 * counts.high - 10 * counts.medium - 5 * counts.low, 0, 100),
    );
    return {
      gate: "security",
      passed: blocking === 0,
      skipped: false,
      score,
      details:
        blocking === 0
          ? `no high/critical findings (${analysis.securityFindings.length} total finding(s))`
          : `${blocking} high/critical security finding(s) block the release`,
    };
  }

  /** Gate 5: code review requirement from `quality.requireReview`. */
  private reviewGate(reviewApproved: boolean | undefined): InternalGateResult {
    const requireReview = this.config?.quality.requireReview ?? true;
    if (!requireReview) {
      return {
        gate: "review",
        passed: true,
        skipped: true,
        details: "code review not required by configuration",
      };
    }
    const passed = reviewApproved === true;
    return {
      gate: "review",
      passed,
      skipped: false,
      score: passed ? 100 : 0,
      details: passed
        ? "code review confirmed"
        : "code review required but not confirmed — pass reviewApproved: true once reviewed",
    };
  }

  /** Whether a file exists (no throw). */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /** Heuristic: count exported symbols and how many carry a JSDoc block. */
  private async computeJsdocStats(): Promise<{ exported: number; documented: number }> {
    const roots: string[] = [];
    const packagesDir = path.join(this.cwd, "packages");
    try {
      const entries = await fs.readdir(packagesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const srcDir = path.join(packagesDir, entry.name, "src");
        if (await this.dirExists(srcDir)) roots.push(srcDir);
      }
    } catch {
      // no packages/ directory — fall through
    }
    if (roots.length === 0) {
      const srcDir = path.join(this.cwd, "src");
      if (await this.dirExists(srcDir)) roots.push(srcDir);
    }

    let exported = 0;
    let documented = 0;
    const files: string[] = [];
    for (const root of roots) {
      await this.collectSourceFiles(root, files);
      if (files.length >= MAX_DOC_SCAN_FILES) break;
    }
    const exportRe =
      /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\b/;
    for (const file of files.slice(0, MAX_DOC_SCAN_FILES)) {
      let content: string;
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      let lastNonEmpty = "";
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (exportRe.test(rawLine)) {
          exported += 1;
          if (lastNonEmpty.endsWith("*/")) documented += 1;
        }
        if (line !== "") lastNonEmpty = line;
      }
    }
    return { exported, documented };
  }

  /** Whether a directory exists (no throw). */
  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /** Recursively collects `.ts`/`.tsx` source files (skipping tests/dist). */
  private async collectSourceFiles(dir: string, out: string[]): Promise<void> {
    if (out.length >= MAX_DOC_SCAN_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_DOC_SCAN_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
          continue;
        }
        await this.collectSourceFiles(full, out);
      } else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(test|spec)\./.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      ) {
        out.push(full);
      }
    }
  }
}
