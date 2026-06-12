/**
 * Integration test: the {@link ExecutionEngine} applies an injected optimizer
 * before the provider call and publishes a `tokens.optimized` event.
 */

import { describe, expect, it, vi } from "vitest";
import type {
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  ToolDefinition,
} from "@ultracode/shared";
import { ExecutionEngine } from "../execution/ExecutionEngine.js";
import type { IToolRunner, ITokenOptimizer } from "../execution/index.js";
import { createDefaultOptimizer } from "./TokenOptimizer.js";

function stubProvider(capture: (req: CompletionRequest) => void): ILLMProvider {
  const complete = vi.fn(async (req: CompletionRequest): Promise<CompletionResult> => {
    capture(req);
    return { text: "done", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop" };
  });
  return {
    name: "stub",
    complete,
    stream: async function* () {
      yield { type: "done", usage: { inputTokens: 0, outputTokens: 0 } } as const;
    },
    listModels: async () => [],
    healthCheck: async () => true,
  } as unknown as ILLMProvider;
}

const noTools: IToolRunner = {
  execute: async () => ({ ok: true, output: null, durationMs: 0 }),
  list: (): ToolDefinition[] => [],
};

describe("ExecutionEngine token optimization integration", () => {
  it("applies the optimizer to the prompt before the provider call", async () => {
    let seen: CompletionRequest | undefined;
    const provider = stubProvider((req) => {
      seen = req;
    });
    const engine = new ExecutionEngine({
      provider,
      tools: noTools,
      model: "m",
      optimizer: createDefaultOptimizer({ includeCompaction: false }),
    });
    await engine.run({
      prompt: "go",
      systemPrompt: "Be precise.\n\nBe precise.\n\n\n\n\nstay sharp",
    });
    const system = seen?.messages.find((m) => m.role === "system");
    // Duplicate sentence collapsed by the minify stage.
    expect(system?.content.match(/Be precise\./g)?.length).toBe(1);
  });

  it("emits a tokens.optimized event with honest figures", async () => {
    const events: Array<{ type: string; reductionPct?: number }> = [];
    const bus = {
      emit: (e: { type: string }) => events.push(e as { type: string; reductionPct?: number }),
      on: () => () => {},
    };
    const provider = stubProvider(() => {});
    const engine = new ExecutionEngine({
      provider,
      tools: noTools,
      model: "m",
      events: bus as never,
      optimizer: createDefaultOptimizer({ includeCompaction: false }),
    });
    await engine.run({ prompt: "go", systemPrompt: "x\n\nx\n\n\n\ny" });
    const optimized = events.find((e) => e.type === "tokens.optimized");
    expect(optimized).toBeDefined();
    expect(typeof optimized?.reductionPct).toBe("number");
  });

  it("does nothing when no optimizer is injected (default no-op)", async () => {
    let seen: CompletionRequest | undefined;
    const provider = stubProvider((req) => {
      seen = req;
    });
    const engine = new ExecutionEngine({ provider, tools: noTools, model: "m" });
    await engine.run({ prompt: "go", systemPrompt: "a\n\na" });
    // Untouched: duplicate still present.
    const system = seen?.messages.find((m) => m.role === "system");
    expect(system?.content).toBe("a\n\na");
  });

  it("respects enableTokenOptimization:false even with an optimizer", async () => {
    let seen: CompletionRequest | undefined;
    const provider = stubProvider((req) => {
      seen = req;
    });
    const failing: ITokenOptimizer = {
      optimize: vi.fn(async () => {
        throw new Error("should not be called");
      }),
    };
    const engine = new ExecutionEngine({
      provider,
      tools: noTools,
      model: "m",
      optimizer: failing,
      enableTokenOptimization: false,
    });
    await engine.run({ prompt: "go", systemPrompt: "a\n\na" });
    expect(failing.optimize).not.toHaveBeenCalled();
    expect(seen?.messages.find((m) => m.role === "system")?.content).toBe("a\n\na");
  });

  it("falls back to the original prompt when the optimizer throws", async () => {
    let seen: CompletionRequest | undefined;
    const provider = stubProvider((req) => {
      seen = req;
    });
    const failing: ITokenOptimizer = {
      optimize: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const engine = new ExecutionEngine({ provider, tools: noTools, model: "m", optimizer: failing });
    const result = await engine.run({ prompt: "go", systemPrompt: "keep" });
    expect(result.text).toBe("done");
    expect(seen?.messages.find((m) => m.role === "system")?.content).toBe("keep");
  });
});
