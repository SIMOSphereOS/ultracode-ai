import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoopLogger } from "@ultracode/shared";
import type { ToolContext } from "@ultracode/shared";
import { BashTool } from "./BashTool.js";

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
  await fs.rm(root, { recursive: true, force: true });
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

  // SEC-001: spawn must not inherit the parent process.env (API-key leak).
  it("does not leak parent process.env into command output", async () => {
    const secret = "uc-secret-should-not-leak-12345";
    process.env.ANTHROPIC_API_KEY = secret;
    try {
      const result = await tool.execute(
        tool.validate({
          command: nodeCmd(
            "process.stdout.write((process.env.ANTHROPIC_API_KEY||'')+'|'+(process.env.CUSTOM||''))",
          ),
        }),
        ctx({ env: { CUSTOM: "x", PATH: process.env.PATH ?? "" } }),
      );
      expect(result.ok).toBe(true);
      // The parent-only secret must be absent…
      expect(result.output.stdout).not.toContain(secret);
      // …but the context's own env variable must be visible.
      expect(result.output.stdout).toContain("x");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
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
});
