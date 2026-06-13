import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_CONFIG, NoopLogger } from "ultracode-shared";
import type { LogMeta, Logger, UltraCodeConfig } from "ultracode-shared";
import { afterEach, describe, expect, it } from "vitest";

import { ContextCollector } from "./ContextCollector.js";
import type { ContextSection } from "./ContextCollector.js";
import { ContextCompressor } from "./ContextCompressor.js";
import { ContextEngine, createContextEngine } from "./ContextEngine.js";

function config(maxTokens = 32_000): UltraCodeConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  c.core.maxTokens = maxTokens;
  return c;
}

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

/** Collector stub returning fixed sections (typed via structural cast). */
function stubCollector(sections: ContextSection[]): ContextCollector {
  return { collect: async () => sections } as unknown as ContextCollector;
}

describe("createContextEngine / ContextEngine", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    dir = undefined;
  });

  async function tmpProject(): Promise<string> {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-engine-"));
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "ctx-demo", version: "0.0.1", scripts: { test: "vitest" } }),
      "utf8",
    );
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "main.ts"), "export const x = 1;\n", "utf8");
    return dir;
  }

  it("factory matches the monorepo-wide contract", () => {
    const engine = createContextEngine(config(), new NoopLogger());
    expect(engine).toBeInstanceOf(ContextEngine);
    expect(typeof engine.collect).toBe("function");
  });

  it("collects a real project into structured markdown sections", async () => {
    const cwd = await tmpProject();
    const collector = new ContextCollector(new NoopLogger(), {
      gitRunner: async () => ({ ok: false, stdout: "" }),
    });
    const engine = new ContextEngine(config(), new NoopLogger(), { collector });
    const out = await engine.collect({ cwd, prompt: "what does this project do?" });
    expect(out.startsWith("# Project Context")).toBe(true);
    expect(out).toContain("## Project");
    expect(out).toContain("ctx-demo");
    expect(out).toContain("## File Tree");
    expect(out).toContain("main.ts");
    expect(out).toContain("## System");
  });

  it("respects the explicit maxTokens budget", async () => {
    const cwd = await tmpProject();
    const compressor = new ContextCompressor();
    const collector = new ContextCollector(new NoopLogger(), {
      gitRunner: async () => ({ ok: false, stdout: "" }),
    });
    const engine = new ContextEngine(config(), new NoopLogger(), { collector, compressor });
    const out = await engine.collect({ cwd, prompt: "p", maxTokens: 40 });
    expect(compressor.estimateTokens(out)).toBeLessThanOrEqual(40);
  });

  it("returns '' for a zero budget", async () => {
    const cwd = await tmpProject();
    const engine = createContextEngine(config(), new NoopLogger());
    expect(await engine.collect({ cwd, prompt: "p", maxTokens: 0 })).toBe("");
  });

  it("defaults the budget to config.core.maxTokens", async () => {
    const compressor = new ContextCompressor();
    const fat = "word ".repeat(200); // ~250 tokens rendered
    const engine = new ContextEngine(config(20), new NoopLogger(), {
      collector: stubCollector([
        { id: "a", title: "A", content: fat, priority: 10 },
        { id: "b", title: "B", content: "tiny", priority: 20 },
      ]),
      compressor,
    });
    const out = await engine.collect({ cwd: ".", prompt: "p" });
    expect(compressor.estimateTokens(out)).toBeLessThanOrEqual(20);
    expect(out).toContain("## B"); // the small section still fits
    expect(out).not.toContain("## A");
  });

  it("ranks sections mentioned in the prompt first", async () => {
    const engine = new ContextEngine(config(), new NoopLogger(), {
      collector: stubCollector([
        { id: "tree", title: "File Tree", content: "src/\n  billing.ts\n  parser.ts", priority: 40 },
        { id: "sys", title: "System", content: "Platform: linux", priority: 50 },
      ]),
    });
    const out = await engine.collect({ cwd: ".", prompt: "refactor billing.ts" });
    expect(out.indexOf("## File Tree")).toBeLessThan(out.indexOf("## System"));
  });

  it("returns '' and warns when the collector itself throws", async () => {
    const { logger, warns } = spyLogger();
    const broken = {
      collect: async () => {
        throw new Error("collector exploded");
      },
    } as unknown as ContextCollector;
    const engine = new ContextEngine(config(), logger, { collector: broken });
    const out = await engine.collect({ cwd: ".", prompt: "p" });
    expect(out).toBe("");
    expect(warns.some((w) => w.includes("Context collection failed"))).toBe(true);
  });

  it("returns '' for an empty directory yielding no usable sections", async () => {
    const engine = new ContextEngine(config(), new NoopLogger(), {
      collector: stubCollector([]),
    });
    expect(await engine.collect({ cwd: ".", prompt: "p" })).toBe("");
  });

  it("handles unicode/emoji prompts", async () => {
    const cwd = await tmpProject();
    const engine = createContextEngine(config(), new NoopLogger());
    const out = await engine.collect({ cwd, prompt: "🦄 何をしますか? Grüße!" });
    expect(out).toContain("# Project Context");
  });
});
