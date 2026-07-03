import type { ChatMessage, ToolDefinition } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import {
  DedupContextStage,
  SystemPromptMinifyStage,
  ToolSchemaSlimStage,
  WhitespaceNormalizeStage,
} from "./stages.js";
import { HeuristicTokenCounter } from "./TokenCounter.js";
import { computeStats, createDefaultOptimizer, TokenOptimizer } from "./TokenOptimizer.js";
import type { PromptPayload } from "./types.js";

const counter = new HeuristicTokenCounter();

function tool(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    category: "utility",
    parameters: { type: "object", properties: {}, required: [] },
    permission: "always",
  };
}

describe("computeStats", () => {
  it("sums the four parts into total", () => {
    const p: PromptPayload = {
      system: "system prompt here",
      tools: [tool("a", "desc")],
      messages: [{ role: "user", content: "hello world" }],
      context: "some context",
    };
    const stats = computeStats(p, counter);
    expect(stats.total).toBe(stats.system + stats.tools + stats.messages + stats.context);
    expect(stats.context).toBeGreaterThan(0);
  });

  it("reports context 0 when absent", () => {
    const stats = computeStats({ system: "x", tools: [], messages: [] }, counter);
    expect(stats.context).toBe(0);
  });
});

describe("TokenOptimizer.optimize", () => {
  it("reports an honest before/after reduction consistent with the counter", async () => {
    const opt = new TokenOptimizer({
      counter,
      stages: [new WhitespaceNormalizeStage(), new SystemPromptMinifyStage()],
    });
    const p: PromptPayload = {
      system: "Be precise.\n\nBe precise.\n\n\n\n\nAnswer well.",
      tools: [],
      messages: [{ role: "user", content: "hi\n\n\n\n\nthere" }],
    };
    const result = await opt.optimize(p);
    expect(result.before.total).toBe(computeStats(p, counter).total);
    expect(result.after.total).toBe(computeStats(result.payload, counter).total);
    expect(result.after.total).toBeLessThanOrEqual(result.before.total);
    const expectedPct = ((result.before.total - result.after.total) / result.before.total) * 100;
    expect(result.reductionPct).toBeCloseTo(Math.round(expectedPct * 10) / 10, 5);
  });

  it("per-stage savings sum to the total saving", async () => {
    const opt = createDefaultOptimizer({ includeCompaction: false });
    const p: PromptPayload = {
      system: "dup line\n\ndup line\n\n\n\nkeep",
      tools: [tool("read", "x".repeat(400))],
      messages: [{ role: "user", content: "go" }],
      context: "block A\n\nblock A\n\nother",
    };
    const result = await opt.optimize(p, { counter });
    const sumSaved = result.perStage.reduce((acc, s) => acc + s.saved, 0);
    expect(sumSaved).toBe(result.before.total - result.after.total);
  });

  it("reports saved 0 for a no-op stage rather than hiding it", async () => {
    const opt = new TokenOptimizer({ counter, stages: [new DedupContextStage()] });
    const p: PromptPayload = { system: "x", tools: [], messages: [], context: "a\n\nb" };
    const result = await opt.optimize(p);
    expect(result.perStage).toEqual([{ stage: "dedup-context", saved: 0 }]);
    expect(result.reductionPct).toBe(0);
  });

  it("returns reductionPct 0 for an empty payload", async () => {
    const opt = createDefaultOptimizer();
    const result = await opt.optimize({ system: "", tools: [], messages: [] });
    expect(result.before.total).toBe(0);
    expect(result.reductionPct).toBe(0);
  });

  it("never mutates the input payload", async () => {
    const opt = createDefaultOptimizer({ includeCompaction: false });
    const messages: ChatMessage[] = [{ role: "user", content: "a\n\n\n\nb" }];
    const p: PromptPayload = { system: "x\n\n\n\nx", tools: [], messages };
    const before = JSON.stringify(p);
    await opt.optimize(p);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("runs compaction in the chain when over budget", async () => {
    const opt = createDefaultOptimizer({ keepHead: 1, keepTail: 1 });
    const messages: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: "user",
      content: `message ${i} with padding to add some tokens here`,
    }));
    const p: PromptPayload = { system: "sys", tools: [], messages };
    const result = await opt.optimize(p, { counter, tokenBudget: 10 });
    const compaction = result.perStage.find((s) => s.stage === "conversation-compaction");
    expect(compaction?.saved).toBeGreaterThan(0);
    expect(result.payload.messages.length).toBeLessThan(messages.length);
  });

  it("reports a negative saving honestly when a stage inflates tokens", async () => {
    const inflating = {
      name: "inflate",
      apply: (p: PromptPayload): PromptPayload => ({
        ...p,
        system: `${p.system} extra words added`,
      }),
    };
    const opt = new TokenOptimizer({ counter, stages: [inflating] });
    const result = await opt.optimize({ system: "x", tools: [], messages: [] });
    expect(result.perStage[0]?.saved).toBeLessThan(0);
    expect(result.reductionPct).toBeLessThan(0);
  });

  it("default chain protects immutable system segments end-to-end", async () => {
    const opt = createDefaultOptimizer();
    const compliance = "<!--immutable-->\nNEVER leak keys.  NEVER leak keys.\n<!--/immutable-->";
    const p: PromptPayload = {
      system: `intro\n\nintro\n\n${compliance}`,
      tools: [],
      messages: [{ role: "user", content: "go" }],
    };
    const result = await opt.optimize(p);
    expect(result.payload.system).toContain(compliance);
  });
});
