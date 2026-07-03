import type { ITool, ToolContext, ToolDefinition } from "ultracode-shared";
import { DEFAULT_CONFIG, NoopLogger, sleep } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { ToolExecutor } from "./ToolExecutor.js";
import { ToolQueue } from "./ToolQueue.js";
import { ToolRegistry } from "./ToolRegistry.js";

function makeCtx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: process.cwd(), env: {}, logger: new NoopLogger(), ...extra };
}

interface Tracker {
  started: string[];
  concurrent: number;
  maxConcurrent: number;
}

function trackingTool(name: string, tracker: Tracker, delayMs: number): ITool {
  const definition: ToolDefinition = {
    name,
    description: name,
    category: "utility",
    parameters: { type: "object" },
    permission: "always",
  };
  return {
    definition,
    validate: (args) => (args ?? {}) as Record<string, unknown>,
    execute: async (args) => {
      const id = String((args as { id?: unknown }).id ?? name);
      tracker.started.push(id);
      tracker.concurrent += 1;
      tracker.maxConcurrent = Math.max(tracker.maxConcurrent, tracker.concurrent);
      await sleep(delayMs);
      tracker.concurrent -= 1;
      return { ok: true, output: id, durationMs: 0 };
    },
  };
}

function makeSystem(tracker: Tracker, delayMs = 20): ToolExecutor {
  const registry = new ToolRegistry();
  registry.register(trackingTool("work", tracker, delayMs));
  return new ToolExecutor(registry, structuredClone(DEFAULT_CONFIG), new NoopLogger());
}

describe("ToolQueue", () => {
  it("starts jobs in FIFO order", async () => {
    const tracker: Tracker = { started: [], concurrent: 0, maxConcurrent: 0 };
    const queue = new ToolQueue(makeSystem(tracker, 5), { maxConcurrent: 1 });

    const results = await queue.runAll(
      ["a", "b", "c", "d"].map((id) => ({ name: "work", args: { id }, ctx: makeCtx() })),
    );
    expect(tracker.started).toEqual(["a", "b", "c", "d"]);
    expect(results.map((r) => r.output)).toEqual(["a", "b", "c", "d"]);
  });

  it("never exceeds maxConcurrent", async () => {
    const tracker: Tracker = { started: [], concurrent: 0, maxConcurrent: 0 };
    const queue = new ToolQueue(makeSystem(tracker, 25), { maxConcurrent: 2 });

    await queue.runAll(
      Array.from({ length: 8 }, (_, i) => ({
        name: "work",
        args: { id: String(i) },
        ctx: makeCtx(),
      })),
    );
    expect(tracker.maxConcurrent).toBeLessThanOrEqual(2);
    expect(tracker.started).toHaveLength(8);
  });

  it("defaults to 4 concurrent and exposes counters", async () => {
    const tracker: Tracker = { started: [], concurrent: 0, maxConcurrent: 0 };
    const queue = new ToolQueue(makeSystem(tracker, 30));

    const all = queue.runAll(
      Array.from({ length: 10 }, (_, i) => ({
        name: "work",
        args: { id: String(i) },
        ctx: makeCtx(),
      })),
    );
    expect(queue.running).toBeLessThanOrEqual(4);
    expect(queue.running + queue.pending).toBeGreaterThan(0);
    await all;
    expect(tracker.maxConcurrent).toBeLessThanOrEqual(4);
    expect(tracker.maxConcurrent).toBeGreaterThan(1);
    expect(queue.running).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it("clamps invalid maxConcurrent values to the default", async () => {
    const tracker: Tracker = { started: [], concurrent: 0, maxConcurrent: 0 };
    const queue = new ToolQueue(makeSystem(tracker, 1), { maxConcurrent: Number.NaN });
    const result = await queue.enqueue({ name: "work", args: {}, ctx: makeCtx() });
    expect(result.ok).toBe(true);
  });

  it("skips queued jobs whose signal is already aborted", async () => {
    const tracker: Tracker = { started: [], concurrent: 0, maxConcurrent: 0 };
    const queue = new ToolQueue(makeSystem(tracker, 30), { maxConcurrent: 1 });
    const controller = new AbortController();

    const first = queue.enqueue({ name: "work", args: { id: "first" }, ctx: makeCtx() });
    const second = queue.enqueue({
      name: "work",
      args: { id: "second" },
      ctx: makeCtx({ signal: controller.signal }),
    });
    controller.abort(new Error("changed my mind"));

    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.error?.message).toContain("changed my mind");
    expect(tracker.started).toEqual(["first"]);
  });

  it("resolves (never rejects) when the underlying tool fails", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry, structuredClone(DEFAULT_CONFIG), new NoopLogger());
    const queue = new ToolQueue(executor);
    const result = await queue.enqueue({ name: "missing", args: {}, ctx: makeCtx() });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_NOT_FOUND");
  });
});
