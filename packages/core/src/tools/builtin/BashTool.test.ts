import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoopLogger } from "@ultracode/shared";
import type { ToolContext } from "@ultracode/shared";
import { BashTool } from "./BashTool.js";

const isPosix = process.platform !== "win32";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

/** Platform-neutral command builder using the current node binary. */
function nodeCmd(code: string): string {
  return `"${process.execPath}" -e "${code}"`;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-bash-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("BashTool", () => {
  const tool = new BashTool();

  it("captures stdout and exit code 0", async () => {
    const result = await tool.execute(
      tool.validate({ command: nodeCmd("console.log('hello-uc')") }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.stdout).toContain("hello-uc");
    expect(result.output.exitCode).toBe(0);
  });

  it("captures stderr and reports non-zero exit codes as ok:true", async () => {
    const result = await tool.execute(
      tool.validate({ command: nodeCmd("console.error('bad'); process.exit(3)") }),
      ctx(),
    );
    expect(result.ok).toBe(true); // exit code is part of the output
    expect(result.output.exitCode).toBe(3);
    expect(result.output.stderr).toContain("bad");
  });

  it("runs in the requested cwd", async () => {
    await fs.mkdir(path.join(root, "inner"));
    const result = await tool.execute(
      tool.validate({
        command: nodeCmd("console.log(process.cwd())"),
        cwd: "inner",
      }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.stdout).toContain("inner");
  });

  it("rejects cwd outside the sandbox", async () => {
    const result = await tool.execute(
      tool.validate({ command: "echo hi", cwd: "../.." }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("outside");
  });

  it("kills long-running commands on timeout (process tree)", async () => {
    const started = Date.now();
    const result = await tool.execute(
      tool.validate({
        command: nodeCmd("setTimeout(()=>{},10000)"),
        timeout: 0.3,
      }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(8000);
  }, 15_000);

  it("aborts via the context signal", async () => {
    const controller = new AbortController();
    const pending = tool.execute(
      tool.validate({ command: nodeCmd("setTimeout(()=>{},10000)") }),
      ctx({ signal: controller.signal }),
    );
    setTimeout(() => controller.abort(new Error("user abort")), 100);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("aborted");
  }, 15_000);

  it("caps gigantic output and flags truncation", async () => {
    const result = await tool.execute(
      tool.validate({
        command: nodeCmd("process.stdout.write('z'.repeat(1.5e6))"),
      }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.stdout.length).toBeLessThanOrEqual(100_000);
    expect(result.truncated).toBe(true);
  }, 15_000);

  it("handles unicode output", async () => {
    const result = await tool.execute(
      tool.validate({ command: nodeCmd("console.log('grüße 🌍')") }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.stdout).toContain("grüße 🌍");
  });

  it("returns a failure result when pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("too late"));
    const result = await tool.execute(
      tool.validate({ command: "echo hi" }),
      ctx({ signal: controller.signal }),
    );
    expect(result.ok).toBe(false);
  });

  it("validates arguments strictly", () => {
    expect(() => tool.validate({})).toThrow();
    expect(() => tool.validate({ command: "" })).toThrow();
    expect(() => tool.validate({ command: "x", timeout: -1 })).toThrow();
    expect(() => tool.validate({ command: "x", timeout: 999999 })).toThrow();
  });

  // SEC-001 (real fix): BashTool sanitises the env it spawns with, even when
  // handed the FULL process.env (the engine default). The previous test passed
  // a pre-cleaned ctx.env and so never exercised the choke point — it only
  // proved the spawn used ctx.env, not that secrets are stripped from it.
  it("strips credentials from the spawned env even when given the full process.env", async () => {
    const secret = "uc-secret-should-not-leak-12345";
    process.env.ANTHROPIC_API_KEY = secret;
    process.env.SOME_OTHER_TOKEN = "tok-also-secret";
    process.env.UC_BENIGN_VALUE = "visible-value";
    try {
      const result = await tool.execute(
        tool.validate({
          command: nodeCmd(
            "process.stdout.write([process.env.ANTHROPIC_API_KEY||'', process.env.SOME_OTHER_TOKEN||'', process.env.UC_BENIGN_VALUE||'', process.env.PATH?'has-path':''].join('|'))",
          ),
        }),
        // Hand the tool the *real* process.env, exactly as the engine default does.
        ctx({ env: process.env as Record<string, string | undefined> }),
      );
      expect(result.ok).toBe(true);
      // Credential variables (pattern-matched) must be stripped…
      expect(result.output.stdout).not.toContain(secret);
      expect(result.output.stdout).not.toContain("tok-also-secret");
      // …while benign variables (PATH, a non-secret custom var) survive.
      expect(result.output.stdout).toContain("visible-value");
      expect(result.output.stdout).toContain("has-path");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.SOME_OTHER_TOKEN;
      delete process.env.UC_BENIGN_VALUE;
    }
  });

  // EXT-002: a multibyte character split across stdout chunks must be decoded
  // correctly (no U+FFFD), via a per-stream StringDecoder.
  it("reassembles multibyte characters split across stream chunks", async () => {
    // Write the 4 UTF-8 bytes of 🌍 (F0 9F 8C 8D) in two flushes with a gap so
    // they arrive as separate 'data' chunks.
    const code =
      "const b=Buffer.from('🌍');" +
      "process.stdout.write(b.subarray(0,2));" +
      "setTimeout(()=>{process.stdout.write(b.subarray(2));},50);";
    const result = await tool.execute(tool.validate({ command: nodeCmd(code) }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.stdout).toBe("🌍");
    expect(result.output.stdout).not.toContain("�");
  }, 15_000);

  // EXT-001: capping output at the limit must not split a surrogate pair.
  it("caps output without producing a lone surrogate / replacement char", async () => {
    // One ASCII char shifts the alignment so the 100 000-char cap lands *inside*
    // a surrogate pair — a naive `slice(0, MAX)` would leave a lone surrogate.
    // 1 + 100 000 code points exceeds MAX_TOOL_OUTPUT_CHARS (100 000), forcing a cut.
    const code = "process.stdout.write('A'+'😀'.repeat(100000))";
    const result = await tool.execute(tool.validate({ command: nodeCmd(code) }), ctx());
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    // The cap is measured in Unicode code points (truncate semantics), so the
    // result holds at most MAX_TOOL_OUTPUT_CHARS code points.
    expect(Array.from(result.output.stdout).length).toBeLessThanOrEqual(100_000);
    // No lone surrogate left dangling at the cut, and no U+FFFD.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(result.output.stdout)).toBe(false);
    expect(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(result.output.stdout)).toBe(false);
    expect(result.output.stdout).not.toContain("�");
  }, 15_000);

  // SEC: when the POSIX process-group kill (`process.kill(-pid, 'SIGKILL')`)
  // throws — e.g. EPERM, or the group already gone — the kill must fall back to
  // `child.kill('SIGKILL')` so a timed-out command is still terminated. We
  // inject a `processKill` that always throws and confirm (1) it was reached and
  // (2) the long-running child is nonetheless killed and the call times out.
  it.runIf(isPosix)(
    "falls back to child.kill('SIGKILL') when the process-group kill throws",
    async () => {
      let groupKillAttempts = 0;
      const killTool = new BashTool({
        processKill: () => {
          groupKillAttempts += 1;
          throw new Error("EPERM: group kill not permitted");
        },
      });
      const started = Date.now();
      const result = await killTool.execute(
        killTool.validate({
          command: nodeCmd("setTimeout(()=>{},10000)"),
          timeout: 0.3,
        }),
        ctx(),
      );
      // The group kill was attempted (and threw), exercising the fallback path.
      expect(groupKillAttempts).toBeGreaterThan(0);
      // The fallback child.kill terminated the process, so we time out promptly
      // instead of hanging for the full 10s child timer.
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_TIMEOUT");
      expect(Date.now() - started).toBeLessThan(8000);
    },
    15_000,
  );

  // A spawn that fails to start (the child emits an 'error' event, e.g. the
  // shell binary missing) must surface as a ToolError, not an unhandled
  // rejection. We inject a fake child that emits 'error' on the next tick.
  it("produces a ToolError when the child emits a spawn 'error' event", async () => {
    const makeFakeChild = (): ChildProcess => {
      const emitter = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        pid: number | undefined;
        kill: (signal?: NodeJS.Signals) => boolean;
      };
      emitter.stdout = new EventEmitter();
      emitter.stderr = new EventEmitter();
      emitter.pid = undefined;
      emitter.kill = () => true;
      setImmediate(() => {
        emitter.emit("error", new Error("spawn /bin/sh ENOENT"));
      });
      return emitter as unknown as ChildProcess;
    };
    const errorTool = new BashTool({ spawnFn: () => makeFakeChild() });
    const result = await errorTool.execute(
      errorTool.validate({ command: "echo hi" }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_ERROR");
    expect(result.error?.message).toContain("Failed to start shell");
    expect(result.error?.message).toContain("ENOENT");
  });
});
