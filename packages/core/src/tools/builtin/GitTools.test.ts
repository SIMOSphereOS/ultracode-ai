import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitDiffTool, GitLogTool, GitStatusTool } from "./GitTools.js";

const gitAvailable = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const isPosix = process.platform !== "win32";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

/** Run git synchronously inside the test repo, with a fixed identity. */
function git(...args: string[]): void {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=UC Test", ...args],
    { cwd: root, stdio: "pipe" },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr?.toString()}`);
  }
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-git-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe.runIf(gitAvailable)("Git tools (git available)", () => {
  it("git_status reports branch, dirty files and cleanliness", async () => {
    git("init", "-b", "main");
    const tool = new GitStatusTool();

    const clean = await tool.execute(tool.validate({}), ctx());
    expect(clean.ok).toBe(true);
    expect(clean.output.clean).toBe(true);
    expect(clean.output.branch).toContain("main");

    await fs.writeFile(path.join(root, "new.txt"), "x");
    const dirty = await tool.execute(tool.validate({}), ctx());
    expect(dirty.ok).toBe(true);
    expect(dirty.output.clean).toBe(false);
    expect(dirty.output.files).toEqual([{ status: "??", path: "new.txt" }]);
  });

  it("git_log lists commits with hash/author/date/subject", async () => {
    git("init", "-b", "main");
    await fs.writeFile(path.join(root, "a.txt"), "1");
    git("add", ".");
    git("commit", "-m", "feat: first 🚀");
    await fs.writeFile(path.join(root, "a.txt"), "2");
    git("add", ".");
    git("commit", "-m", "fix: second");

    const tool = new GitLogTool();
    const result = await tool.execute(tool.validate({ limit: 10 }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.commits).toHaveLength(2);
    expect(result.output.commits[0]?.subject).toBe("fix: second");
    expect(result.output.commits[1]?.subject).toBe("feat: first 🚀");
    expect(result.output.commits[0]?.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(result.output.commits[0]?.author).toBe("UC Test");
    // ISO-8601 date
    expect(result.output.commits[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("git_log respects the limit", async () => {
    git("init", "-b", "main");
    for (let i = 0; i < 3; i += 1) {
      await fs.writeFile(path.join(root, "a.txt"), String(i));
      git("add", ".");
      git("commit", "-m", `c${i}`);
    }
    const tool = new GitLogTool();
    const result = await tool.execute(tool.validate({ limit: 2 }), ctx());
    expect(result.output.commits).toHaveLength(2);
  });

  it("git_diff shows working-tree changes", async () => {
    git("init", "-b", "main");
    await fs.writeFile(path.join(root, "a.txt"), "old\n");
    git("add", ".");
    git("commit", "-m", "base");
    await fs.writeFile(path.join(root, "a.txt"), "new\n");

    const tool = new GitDiffTool();
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.diff).toContain("-old");
    expect(result.output.diff).toContain("+new");
  });

  it("git_diff rejects refs that look like options", () => {
    const tool = new GitDiffTool();
    expect(() => tool.validate({ ref1: "--upload-pack=evil" })).toThrow();
  });

  it("fails cleanly when the directory is not a repository", async () => {
    const tool = new GitStatusTool();
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_ERROR");
    expect(result.error?.message.toLowerCase()).toContain("git");
  });

  it("fails cleanly on an empty repository for git_log", async () => {
    git("init", "-b", "main");
    const tool = new GitLogTool();
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(false);
  });
});

// These tests use a POSIX `#!/bin/sh` wrapper as the fake git executable, so
// they only run on non-Windows platforms.
describe.runIf(isPosix)("Git tools (env sanitization)", () => {
  // SEC: git subprocesses must NOT inherit raw credentials from the environment
  // they are handed — the same choke point BashTool enforces via sanitizeEnv.
  // We point gitPath at a fake "git" that dumps its received env to a file, then
  // assert the secret variable never reached the child.
  it("strips credentials from the env handed to the git spawn", async () => {
    const dumpFile = path.join(root, "git-env-dump.json");
    const fakeGit = path.join(root, "fake-git.mjs");
    // The fake git ignores its args and writes its inherited env, then exits 0
    // with the porcelain header git_status expects.
    await fs.writeFile(
      fakeGit,
      [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(dumpFile)}, JSON.stringify(process.env));`,
        "process.stdout.write('## main\\n');",
        "process.exit(0);",
      ].join("\n"),
    );
    // GitStatusTool passes fixed args to the executable, so we cannot pass the
    // fake script as a git arg. Instead point gitPath at a POSIX shell wrapper
    // that execs node on the fake script (the git args are irrelevant to the
    // env dump). The wrapper inherits the same — sanitized — env as the child.
    const wrapper = path.join(root, "git-wrapper.sh");
    await fs.writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fakeGit}"\n`, {
      mode: 0o755,
    });

    const secret = "uc-git-secret-should-not-leak-98765";
    process.env.ANTHROPIC_API_KEY = secret;
    process.env.SOME_GIT_TOKEN = "git-tok-also-secret";
    process.env.UC_GIT_BENIGN = "git-visible-value";
    try {
      const status = new GitStatusTool({ gitPath: wrapper });
      const result = await status.execute(
        status.validate({}),
        // Hand the tool the real process.env, as the engine default does.
        ctx({ env: process.env as Record<string, string | undefined> }),
      );
      expect(result.ok).toBe(true);

      const dumped = JSON.parse(await fs.readFile(dumpFile, "utf8")) as Record<string, string>;
      // Secrets (pattern-matched) must be absent from the git child env…
      expect(dumped.ANTHROPIC_API_KEY).toBeUndefined();
      expect(dumped.SOME_GIT_TOKEN).toBeUndefined();
      expect(Object.values(dumped)).not.toContain(secret);
      // …while benign variables survive.
      expect(dumped.UC_GIT_BENIGN).toBe("git-visible-value");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.SOME_GIT_TOKEN;
      delete process.env.UC_GIT_BENIGN;
    }
  });

  it("honours extra secretEnvKeys for the git spawn", async () => {
    const dumpFile = path.join(root, "git-env-dump2.json");
    const fakeGit = path.join(root, "fake-git2.mjs");
    await fs.writeFile(
      fakeGit,
      [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(dumpFile)}, JSON.stringify(process.env));`,
        "process.stdout.write('## main\\n');",
        "process.exit(0);",
      ].join("\n"),
    );
    const wrapper = path.join(root, "git-wrapper2.sh");
    await fs.writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fakeGit}"\n`, {
      mode: 0o755,
    });

    const status = new GitStatusTool({
      gitPath: wrapper,
      // A benign-looking name only the explicit denylist would strip.
      secretEnvKeys: ["MY_CUSTOM_PROVIDER_VAR"],
    });
    const result = await status.execute(
      status.validate({}),
      ctx({
        env: {
          MY_CUSTOM_PROVIDER_VAR: "must-not-leak",
          PLAIN_VAR: "kept",
        },
      }),
    );
    expect(result.ok).toBe(true);
    const dumped = JSON.parse(await fs.readFile(dumpFile, "utf8")) as Record<string, string>;
    expect(dumped.MY_CUSTOM_PROVIDER_VAR).toBeUndefined();
    expect(dumped.PLAIN_VAR).toBe("kept");
  });
});

describe("Git tools (binary missing)", () => {
  it("reports a clear error when the git executable does not exist", async () => {
    const ghostPath = path.join(os.tmpdir(), "definitely-no-such-git-binary-uc");
    const status = new GitStatusTool({ gitPath: ghostPath });
    const diff = new GitDiffTool({ gitPath: ghostPath });
    const log = new GitLogTool({ gitPath: ghostPath });
    const results = [
      await status.execute(status.validate({}), ctx()),
      await diff.execute(diff.validate({}), ctx()),
      await log.execute(log.validate({}), ctx()),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain("not found");
    }
  });
});
