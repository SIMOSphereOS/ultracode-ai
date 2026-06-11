import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, NoopLogger, VersioningError } from "@ultracode/shared";
import type {
  CompletionChunk,
  CompletionResult,
  ILLMProvider,
  UltraCodeConfig,
} from "@ultracode/shared";
import { defaultGitRunner } from "./GitClient.js";
import { createVersioningSystem } from "./index.js";
import type { CommandRunner } from "./QualityGateSystem.js";

const logger = new NoopLogger();
const fixedNow = (): Date => new Date("2026-06-11T08:00:00.000Z");
const cleanups: string[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  }
});

const ID_FLAGS = [
  "-c",
  "user.email=test@example.invalid",
  "-c",
  "user.name=UltraCode Test",
  "-c",
  "commit.gpgsign=false",
];

async function git(cwd: string, ...args: string[]): Promise<void> {
  const result = await defaultGitRunner(args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(
      `test setup: git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`,
    );
  }
}

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ultracode-system-"));
  cleanups.push(dir);
  return dir;
}

/** Repo with a tagged baseline (v1.0.0) and one feature commit on top. */
async function makeFeatureRepo(): Promise<string> {
  const dir = await makeDir();
  await git(dir, "init", "-q");
  await writeFile(path.join(dir, "base.ts"), "export const base = 1;\n", "utf8");
  await git(dir, "add", "-A");
  await git(dir, ...ID_FLAGS, "commit", "-q", "--no-verify", "-m", "chore: baseline");
  await git(dir, "tag", "v1.0.0");
  await writeFile(path.join(dir, "feature.ts"), "export const feature = 2;\n", "utf8");
  await git(dir, "add", "-A");
  await git(dir, ...ID_FLAGS, "commit", "-q", "--no-verify", "-m", "feat(core): add feature");
  return dir;
}

function configWithStable(stable: string): UltraCodeConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.versioning.channels.stable = stable;
  return config;
}

const okRunner: CommandRunner = async () => ({ exitCode: 0, stdout: "", stderr: "" });

describe("createVersioningSystem", () => {
  it("analyze() uses the last tag as default range", async () => {
    const dir = await makeFeatureRepo();
    const system = createVersioningSystem({ cwd: dir, logger });
    const analysis = await system.analyze();
    expect(analysis.commits).toHaveLength(1);
    expect(analysis.commits[0]?.type).toBe("feat");
    expect(analysis.files.map((f) => f.path)).toEqual(["feature.ts"]);
  });

  it("suggest() recommends the next version from the stable channel", async () => {
    const dir = await makeFeatureRepo();
    const system = createVersioningSystem({
      cwd: dir,
      logger,
      config: configWithStable("1.0.0"),
    });
    const suggestion = await system.suggest();
    expect(suggestion.currentVersion).toBe("1.0.0");
    expect(suggestion.bump).toBe("minor");
    expect(suggestion.suggestedVersion).toBe("1.1.0");
    expect(suggestion.confidence).toBeGreaterThan(0.5);
  });

  it("suggest() supports prerelease identifiers and explicit current versions", async () => {
    const dir = await makeFeatureRepo();
    const system = createVersioningSystem({ cwd: dir, logger });
    const pre = await system.suggest(undefined, { prerelease: "beta", currentVersion: "2.0.0" });
    expect(pre.bump).toBe("prerelease");
    expect(pre.suggestedVersion).toBe("2.1.0-beta.0");
  });

  it("suggest() falls back to DEFAULT_CONFIG channels without a config", async () => {
    const dir = await makeFeatureRepo();
    const system = createVersioningSystem({ cwd: dir, logger });
    const suggestion = await system.suggest();
    expect(suggestion.currentVersion).toBe("0.0.0");
    expect(suggestion.suggestedVersion).toBe("0.1.0");
  });

  it("plan() defaults to the suggested version and drafts a changelog", async () => {
    const dir = await makeFeatureRepo();
    const system = createVersioningSystem({
      cwd: dir,
      logger,
      config: configWithStable("1.0.0"),
      now: fixedNow,
    });
    const plan = await system.plan();
    expect(plan.version).toBe("1.1.0");
    expect(plan.changelogDraft).toContain("## [1.1.0] - 2026-06-11");
    expect(plan.changelogDraft).toContain("### Added");
    expect(plan.changelogDraft).toContain("**core:** add feature");

    const explicit = await system.plan("9.9.9");
    expect(explicit.version).toBe("9.9.9");
  });

  it("plan() uses an injected provider for changelog polish and survives provider failure", async () => {
    const dir = await makeFeatureRepo();
    const polishing: ILLMProvider = {
      name: "fake",
      listModels: async () => [],
      complete: async (): Promise<CompletionResult> => ({
        text: "## polished",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop",
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      stream: async function* (): AsyncIterable<CompletionChunk> {
        yield { type: "done", usage: { inputTokens: 0, outputTokens: 0 } };
      },
      healthCheck: async () => true,
    };
    const polished = await createVersioningSystem({
      cwd: dir,
      logger,
      provider: polishing,
      config: configWithStable("1.0.0"),
    }).plan();
    expect(polished.changelogDraft).toBe("## polished");

    const throwing: ILLMProvider = {
      ...polishing,
      complete: async () => {
        throw new Error("llm exploded");
      },
    };
    const fallback = await createVersioningSystem({
      cwd: dir,
      logger,
      provider: throwing,
      config: configWithStable("1.0.0"),
      now: fixedNow,
    }).plan();
    expect(fallback.changelogDraft).toContain("### Added");
  });

  it("quality() feeds the internal analysis into the gates", async () => {
    const dir = await makeFeatureRepo();
    await writeFile(path.join(dir, "README.md"), "# x\n", "utf8");
    await writeFile(path.join(dir, "CHANGELOG.md"), "# log\n", "utf8");
    const config = configWithStable("1.0.0");
    config.versioning.quality.requireReview = false;
    const system = createVersioningSystem({
      cwd: dir,
      logger,
      config,
      commandRunner: okRunner,
    });
    const report = await system.quality({ testCommand: { command: "fake-test" } });
    expect(report.passed).toBe(true);
    const security = report.gates.find((g) => g.gate === "security");
    expect(security?.details).not.toMatch(/skipped/);
    expect(report.overallScore).toBeGreaterThan(80);
  });

  it("quality() does not throw outside a repo — the security gate is skipped", async () => {
    const dir = await makeDir();
    const system = createVersioningSystem({ cwd: dir, logger, commandRunner: okRunner });
    const report = await system.quality({ skipTests: true });
    const security = report.gates.find((g) => g.gate === "security");
    expect(security?.details).toMatch(/skipped/);
  });

  it("analyze() rejects with VersioningError outside a repo", async () => {
    const dir = await makeDir();
    const system = createVersioningSystem({ cwd: dir, logger });
    await expect(system.analyze()).rejects.toThrow(VersioningError);
  });

  it("exposes the wired sub-engines", async () => {
    const dir = await makeDir();
    const system = createVersioningSystem({ cwd: dir, logger });
    expect(system.analyzer).toBeDefined();
    expect(system.recommender).toBeDefined();
    expect(system.planner).toBeDefined();
    expect(system.qualityGates).toBeDefined();
  });
});
