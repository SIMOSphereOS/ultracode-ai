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
});
