import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VersioningError } from "@ultracode/shared";
import { GitClient, defaultGitRunner } from "./GitClient.js";
import type { GitCommandResult, GitRunner } from "./GitClient.js";

const ok = (stdout: string): GitCommandResult => ({ exitCode: 0, stdout, stderr: "" });
const fail = (stderr: string, exitCode = 128): GitCommandResult => ({ exitCode, stdout: "", stderr });

describe("GitClient (fake runner)", () => {
  it("run() returns the runner result for any exit code", async () => {
    const client = new GitClient({ cwd: "/x", runner: async () => fail("boom", 2) });
    const result = await client.run(["status"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("boom");
  });

  it("output() returns stdout on success", async () => {
    const client = new GitClient({ cwd: "/x", runner: async () => ok("hello\n") });
    await expect(client.output(["log"])).resolves.toBe("hello\n");
  });

  it("output() throws VersioningError on non-zero exit including stderr", async () => {
    const client = new GitClient({ cwd: "/x", runner: async () => fail("fatal: bad revision") });
    await expect(client.output(["log", "nope"])).rejects.toThrow(VersioningError);
    await expect(client.output(["log", "nope"])).rejects.toThrow(/bad revision/);
  });

  it("run() maps ENOENT to a graceful 'git not found' VersioningError", async () => {
    const enoent: GitRunner = async () => {
      const err = new Error("spawn git ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };
    const client = new GitClient({ cwd: "/x", runner: enoent });
    await expect(client.run(["--version"])).rejects.toThrow(VersioningError);
    await expect(client.run(["--version"])).rejects.toThrow(/git executable not found/);
  });

  it("run() wraps arbitrary runner failures in VersioningError", async () => {
    const client = new GitClient({
      cwd: "/x",
      runner: async () => {
        throw new Error("kaboom");
      },
    });
    await expect(client.run(["status"])).rejects.toThrow(VersioningError);
    await expect(client.run(["status"])).rejects.toThrow(/kaboom/);
  });

  it("run() wraps thrown non-Error values", async () => {
    const client = new GitClient({
      cwd: "/x",
      runner: async () => {
        // eslint-disable-next-line no-throw-literal
        throw "string failure";
      },
    });
    await expect(client.run(["status"])).rejects.toThrow(VersioningError);
  });

  it("tryOutput() returns null on failure and lastTag() maps empty output to null", async () => {
    const failing = new GitClient({ cwd: "/x", runner: async () => fail("no tags") });
    await expect(failing.tryOutput(["describe"])).resolves.toBeNull();
    await expect(failing.lastTag()).resolves.toBeNull();

    const empty = new GitClient({ cwd: "/x", runner: async () => ok("  \n") });
    await expect(empty.lastTag()).resolves.toBeNull();

    const tagged = new GitClient({ cwd: "/x", runner: async () => ok("v1.2.3\n") });
    await expect(tagged.lastTag()).resolves.toBe("v1.2.3");
  });

  it("isInsideWorkTree() requires exit 0 and literal 'true'", async () => {
    const yes = new GitClient({ cwd: "/x", runner: async () => ok("true\n") });
    const no = new GitClient({ cwd: "/x", runner: async () => ok("false\n") });
    const broken = new GitClient({ cwd: "/x", runner: async () => fail("not a repo") });
    await expect(yes.isInsideWorkTree()).resolves.toBe(true);
    await expect(no.isInsideWorkTree()).resolves.toBe(false);
    await expect(broken.isInsideWorkTree()).resolves.toBe(false);
  });
});

describe("GitClient (default runner, real git)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ultracode-gitclient-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("runs git --version", async () => {
    const result = await defaultGitRunner(["--version"], { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/git version/);
  });

  it("reports non-repo directories via isInsideWorkTree()", async () => {
    const client = new GitClient({ cwd: dir });
    await expect(client.isInsideWorkTree()).resolves.toBe(false);
  });

  it("rejects with VersioningError when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new GitClient({ cwd: dir, signal: controller.signal });
    await expect(client.run(["--version"])).rejects.toThrow(VersioningError);
  });
});
