/**
 * End-to-end CLI tests (vitest project "e2e").
 *
 * These spawn the *built* CLI (`packages/cli/dist/index.js`) as a child
 * process with the real Node binary, exercising the fully wired core+cli stack
 * against a clean, offline environment. They assume `dist/` is already built
 * (run `pnpm build` first — the tests deliberately do NOT build).
 *
 * Cross-platform discipline:
 * - The CLI is launched via `process.execPath` + the dist entry path
 *   (`node:path.join`), never a shell (`shell: false`), so Windows/macOS/Linux
 *   behave identically and no shell quoting is involved.
 * - The environment is a *copy* of `process.env` with every provider key
 *   deleted, so the tests are deterministic regardless of the developer's keys.
 * - `NODE_OPTIONS=--no-warnings` only silences Node's experimental warnings
 *   (e.g. `node:sqlite`) on stderr; real errors still surface via exit codes
 *   and stdout assertions.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const CLI_ENTRY = join(REPO_ROOT, "packages", "cli", "dist", "index.js");

/** A fake, non-secret marker value used to verify redaction of API keys. */
const FAKE_KEY_MARKER = ["redaction", "probe", "value", "9f3c2"].join("-");

/** Provider key variables stripped from the child environment. */
const KEY_VARS = [
  "MISTRAL_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ULTRACODE_API_KEY",
  "ULTRACODE_MISTRAL_API_KEY",
  "ULTRACODE_ANTHROPIC_API_KEY",
  "ULTRACODE_OPENAI_API_KEY",
];

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** A clean, key-free copy of the current environment. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "--no-warnings" };
  for (const k of KEY_VARS) delete env[k];
  return { ...env, ...extra };
}

/** Spawn the built CLI and capture its output. Never rejects on non-zero exit. */
function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: opts.env ?? cleanEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/** Run a git command in `cwd` (deterministic identity injected). */
function git(cwd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["-c", "user.email=e2e@ultracode.test", "-c", "user.name=E2E Tester", ...args],
      { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

beforeAll(() => {
  if (!existsSync(CLI_ENTRY)) {
    throw new Error(
      `Built CLI not found at ${CLI_ENTRY}. Run \`pnpm build\` before the e2e suite.`,
    );
  }
});

describe("ultracode CLI (e2e)", () => {
  it("--version prints a semver string and exits 0", async () => {
    const r = await runCli(["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--help lists the core commands and exits 0", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    for (const cmd of ["run", "config", "tools", "agents", "version", "doctor"]) {
      expect(r.stdout).toContain(cmd);
    }
  });

  it("doctor runs offline and reports checks with a sensible exit code", async () => {
    const r = await runCli(["doctor"]);
    expect(r.stdout).toContain("UltraCode Doctor");
    expect(r.stdout).toMatch(/node:/);
    // Non-TTY + no keys makes some non-critical checks fail; exit is 0 or 1.
    expect([0, 1]).toContain(r.code);
  });

  it("doctor --json emits parseable JSON with a checks array", async () => {
    const r = await runCli(["doctor", "--json"]);
    const report = JSON.parse(r.stdout) as { ok: boolean; checks: unknown[] };
    expect(typeof report.ok).toBe("boolean");
    expect(Array.isArray(report.checks)).toBe(true);
  });

  it("config show prints config and masks secrets", async () => {
    const r = await runCli(["config", "show"], {
      env: cleanEnv({ ANTHROPIC_API_KEY: FAKE_KEY_MARKER }),
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("core.activeProvider");
    expect(r.stdout).not.toContain(FAKE_KEY_MARKER);
    expect(r.stdout).toContain("***REDACTED***");
  });

  it("config show --json is valid JSON with masked secrets", async () => {
    const r = await runCli(["config", "show", "--json"], {
      env: cleanEnv({ ANTHROPIC_API_KEY: FAKE_KEY_MARKER }),
    });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      core: { activeProvider: string };
      providers: { apiKeys?: Record<string, string> };
    };
    expect(typeof parsed.core.activeProvider).toBe("string");
    expect(JSON.stringify(parsed)).not.toContain(FAKE_KEY_MARKER);
  });

  it("tools list contains the expected built-in tools", async () => {
    const r = await runCli(["tools", "list"]);
    expect(r.code).toBe(0);
    for (const name of ["read", "write_file", "grep"]) {
      expect(r.stdout).toContain(name);
    }
  });

  it("agents list contains the expected built-in agents", async () => {
    const r = await runCli(["agents", "list"]);
    expect(r.code).toBe(0);
    for (const name of ["default", "build", "plan", "review", "security"]) {
      expect(r.stdout).toContain(name);
    }
  });

  it("version suggest / analyze work in a real git repo", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ultracode-e2e-"));
    try {
      expect((await git(repo, ["init", "-q"])).code).toBe(0);
      await git(repo, ["commit", "-q", "--allow-empty", "-m", "chore: scaffold"]);
      writeFileSync(join(repo, "feature.txt"), "hello\n", "utf8");
      await git(repo, ["add", "feature.txt"]);
      await git(repo, ["commit", "-q", "-m", "feat: add a feature"]);

      const suggest = await runCli(["version", "suggest"], { cwd: repo });
      expect(suggest.code).toBe(0);
      expect(suggest.stdout.toLowerCase()).toContain("minor");
      expect(suggest.stdout).toContain("0.1.0");

      const analyze = await runCli(["version", "analyze"], { cwd: repo });
      expect(analyze.code).toBe(0);
      expect(analyze.stdout).toContain("Commits");
      expect(analyze.stdout).toMatch(/feat 1/);
    } finally {
      rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("run -p without API keys exits 1 with a clear error and no crash", async () => {
    const r = await runCli(["run", "-p", "hello"]);
    expect(r.code).toBe(1);
    const combined = `${r.stdout}${r.stderr}`;
    expect(combined).toMatch(/API key/i);
    // A clean, user-facing error — not an unhandled stack trace.
    expect(combined).not.toMatch(/at Object\.<anonymous>|at process\./);
  });

  it("an unknown command exits non-zero and points at --help", async () => {
    const r = await runCli(["frobnicate-this-does-not-exist"]);
    expect(r.code).not.toBe(0);
    const combined = `${r.stdout}${r.stderr}`;
    expect(combined).toMatch(/unknown command/i);
    expect(combined).toMatch(/--help/);
  });
});
