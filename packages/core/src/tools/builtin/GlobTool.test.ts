import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlobTool } from "./GlobTool.js";
import { walkFiles } from "./walk.js";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

async function touch(rel: string): Promise<void> {
  const full = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, "");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-glob-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("walkFiles", () => {
  it("walks recursively, skipping the ignore list", async () => {
    await touch("a.txt");
    await touch("sub/b.txt");
    await touch("node_modules/x.txt");
    await touch(".git/y.txt");
    await touch("dist/z.txt");
    await touch("coverage/c.txt");

    const seen: string[] = [];
    for await (const file of walkFiles(root)) {
      seen.push(path.relative(root, file).split(path.sep).join("/"));
    }
    expect(seen.sort()).toEqual(["a.txt", "sub/b.txt"]);
  });

  it("throws on abort", async () => {
    await touch("a.txt");
    const controller = new AbortController();
    controller.abort(new Error("walk stopped"));
    await expect(async () => {
      for await (const _ of walkFiles(root, { signal: controller.signal })) {
        void _;
      }
    }).rejects.toThrow("walk stopped");
  });

  it("respects the maxFiles cap", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => touch(`f${i}.txt`)));
    const seen: string[] = [];
    for await (const file of walkFiles(root, { maxFiles: 3 })) seen.push(file);
    expect(seen).toHaveLength(3);
  });
});

describe("GlobTool", () => {
  const tool = new GlobTool();

  it("matches ** patterns across directories", async () => {
    await touch("src/index.ts");
    await touch("src/lib/util.ts");
    await touch("src/lib/util.js");
    await touch("README.md");

    const result = await tool.execute(tool.validate({ pattern: "**/*.ts" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.files).toEqual(["src/index.ts", "src/lib/util.ts"]);
  });

  it("supports brace alternation and ? wildcards", async () => {
    await touch("a1.js");
    await touch("a2.ts");
    await touch("a30.ts");

    const result = await tool.execute(tool.validate({ pattern: "a?.{js,ts}" }), ctx());
    expect(result.output.files).toEqual(["a1.js", "a2.ts"]);
  });

  it("skips ignored directories", async () => {
    await touch("node_modules/pkg/index.ts");
    await touch("keep/index.ts");
    const result = await tool.execute(tool.validate({ pattern: "**/*.ts" }), ctx());
    expect(result.output.files).toEqual(["keep/index.ts"]);
  });

  it("handles unicode file names", async () => {
    await touch("docs/тест-📄.md");
    const result = await tool.execute(tool.validate({ pattern: "**/*.md" }), ctx());
    expect(result.output.files).toEqual(["docs/тест-📄.md"]);
  });

  it("returns an empty list when nothing matches", async () => {
    await touch("only.txt");
    const result = await tool.execute(tool.validate({ pattern: "**/*.xyz" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.files).toEqual([]);
    expect(result.output.count).toBe(0);
  });

  it("fails as a result for brace bombs (validate passes, execute fails)", async () => {
    const bomb = Array.from({ length: 6 }, () => "{a,b,c,d,e,f}").join("/");
    const result = await tool.execute(tool.validate({ pattern: bomb }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("alternatives");
  });

  // SEC-002: an over-deep segment bomb is reported as ok:false, never thrown.
  it("fails as a result for excessively deep segment patterns", async () => {
    const tooDeep = Array.from({ length: 150 }, () => "*").join("/");
    const result = await tool.execute(tool.validate({ pattern: tooDeep }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("segments");
  });

  // SEC-002: pathological consecutive ** must terminate quickly (collapsed).
  it("does not hang on consecutive ** patterns against a long path", async () => {
    await touch("deep/dir/structure/file.txt");
    const started = Date.now();
    const result = await tool.execute(
      tool.validate({ pattern: "**/**/**/**/**/**/nope.zzz" }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.files).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("caps results at maxResults", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => touch(`f${i}.txt`)));
    const capped = new GlobTool({ maxResults: 5 });
    const result = await capped.execute(capped.validate({ pattern: "*.txt" }), ctx());
    expect(result.output.files).toHaveLength(5);
    expect(result.output.limitReached).toBe(true);
  });

  it("fails outside the sandbox and on non-directories", async () => {
    const out = await tool.execute(tool.validate({ pattern: "*", path: "../.." }), ctx());
    expect(out.ok).toBe(false);

    await touch("file.txt");
    const notDir = await tool.execute(tool.validate({ pattern: "*", path: "file.txt" }), ctx());
    expect(notDir.ok).toBe(false);
  });
});
