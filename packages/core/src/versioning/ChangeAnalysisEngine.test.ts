import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NoopLogger, VersioningError } from "@ultracode/shared";
import { ChangeAnalysisEngine, extractExportedNames } from "./ChangeAnalysisEngine.js";
import { defaultGitRunner } from "./GitClient.js";

const logger = new NoopLogger();

/** Identity flags so tests never touch global git config. */
const ID_FLAGS = [
  "-c",
  "user.email=test@example.invalid",
  "-c",
  "user.name=UltraCode Test",
  "-c",
  "commit.gpgsign=false",
];

const cleanups: string[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await defaultGitRunner(args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(
      `test setup: git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`,
    );
  }
  return result.stdout;
}

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ultracode-analysis-"));
  cleanups.push(dir);
  return dir;
}

async function makeRepo(): Promise<string> {
  const dir = await makeDir();
  await git(dir, "init", "-q");
  return dir;
}

async function commitAll(dir: string, message: string, body?: string): Promise<void> {
  await git(dir, "add", "-A");
  const messageArgs = body === undefined ? ["-m", message] : ["-m", message, "-m", body];
  await git(dir, ...ID_FLAGS, "commit", "-q", "--no-verify", "--allow-empty", ...messageArgs);
}

function engineFor(dir: string): ChangeAnalysisEngine {
  return new ChangeAnalysisEngine({ cwd: dir, logger });
}

