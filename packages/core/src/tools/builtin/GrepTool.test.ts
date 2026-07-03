import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "ultracode-shared";
import { NoopLogger, ValidationError } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GrepTool } from "./GrepTool.js";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-grep-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("GrepTool", () => {
  const tool = new GrepTool();

  it("finds matches with 1-based line numbers and /-separated paths", async () => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "a.ts"), "const x = 1;\nconst NEEDLE = 2;\n");
    await fs.writeFile(path.join(root, "b.ts"), "NEEDLE at line one");

    const result = await tool.execute(tool.validate({ pattern: "NEEDLE" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.count).toBe(2);
    const files = result.output.matches.map((m) => m.file).sort();
    expect(files).toEqual(["b.ts", "src/a.ts"]);
    const inSrc = result.output.matches.find((m) => m.file === "src/a.ts");
    expect(inSrc?.line).toBe(2);
  });

  it("supports regex patterns and the i/m/s/u flags", async () => {
    await fs.writeFile(path.join(root, "f.txt"), "Foo bar\nbaz FOO");
    const result = await tool.execute(tool.validate({ pattern: "^foo", flags: "i" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.count).toBe(1);
    expect(result.output.matches[0]?.line).toBe(1);
  });

  it("rejects forbidden flags at validation time", () => {
    expect(() => tool.validate({ pattern: "x", flags: "g" })).toThrow(ValidationError);
    expect(() => tool.validate({ pattern: "x", flags: "iy" })).toThrow(ValidationError);
  });

  it("returns a failure result for invalid regex syntax", async () => {
    const result = await tool.execute(tool.validate({ pattern: "([unclosed" }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("Invalid regular expression");
  });

  it("ignores node_modules, .git, dist and coverage", async () => {
    for (const dir of ["node_modules", ".git", "dist", "coverage", "src"]) {
      await fs.mkdir(path.join(root, dir), { recursive: true });
      await fs.writeFile(path.join(root, dir, "x.txt"), "SECRET");
    }
    const result = await tool.execute(tool.validate({ pattern: "SECRET" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.matches.map((m) => m.file)).toEqual(["src/x.txt"]);
  });

  it("skips binary files", async () => {
    await fs.writeFile(path.join(root, "bin.dat"), Buffer.from("MATCH\0MATCH"));
    await fs.writeFile(path.join(root, "txt.txt"), "MATCH");
    const result = await tool.execute(tool.validate({ pattern: "MATCH" }), ctx());
    expect(result.output.matches.map((m) => m.file)).toEqual(["txt.txt"]);
  });

  it("handles CRLF files and unicode content", async () => {
    await fs.writeFile(path.join(root, "crlf.txt"), "one\r\ntwo 🚀\r\nthree");
    const result = await tool.execute(tool.validate({ pattern: "🚀", flags: "u" }), ctx());
    expect(result.output.count).toBe(1);
    expect(result.output.matches[0]?.line).toBe(2);
    expect(result.output.matches[0]?.text).not.toContain("\r");
  });

  it("caps matches across a 1000-file tree", async () => {
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const dir = path.join(root, `d${i % 10}`);
      writes.push(
        fs
          .mkdir(dir, { recursive: true })
          .then(() => fs.writeFile(path.join(dir, `f${i}.txt`), `hit number ${i}\n`)),
      );
    }
    await Promise.all(writes);

    const capped = new GrepTool({ maxMatches: 50 });
    const result = await capped.execute(capped.validate({ pattern: "hit" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.count).toBe(50);
    expect(result.output.limitReached).toBe(true);
    expect(result.truncated).toBe(true);

    // A cap above the match count reports limitReached: false.
    const roomy = new GrepTool({ maxMatches: 2000 });
    const all = await roomy.execute(roomy.validate({ pattern: "hit" }), ctx());
    expect(all.output.count).toBe(1000);
    expect(all.output.limitReached).toBe(false);
  }, 30_000);

  it("per-call max_matches cannot exceed the configured cap", async () => {
    await fs.writeFile(path.join(root, "many.txt"), "x\n".repeat(100));
    const capped = new GrepTool({ maxMatches: 10 });
    const result = await capped.execute(
      capped.validate({ pattern: "x", max_matches: 9999 }),
      ctx(),
    );
    expect(result.output.count).toBe(10);
  });

  it("searches a single file when path points to one", async () => {
    await fs.writeFile(path.join(root, "single.txt"), "needle");
    const result = await tool.execute(
      tool.validate({ pattern: "needle", path: "single.txt" }),
      ctx(),
    );
    expect(result.output.count).toBe(1);
    expect(result.output.matches[0]?.file).toBe("single.txt");
  });

  it("fails outside the sandbox and for missing paths", async () => {
    const out = await tool.execute(tool.validate({ pattern: "x", path: "../.." }), ctx());
    expect(out.ok).toBe(false);

    const missing = await tool.execute(tool.validate({ pattern: "x", path: "no-such-dir" }), ctx());
    expect(missing.ok).toBe(false);
  });

  it("truncates very long matching lines", async () => {
    await fs.writeFile(path.join(root, "long.txt"), `start ${"y".repeat(100_000)}`);
    const result = await tool.execute(tool.validate({ pattern: "start" }), ctx());
    expect(result.ok).toBe(true);
    expect((result.output.matches[0]?.text ?? "").length).toBeLessThanOrEqual(500);
  });

  it("aborts via signal with a failure result", async () => {
    await fs.writeFile(path.join(root, "f.txt"), "x");
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const result = await tool.execute(
      tool.validate({ pattern: "x" }),
      ctx({ signal: controller.signal }),
    );
    expect(result.ok).toBe(false);
  });

  // SEC-003 (real fix): a catastrophic-backtracking user regex against a
  // *non-matching* pathological line cannot be defused by a haystack cap — the
  // 10k-char slice of `"a".repeat(9999)+"b"` is still 10k 'a's followed by a 'b'
  // (a non-match), driving `(a+)+$` into exponential backtracking that blocks a
  // synchronous `.test()` for minutes. The search now runs in a worker the host
  // hard-terminates at the configured tool timeout, so it must surface as a
  // ToolTimeoutError (ok:false) within that small budget — never hang.
  it("terminates a non-matching catastrophic regex as a timeout (does not hang)", async () => {
    // Single non-matching line: 9999 'a's then a 'b'. `(a+)+$` backtracks forever.
    await fs.writeFile(path.join(root, "evil.txt"), `${"a".repeat(9999)}b`);
    const fast = new GrepTool({ timeoutMs: 2000 });
    const started = Date.now();
    const result = await fast.execute(fast.validate({ pattern: "(a+)+$" }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_TIMEOUT");
    // Terminated near the configured timeout, far below the 15s test budget.
    expect(Date.now() - started).toBeLessThan(8000);
  }, 15_000);

  // SEC-003 (real fix): aborting via ctx.signal must terminate the worker and
  // surface ok:false even mid-flight (the same pathological non-matching line).
  it("aborts a running search via ctx.signal (terminates the worker)", async () => {
    await fs.writeFile(path.join(root, "evil.txt"), `${"a".repeat(9999)}b`);
    // Long worker timeout so the abort — not the timer — is what stops it.
    const slow = new GrepTool({ timeoutMs: 60_000 });
    const controller = new AbortController();
    const pending = slow.execute(
      slow.validate({ pattern: "(a+)+$" }),
      ctx({ signal: controller.signal }),
    );
    // Give the worker a moment to start spinning, then abort.
    setTimeout(() => controller.abort(new Error("cancel")), 100);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_TIMEOUT");
  }, 15_000);
});
