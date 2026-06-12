/**
 * Tests for the extraction pipeline (chunking, routing, distillation) and the
 * {@link Semaphore} concurrency primitive.
 */

import { describe, expect, it, vi } from "vitest";

import type { CompletionRequest, CompletionResult, ILLMProvider } from "@ultracode/shared";
import { chunkText, distillPage, estimateTokens, routeModel, sha256, DEFAULT_ROUTING } from "./extract.js";
import { Semaphore, mapWithConcurrency } from "./concurrency.js";

function fakeProvider(onComplete?: (req: CompletionRequest) => void): ILLMProvider {
  return {
    name: "fake",
    listModels: async () => ["cheap", "standard", "premium"],
    healthCheck: async () => true,
    stream: async function* () {
      yield { type: "done", usage: { inputTokens: 0, outputTokens: 0 } } as const;
    },
    complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResult> => {
      onComplete?.(req);
      const user = req.messages.find((m) => m.role === "user")?.content ?? "";
      return {
        text: `summary of ${user.slice(0, 10)}.`,
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 20 },
        finishReason: "stop",
      };
    }),
  } as unknown as ILLMProvider;
}

describe("chunking", () => {
  it("returns no chunks for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("produces overlapping chunks at the requested size", () => {
    const text = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(text, 64, 0.1);
    expect(chunks.length).toBeGreaterThan(1);
    // Monotonic indices, stable hashes.
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.hash).toBe(sha256(c.text));
      expect(c.tokens).toBeGreaterThan(0);
    });
  });

  it("handles a single oversized token without infinite loop", () => {
    const giant = "x".repeat(10_000);
    const chunks = chunkText(giant, 64, 0.1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text).join("").length).toBeGreaterThanOrEqual(10_000 - chunks.length);
  });

  it("estimateTokens never returns 0 for non-empty text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
  });
});

describe("routing", () => {
  it("routes the bulk to the cheap model", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const m = routeModel(i, DEFAULT_ROUTING);
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    expect(counts.get("cheap") ?? 0).toBeGreaterThan(counts.get("standard") ?? 0);
    expect(counts.get("standard") ?? 0).toBeGreaterThanOrEqual(counts.get("premium") ?? 0);
  });

  it("defaults to cheap with empty routing", () => {
    expect(routeModel(0, [])).toBe("cheap");
  });
});

describe("distillPage", () => {
  const text = "Azure Functions run code on demand. Triggers start functions. Bindings connect data.\n" +
    "const x = 1;\naz functionapp create --name foo";

  it("uses the LLM when allowed and accounts token usage", async () => {
    const provider = fakeProvider();
    const { material, usage } = await distillPage(text, {
      catalog: "azure",
      topic: "functions",
      sources: ["https://e.com/fn"],
      provider,
      llmAllowed: true,
    });
    expect(usage.calls).toBeGreaterThan(0);
    expect(usage.tokensIn).toBeGreaterThan(0);
    expect(material.catalog).toBe("azure");
    expect(material.summary.length).toBeGreaterThan(0);
    expect(material.sources).toEqual(["https://e.com/fn"]);
  });

  it("is fully deterministic with no LLM calls when provider is absent", async () => {
    const { material, usage } = await distillPage(text, {
      catalog: "azure",
      topic: "functions",
      sources: ["s"],
    });
    expect(usage.calls).toBe(0);
    expect(usage.tokensIn).toBe(0);
    expect(material.facts.length).toBeGreaterThan(0);
    expect(material.codeSnippets.some((s) => s.includes("az functionapp"))).toBe(true);
  });

  it("does not call the LLM when llmAllowed is false", async () => {
    const provider = fakeProvider();
    const { usage } = await distillPage(text, {
      catalog: "c",
      topic: "t",
      sources: ["s"],
      provider,
      llmAllowed: false,
    });
    expect(usage.calls).toBe(0);
    expect((provider.complete as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("serves repeated chunks from the shared cache", async () => {
    const provider = fakeProvider();
    const cache = new Map<string, string>();
    const repeated = "Same sentence here. ".repeat(50);
    await distillPage(repeated, { catalog: "c", topic: "t", sources: ["s"], provider, llmAllowed: true, cache });
    const callsAfterFirst = (provider.complete as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = await distillPage(repeated, { catalog: "c", topic: "t", sources: ["s"], provider, llmAllowed: true, cache });
    // No new model calls on the identical second page.
    expect((provider.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
    expect(second.usage.cacheHits).toBeGreaterThan(0);
  });

  it("aborts mid-distillation when the signal fires", async () => {
    const controller = new AbortController();
    const provider = fakeProvider(() => controller.abort());
    const long = "Sentence number. ".repeat(2000);
    await expect(
      distillPage(long, { catalog: "c", topic: "t", sources: ["s"], provider, llmAllowed: true, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Semaphore", () => {
  it("bounds concurrency to the limit", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 10 }, task));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("clamps invalid limits to 1 and releases on throw", async () => {
    const sem = new Semaphore(0);
    await expect(sem.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // Still usable afterwards (permit released).
    await expect(sem.run(async () => 42)).resolves.toBe(42);
  });

  it("mapWithConcurrency preserves input order", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });
});
