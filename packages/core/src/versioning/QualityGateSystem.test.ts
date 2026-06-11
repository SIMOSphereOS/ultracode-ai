import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, NoopLogger } from "@ultracode/shared";
import type { ChangeAnalysis, QualityReport, VersioningConfig } from "@ultracode/shared";
import { QualityGateSystem } from "./QualityGateSystem.js";
import type { CommandRunner } from "./QualityGateSystem.js";

const logger = new NoopLogger();
const cleanups: string[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  }
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ultracode-quality-"));
  cleanups.push(dir);
  return dir;
}

function config(partial: Partial<VersioningConfig["quality"]> = {}): VersioningConfig {
  return {
    ...DEFAULT_CONFIG.versioning,
    quality: { ...DEFAULT_CONFIG.versioning.quality, ...partial },
  };
}

function emptyAnalysis(partial: Partial<ChangeAnalysis> = {}): ChangeAnalysis {
  return {
    files: [],
    commits: [],
    breakingChanges: [],
    categories: { feat: 0, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 },
    securityFindings: [],
    ...partial,
  };
}

const passRunner: CommandRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });
const failRunner: CommandRunner = async () => ({ exitCode: 1, stdout: "", stderr: "2 tests failed" });

function gate(report: QualityReport, name: string): QualityReport["gates"][number] {
  const found = report.gates.find((g) => g.gate === name);
  if (found === undefined) throw new Error(`gate ${name} missing in report`);
  return found;
}

async function writeProjectDocs(dir: string): Promise<void> {
  await writeFile(path.join(dir, "README.md"), "# Project\n", "utf8");
  await writeFile(path.join(dir, "CHANGELOG.md"), "# Changelog\n", "utf8");
}

async function writeCoverage(dir: string, pct: number | string): Promise<void> {
  await mkdir(path.join(dir, "coverage"), { recursive: true });
  await writeFile(
    path.join(dir, "coverage", "coverage-summary.json"),
    typeof pct === "string" ? pct : JSON.stringify({ total: { lines: { pct } } }),
    "utf8",
  );
}

