import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NoopLogger } from "@ultracode/shared";
import type { LogMeta, Logger } from "@ultracode/shared";
import { afterEach, describe, expect, it } from "vitest";

import { ContextCollector } from "./ContextCollector.js";
import type { ContextSection, GitRunner } from "./ContextCollector.js";

function spyLogger(): { logger: Logger; warns: string[] } {
  const warns: string[] = [];
  const noop = (): void => undefined;
  return {
    logger: {
      debug: noop,
      info: noop,
      warn: (m: string, _meta?: LogMeta) => {
        warns.push(m);
      },
      error: noop,
    },
    warns,
  };
}

const noGit: GitRunner = async () => ({ ok: false, stdout: "" });

function byId(sections: ContextSection[], id: string): ContextSection | undefined {
  return sections.find((s) => s.id === id);
}

describe("ContextCollector", () => {
  let dir: string;

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  async function tmp(): Promise<string> {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-ctx-"));
    return dir;
  }

  it("handles an empty directory without git gracefully", async () => {
    const cwd = await tmp();
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit });
    const sections = await collector.collect(cwd);
    expect(byId(sections, "git")).toBeUndefined();
    expect(byId(sections, "project")).toBeUndefined();
    expect(byId(sections, "recent-files")).toBeUndefined();
    expect(byId(sections, "file-tree")?.content).toBe("(empty)");
    expect(byId(sections, "system")?.content).toContain(`Node: ${process.version}`);
  });

  it("collects project metadata from package.json", async () => {
    const cwd = await tmp();
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "demo-app", version: "1.2.3", scripts: { build: "tsc", test: "vitest" } }),
      "utf8",
    );
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit });
    const project = byId(await collector.collect(cwd), "project");
    expect(project?.content).toContain("Name: demo-app");
    expect(project?.content).toContain("Version: 1.2.3");
    expect(project?.content).toContain("Scripts: build, test");
  });

  it("omits the project section (with a warning) for corrupt package.json", async () => {
    const cwd = await tmp();
    await writeFile(path.join(cwd, "package.json"), "{ broken!", "utf8");
    const { logger, warns } = spyLogger();
    const collector = new ContextCollector(logger, { gitRunner: noGit });
    const sections = await collector.collect(cwd);
    expect(byId(sections, "project")).toBeUndefined();
    expect(byId(sections, "system")).toBeDefined(); // other sources unaffected
    expect(warns.some((w) => w.includes('"project"'))).toBe(true);
  });

  it("reports git branch and dirty status via the injected runner", async () => {
    const cwd = await tmp();
    const runner: GitRunner = async (args) => {
      if (args[0] === "rev-parse") return { ok: true, stdout: "feature/x\n" };
      return { ok: true, stdout: " M src/a.ts\n?? b.ts\n" };
    };
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: runner });
    const git = byId(await collector.collect(cwd), "git");
    expect(git?.content).toContain("Branch: feature/x");
    expect(git?.content).toContain("Status: 2 changed file(s)");
    expect(git?.content).toContain("M src/a.ts");
  });

  it("reports a clean working tree", async () => {
    const cwd = await tmp();
    const runner: GitRunner = async (args) =>
      args[0] === "rev-parse" ? { ok: true, stdout: "main\n" } : { ok: true, stdout: "" };
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: runner });
    const git = byId(await collector.collect(cwd), "git");
    expect(git?.content).toContain("Status: clean");
  });

  it("omits git gracefully when the binary does not exist (real spawn)", async () => {
    const cwd = await tmp();
    const collector = new ContextCollector(new NoopLogger(), {
      gitCommand: "ultracode-definitely-not-a-binary-1f9a",
    });
    const sections = await collector.collect(cwd);
    expect(byId(sections, "git")).toBeUndefined();
  });

  it("tolerates a git runner that throws", async () => {
    const cwd = await tmp();
    const { logger, warns } = spyLogger();
    const collector = new ContextCollector(logger, {
      gitRunner: async () => {
        throw new Error("spawn exploded");
      },
    });
    const sections = await collector.collect(cwd);
    expect(byId(sections, "git")).toBeUndefined();
    expect(byId(sections, "file-tree")).toBeDefined();
    expect(warns.some((w) => w.includes('"git"'))).toBe(true);
  });

  it("ignores node_modules, .git and dist in the file tree", async () => {
    const cwd = await tmp();
    await mkdir(path.join(cwd, "node_modules", "dep"), { recursive: true });
    await mkdir(path.join(cwd, ".git"), { recursive: true });
    await mkdir(path.join(cwd, "dist"), { recursive: true });
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "app.ts"), "export {};", "utf8");
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit });
    const tree = byId(await collector.collect(cwd), "file-tree");
    expect(tree?.content).toContain("src/");
    expect(tree?.content).toContain("app.ts");
    expect(tree?.content).not.toContain("node_modules");
    expect(tree?.content).not.toContain(".git");
    expect(tree?.content).not.toContain("dist");
  });

  it("limits tree depth", async () => {
    const cwd = await tmp();
    await mkdir(path.join(cwd, "a", "b", "c"), { recursive: true });
    await writeFile(path.join(cwd, "a", "b", "c", "deep.ts"), "", "utf8");
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit, maxDepth: 2 });
    const tree = byId(await collector.collect(cwd), "file-tree");
    expect(tree?.content).toContain("a/");
    expect(tree?.content).toContain("b/");
    expect(tree?.content).not.toContain("c/");
    expect(tree?.content).not.toContain("deep.ts");
  });

  it("limits total entries and marks truncation", async () => {
    const cwd = await tmp();
    for (let i = 0; i < 10; i++) {
      await writeFile(path.join(cwd, `file-${String(i).padStart(2, "0")}.ts`), "", "utf8");
    }
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit, maxEntries: 3 });
    const tree = byId(await collector.collect(cwd), "file-tree");
    expect(tree?.content).toContain("… (truncated)");
    const fileLines = tree?.content.split("\n").filter((l) => l.startsWith("file-")) ?? [];
    expect(fileLines).toHaveLength(3);
  });

  it("lists recently modified files, newest first, capped by the limit", async () => {
    const cwd = await tmp();
    const old = path.join(cwd, "old.ts");
    const fresh = path.join(cwd, "fresh.ts");
    const mid = path.join(cwd, "mid.ts");
    await writeFile(old, "", "utf8");
    await writeFile(fresh, "", "utf8");
    await writeFile(mid, "", "utf8");
    const base = Date.now() / 1000;
    await utimes(old, base - 3600, base - 3600);
    await utimes(mid, base - 1800, base - 1800);
    await utimes(fresh, base, base);

    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit, recentFilesLimit: 2 });
    const recent = byId(await collector.collect(cwd), "recent-files");
    expect(recent?.content.split("\n")).toEqual(["fresh.ts", "mid.ts"]);
  });

  it("uses forward slashes for nested recent-file paths (cross-platform stable)", async () => {
    const cwd = await tmp();
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "deep.ts"), "", "utf8");
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit });
    const recent = byId(await collector.collect(cwd), "recent-files");
    expect(recent?.content).toContain("src/deep.ts");
  });

  it("handles unicode/emoji file names", async () => {
    const cwd = await tmp();
    await writeFile(path.join(cwd, "übersicht-🚀.md"), "# hi", "utf8");
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit });
    const tree = byId(await collector.collect(cwd), "file-tree");
    expect(tree?.content).toContain("übersicht-🚀.md");
  });

  it("never rejects, even when cwd does not exist", async () => {
    await tmp();
    const collector = new ContextCollector(new NoopLogger(), { gitRunner: noGit });
    const sections = await collector.collect(path.join(dir, "definitely", "missing"));
    // file tree of a missing dir is empty, system info still present
    expect(byId(sections, "system")).toBeDefined();
  });
});