describe("ChangeAnalysisEngine (real git repos)", () => {
  it("throws VersioningError outside a git repository", async () => {
    const dir = await makeDir();
    await expect(engineFor(dir).analyze()).rejects.toThrow(VersioningError);
    await expect(engineFor(dir).analyze()).rejects.toThrow(/not a git repository/);
  });

  it("returns an empty analysis for a repository without commits", async () => {
    const dir = await makeRepo();
    const analysis = await engineFor(dir).analyze();
    expect(analysis.commits).toHaveLength(0);
    expect(analysis.files).toHaveLength(0);
    expect(analysis.breakingChanges).toHaveLength(0);
    expect(analysis.securityFindings).toHaveLength(0);
    expect(analysis.categories.feat).toBe(0);
  });

  it("analyses the whole history when no tag exists (single commit)", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "a.txt"), "hello\nworld\n", "utf8");
    await commitAll(dir, "feat: initial feature");
    const analysis = await engineFor(dir).analyze();
    expect(analysis.commits).toHaveLength(1);
    expect(analysis.commits[0]).toMatchObject({ type: "feat", scope: null, breaking: false });
    expect(analysis.categories.feat).toBe(1);
    expect(analysis.files).toHaveLength(1);
    expect(analysis.files[0]).toMatchObject({ path: "a.txt", status: "added", additions: 2 });
  });

  it("defaults to last-tag..HEAD and parses mixed commit styles", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "base.txt"), "base\n", "utf8");
    await commitAll(dir, "chore: baseline");
    await git(dir, "tag", "v1.0.0");

    await writeFile(path.join(dir, "f1.txt"), "one\n", "utf8");
    await commitAll(dir, "feat(api): add endpoint");
    await writeFile(path.join(dir, "f2.txt"), "two\n", "utf8");
    await commitAll(dir, "completely unstructured message");
    await writeFile(path.join(dir, "f3.txt"), "three\n", "utf8");
    await commitAll(dir, "fix: handle null input");

    const analysis = await engineFor(dir).analyze();
    expect(analysis.commits).toHaveLength(3);
    expect(analysis.categories).toMatchObject({ feat: 1, fix: 1, other: 1, chore: 0 });
    const featCommit = analysis.commits.find((c) => c.type === "feat");
    expect(featCommit?.scope).toBe("api");
    const unstructured = analysis.commits.find((c) => c.type === null);
    expect(unstructured?.subject).toBe("completely unstructured message");
    // baseline commit before the tag must not appear
    expect(analysis.files.some((f) => f.path === "base.txt")).toBe(false);
  });

  it("detects BREAKING CHANGE footers and feat!: markers", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
    await commitAll(dir, "feat: with footer", "BREAKING CHANGE: the old API is gone");
    await writeFile(path.join(dir, "b.txt"), "b\n", "utf8");
    await commitAll(dir, "feat!: bang marker");

    const analysis = await engineFor(dir).analyze();
    expect(analysis.commits.filter((c) => c.breaking)).toHaveLength(2);
    const fromCommits = analysis.breakingChanges.filter((b) => b.source === "commit");
    expect(fromCommits).toHaveLength(2);
  });

  it("reports binary file changes with 0 additions/deletions", async () => {
    const dir = await makeRepo();
    const binary = Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 10, 13, 0]);
    await writeFile(path.join(dir, "blob.bin"), binary);
    await commitAll(dir, "chore: add binary");
    await git(dir, "tag", "v0.1.0");
    await writeFile(path.join(dir, "blob.bin"), Buffer.from([0, 9, 9, 9, 0, 128, 0]));
    await commitAll(dir, "chore: change binary");

    const analysis = await engineFor(dir).analyze();
    const file = analysis.files.find((f) => f.path === "blob.bin");
    expect(file).toMatchObject({ status: "modified", additions: 0, deletions: 0 });
    // binary content must not produce security findings
    expect(analysis.securityFindings).toHaveLength(0);
  });

  it("detects renames", async () => {
    const dir = await makeRepo();
    const content = Array.from({ length: 30 }, (_, i) => `stable line ${i}`).join("\n");
    await writeFile(path.join(dir, "old-name.txt"), content, "utf8");
    await commitAll(dir, "chore: add file");
    await git(dir, "tag", "v0.1.0");
    await rename(path.join(dir, "old-name.txt"), path.join(dir, "new-name.txt"));
    await commitAll(dir, "refactor: rename file");

    const analysis = await engineFor(dir).analyze();
    const renamed = analysis.files.find((f) => f.status === "renamed");
    expect(renamed?.path).toBe("new-name.txt");
  });

  it("preserves unicode/emoji commit subjects", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "u.txt"), "ü\n", "utf8");
    await commitAll(dir, "feat: ✨ Grüße aus Aschaffenburg 🚀");
    const analysis = await engineFor(dir).analyze();
    expect(analysis.commits[0]?.subject).toBe("feat: ✨ Grüße aus Aschaffenburg 🚀");
    expect(analysis.commits[0]?.type).toBe("feat");
  });

  it("flags removed exported symbols as api-diff breaking changes", async () => {
    const dir = await makeRepo();
    await writeFile(
      path.join(dir, "api.ts"),
      "export function keepMe(): number { return 1; }\nexport const removeMe = 42;\n",
      "utf8",
    );
    await commitAll(dir, "feat: initial api");
    await git(dir, "tag", "v1.0.0");
    await writeFile(
      path.join(dir, "api.ts"),
      "export function keepMe(): number { return 2; }\n",
      "utf8",
    );
    await commitAll(dir, "refactor: slim api");

    const analysis = await engineFor(dir).analyze();
    const apiDiff = analysis.breakingChanges.filter((b) => b.source === "api-diff");
    expect(apiDiff).toHaveLength(1);
    expect(apiDiff[0]?.description).toContain('"removeMe"');
    expect(apiDiff[0]?.location).toBe("api.ts");
  });

  it("finds hardcoded secrets and dampens findings in test files", async () => {
    const dir = await makeRepo();
    const fakeAwsKey = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    await writeFile(path.join(dir, "config.ts"), `const key = "${fakeAwsKey}";\n`, "utf8");
    await writeFile(path.join(dir, "config.test.ts"), `const key = "${fakeAwsKey}";\n`, "utf8");
    await commitAll(dir, "feat: add config");

    const analysis = await engineFor(dir).analyze();
    const prod = analysis.securityFindings.find((f) => f.file === "config.ts");
    const test = analysis.securityFindings.find((f) => f.file === "config.test.ts");
    expect(prod).toMatchObject({ rule: "secret.aws-access-key-id", severity: "critical", line: 1 });
    expect(test).toMatchObject({ rule: "secret.aws-access-key-id", severity: "high" });
  });

  it("supports explicit ranges (tag..HEAD and bare tag)", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
    await commitAll(dir, "chore: first");
    await git(dir, "tag", "v1.0.0");
    await writeFile(path.join(dir, "b.txt"), "b\n", "utf8");
    await commitAll(dir, "feat: second");

    const ranged = await engineFor(dir).analyze("v1.0.0..HEAD");
    expect(ranged.commits).toHaveLength(1);
    expect(ranged.files.map((f) => f.path)).toEqual(["b.txt"]);

    const bare = await engineFor(dir).analyze("v1.0.0");
    expect(bare.commits).toHaveLength(1);
  });

  it("rejects invalid ranges with VersioningError", async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
    await commitAll(dir, "chore: first");
    await expect(engineFor(dir).analyze("no-such-tag..HEAD")).rejects.toThrow(VersioningError);
  });

  it("handles huge (>=1MB) files and nested paths", async () => {
    const dir = await makeRepo();
    await mkdir(path.join(dir, "deep", "nested"), { recursive: true });
    const hugeLine = "x".repeat(120);
    const huge = `${hugeLine}\n`.repeat(9000); // > 1 MB
    expect(huge.length).toBeGreaterThan(1_048_576);
    await writeFile(path.join(dir, "deep", "nested", "huge.txt"), huge, "utf8");
    await commitAll(dir, "feat: huge file");

    const analysis = await engineFor(dir).analyze();
    const file = analysis.files.find((f) => f.path === "deep/nested/huge.txt");
    expect(file?.additions).toBe(9000);
  });
});