describe("QualityGateSystem.check", () => {
  it("passes with everything green and reports a high weighted score", async () => {
    const dir = await makeDir();
    await writeProjectDocs(dir);
    await writeCoverage(dir, 95);
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "lib.ts"),
      "/** Documented. */\nexport const answer = 42;\n",
      "utf8",
    );
    const system = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: false }),
      runner: passRunner,
    });
    const report = await system.check({
      analysis: emptyAnalysis(),
      testCommand: { command: "fake-test" },
    });
    expect(report.passed).toBe(true);
    expect(gate(report, "tests").passed).toBe(true);
    expect(gate(report, "coverage").score).toBe(95);
    expect(gate(report, "docs").score).toBe(100);
    expect(gate(report, "security").passed).toBe(true);
    expect(gate(report, "review").details).toMatch(/skipped/);
    // weights: tests 35*100 + coverage 25*95 + security 25*100 + docs 10*100 over 95
    expect(report.overallScore).toBe(99);
  });

  it("fails when the test command exits non-zero", async () => {
    const dir = await makeDir();
    await writeProjectDocs(dir);
    const system = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: false }),
      runner: failRunner,
    });
    const report = await system.check({ testCommand: { command: "fake-test" } });
    expect(report.passed).toBe(false);
    const tests = gate(report, "tests");
    expect(tests.passed).toBe(false);
    expect(tests.details).toMatch(/exited with code 1/);
    expect(tests.details).toMatch(/2 tests failed/);
  });

  it("fails gracefully when the test command cannot be executed", async () => {
    const dir = await makeDir();
    const enoentRunner: CommandRunner = async () => {
      const err = new Error("spawn missing-binary ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };
    const system = new QualityGateSystem({ cwd: dir, logger, runner: enoentRunner });
    const report = await system.check({ testCommand: { command: "missing-binary" } });
    const tests = gate(report, "tests");
    expect(tests.passed).toBe(false);
    expect(tests.details).toMatch(/could not be executed/);
  });

  it("skips the tests gate when no test command is configured or skipTests is set", async () => {
    const dir = await makeDir();
    const system = new QualityGateSystem({ cwd: dir, logger, config: config() });
    const noCommand = await system.check();
    expect(gate(noCommand, "tests").details).toMatch(/skipped: no test command/);
    expect(gate(noCommand, "tests").passed).toBe(true);

    const skipped = await system.check({ skipTests: true, testCommand: { command: "x" } });
    expect(gate(skipped, "tests").details).toMatch(/skipped/);
  });

  it("skips the coverage gate with a hint when the summary file is missing", async () => {
    const dir = await makeDir();
    await writeProjectDocs(dir);
    const system = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: false }),
    });
    const report = await system.check();
    const coverage = gate(report, "coverage");
    expect(coverage.passed).toBe(true);
    expect(coverage.details).toMatch(/no coverage data/);
    expect(report.passed).toBe(true); // skipped gate never fails the report
  });

  it("fails the coverage gate below the minimum and on corrupt data", async () => {
    const dir = await makeDir();
    await writeCoverage(dir, 42);
    const system = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ minCoverage: 80, requireReview: false }),
    });
    const low = await system.check();
    expect(gate(low, "coverage").passed).toBe(false);
    expect(gate(low, "coverage").score).toBe(42);

    await writeCoverage(dir, "{ not valid json !!");
    const corrupt = await system.check();
    expect(gate(corrupt, "coverage").passed).toBe(false);
    expect(gate(corrupt, "coverage").details).toMatch(/invalid coverage data/);

    await writeCoverage(dir, JSON.stringify({ total: { lines: { pct: "not-a-number" } } }));
    const wrongType = await system.check();
    expect(gate(wrongType, "coverage").passed).toBe(false);
  });

  it("fails the docs gate when README/CHANGELOG are missing and scores JSDoc coverage", async () => {
    const dir = await makeDir();
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "lib.ts"),
      "/** Documented. */\nexport const a = 1;\nexport const b = 2;\n",
      "utf8",
    );
    const system = new QualityGateSystem({ cwd: dir, logger, config: config() });
    const report = await system.check();
    const docs = gate(report, "docs");
    expect(docs.passed).toBe(false);
    expect(docs.details).toMatch(/missing: README\.md, CHANGELOG\.md/);
    // 0 + 0 + 50% JSDoc ratio (1 of 2 exports documented) → 25
    expect(docs.score).toBe(25);
  });

  it("scans packages/*/src for the JSDoc heuristic", async () => {
    const dir = await makeDir();
    await writeProjectDocs(dir);
    const srcDir = path.join(dir, "packages", "demo", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      path.join(srcDir, "x.ts"),
      "/** Doc. */\nexport function fn() {}\nexport const undocumented = 1;\n",
      "utf8",
    );
    const system = new QualityGateSystem({ cwd: dir, logger, config: config() });
    const report = await system.check();
    const docs = gate(report, "docs");
    expect(docs.details).toMatch(/1\/2 exported symbol/);
    expect(docs.score).toBe(75); // 25 + 25 + 0.5 * 50
  });

  it("fails the security gate on high/critical findings", async () => {
    const dir = await makeDir();
    const system = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: false }),
    });
    const report = await system.check({
      analysis: emptyAnalysis({
        securityFindings: [
          { severity: "high", rule: "secret.hardcoded-credential", file: "a.ts", description: "x" },
          { severity: "low", rule: "net.insecure-http", file: "b.ts", description: "y" },
        ],
      }),
    });
    const security = gate(report, "security");
    expect(security.passed).toBe(false);
    expect(security.details).toMatch(/1 high\/critical/);
    expect(report.passed).toBe(false);
  });

  it("passes the security gate with only low/medium findings and skips it without analysis", async () => {
    const dir = await makeDir();
    const system = new QualityGateSystem({ cwd: dir, logger, config: config() });
    const withFindings = await system.check({
      analysis: emptyAnalysis({
        securityFindings: [
          { severity: "medium", rule: "net.insecure-http", file: "a.ts", description: "x" },
        ],
      }),
    });
    expect(gate(withFindings, "security").passed).toBe(true);

    const withoutAnalysis = await system.check();
    expect(gate(withoutAnalysis, "security").details).toMatch(/skipped: no change analysis/);
  });

  it("review gate: required ⇒ fails unless approved; not required ⇒ skipped", async () => {
    const dir = await makeDir();
    const required = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: true }),
    });
    const unapproved = await required.check();
    expect(gate(unapproved, "review").passed).toBe(false);
    expect(unapproved.passed).toBe(false);

    const approved = await required.check({ reviewApproved: true });
    expect(gate(approved, "review").passed).toBe(true);

    const optional = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: false }),
    });
    const skipped = await optional.check();
    expect(gate(skipped, "review").details).toMatch(/skipped/);
  });

  it("redistributes the weight of skipped gates in the overall score", async () => {
    const dir = await makeDir(); // empty: docs fails (score 50), coverage skipped
    const system = new QualityGateSystem({
      cwd: dir,
      logger,
      config: config({ requireReview: true }),
      runner: failRunner,
    });
    const report = await system.check({
      analysis: emptyAnalysis(),
      testCommand: { command: "fake-test" },
      reviewApproved: true,
    });
    // active gates: tests 35*0, docs 10*50, security 25*100, review 5*100 over weight 75
    // = (0 + 500 + 2500 + 500) / 75 = 46.67 → 47
    expect(report.overallScore).toBe(47);
    expect(report.passed).toBe(false);
  });
});