describe("ChangeAnalysisEngine (fault injection)", () => {
  it("propagates a graceful error when git is missing", async () => {
    const engine = new ChangeAnalysisEngine({
      cwd: "/anywhere",
      logger,
      runner: async () => {
        const err = new Error("spawn git ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
    });
    await expect(engine.analyze()).rejects.toThrow(VersioningError);
    await expect(engine.analyze()).rejects.toThrow(/git executable not found/);
  });

  it("aborts mid-analysis when the signal fires", async () => {
    const controller = new AbortController();
    let calls = 0;
    const engine = new ChangeAnalysisEngine({
      cwd: "/anywhere",
      logger,
      signal: controller.signal,
      runner: async (args, options) => {
        calls += 1;
        if (calls === 2) controller.abort();
        if (options.signal?.aborted === true) {
          throw new Error("operation aborted");
        }
        if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
          return { exitCode: 0, stdout: "true\n", stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    await expect(engine.analyze()).rejects.toThrow(VersioningError);
  });
});

describe("extractExportedNames", () => {
  it("extracts declaration exports and export lists", () => {
    const source = [
      "export function fn() {}",
      "export async function afn() {}",
      "export class Klass {}",
      "export interface Iface {}",
      "export type Alias = string;",
      "export const constant = 1;",
      "export enum Enumeration {}",
      "const local = 1;",
      "export { local, local as renamed };",
      "export type { Alias as AliasOut };",
    ].join("\n");
    const names = extractExportedNames(source);
    for (const expected of [
      "fn",
      "afn",
      "Klass",
      "Iface",
      "Alias",
      "constant",
      "Enumeration",
      "local",
      "renamed",
      "AliasOut",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
    expect(names.has("default")).toBe(false);
  });

  it("tolerates empty and malformed sources", () => {
    expect(extractExportedNames("").size).toBe(0);
    expect(extractExportedNames("export {").size).toBe(0);
    expect(extractExportedNames("export }{ nonsense").size).toBe(0);
  });
});
