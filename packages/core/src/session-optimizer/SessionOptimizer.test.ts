import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  ILLMProvider,
  ISessionStore,
  Logger,
  SessionMeta,
  SessionRecord,
} from "@ultracode/shared";
import { NoopLogger } from "@ultracode/shared";
import { HeuristicTokenCounter } from "../tokens/TokenCounter.js";
import type { IBudgetGate } from "../budget/types.js";
import { createSessionOptimizer } from "./SessionOptimizer.js";
import { dedupMessages, extractiveSummary, mergeSummary } from "./SessionOptimizer.js";

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "uc-sopt-"));
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/** Minimal in-memory session store sufficient for the optimizer (read path). */
class FakeStore implements ISessionStore {
  private rec: SessionRecord | null;
  constructor(record: SessionRecord | null) {
    this.rec = record;
  }
  async get(id: string): Promise<SessionRecord | null> {
    return this.rec && this.rec.id === id ? this.rec : null;
  }
  async create(): Promise<SessionMeta> {
    throw new Error("not used");
  }
  async appendMessages(): Promise<void> {}
  async list(): Promise<SessionMeta[]> {
    return [];
  }
  async delete(): Promise<boolean> {
    return false;
  }
  async prune(): Promise<number> {
    return 0;
  }
}

function rec(messages: ChatMessage[], id = "s1"): SessionRecord {
  return {
    id,
    title: "t",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    agentName: "default",
    messageCount: messages.length,
    messages,
  };
}

function turns(n: number, prefix = "msg"): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: "You are a helpful agent." }];
  for (let i = 0; i < n; i++) {
    out.push({ role: "user", content: `${prefix} user ${i} touches file_${i}.ts` });
    out.push({ role: "assistant", content: `${prefix} assistant ${i} decided to use approach_${i}` });
  }
  return out;
}

const baseOpts = (store: ISessionStore, extra: Record<string, unknown> = {}) => ({
  sessionStore: store,
  counter: new HeuristicTokenCounter(),
  logger: new NoopLogger() as Logger,
  now: () => Date.parse("2026-06-12T12:00:00.000Z"),
  homeDir: home,
  ...extra,
});

describe("processIncremental — guards", () => {
  it("no-op (saved 0) below minMessages", async () => {
    const store = new FakeStore(rec(turns(2)));
    const opt = createSessionOptimizer(baseOpts(store));
    const r = await opt.processIncremental("s1");
    expect(r.savedTokens).toBe(0);
    expect(r.summarizedTurns).toBe(0);
    expect(r.durableSummaryUpdated).toBe(false);
  });

  it("missing session → zero result, never throws", async () => {
    const store = new FakeStore(null);
    const opt = createSessionOptimizer(baseOpts(store));
    const r = await opt.processIncremental("nope");
    expect(r).toMatchObject({ sessionId: "nope", savedTokens: 0 });
  });

  it("handles a 0- and 1-message session", async () => {
    const opt0 = createSessionOptimizer(baseOpts(new FakeStore(rec([]))));
    expect((await opt0.processIncremental("s1")).savedTokens).toBe(0);
    const opt1 = createSessionOptimizer(
      baseOpts(new FakeStore(rec([{ role: "user", content: "hi" }]))),
    );
    expect((await opt1.processIncremental("s1")).savedTokens).toBe(0);
  });
});

describe("processIncremental — rolling summary + idempotency", () => {
  it("summarises aged-out turns and saves tokens", async () => {
    const store = new FakeStore(rec(turns(10), "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 4 } }));
    const r = await opt.processIncremental("s1");
    expect(r.summarizedTurns).toBeGreaterThan(0);
    expect(r.durableSummaryUpdated).toBe(true);
    expect(r.savedTokens).toBeGreaterThanOrEqual(0);
    // sidecar persisted
    const sidecar = path.join(home, ".ultracode", "sessions-opt", "s1.json");
    const raw = JSON.parse(await fs.readFile(sidecar, "utf8"));
    expect(raw.summarizedUpToIndex).toBeGreaterThan(0);
    expect(raw.durableSummary.length).toBeGreaterThan(0);
  });

  it("is idempotent: a second pass with no new messages changes nothing", async () => {
    const store = new FakeStore(rec(turns(10), "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 4 } }));
    const first = await opt.processIncremental("s1");
    const sidecar = path.join(home, ".ultracode", "sessions-opt", "s1.json");
    const after1 = await fs.readFile(sidecar, "utf8");
    const second = await opt.processIncremental("s1");
    const after2 = await fs.readFile(sidecar, "utf8");
    expect(second.summarizedTurns).toBe(0);
    expect(second.durableSummaryUpdated).toBe(false);
    // durable summary text identical across the two passes
    expect(JSON.parse(after2).durableSummary).toBe(JSON.parse(after1).durableSummary);
    expect(first.beforeTokens).toBe(second.beforeTokens);
  });

  it("only summarises NEW turns on a later pass (no re-summarising old turns)", async () => {
    // First pass over a 10-turn session.
    const small = rec(turns(10), "s1");
    const store = new FakeStore(small);
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 4 } }));
    await opt.processIncremental("s1");
    const sidecar = path.join(home, ".ultracode", "sessions-opt", "s1.json");
    const idx1 = JSON.parse(await fs.readFile(sidecar, "utf8")).summarizedUpToIndex;

    // Grow the session and run again; new aged-out turns only.
    const grown = rec(turns(16), "s1");
    const opt2 = createSessionOptimizer(
      baseOpts(new FakeStore(grown), { thresholds: { recentKeep: 4 } }),
    );
    const r2 = await opt2.processIncremental("s1");
    const idx2 = JSON.parse(await fs.readFile(sidecar, "utf8")).summarizedUpToIndex;
    expect(idx2).toBeGreaterThan(idx1);
    expect(r2.summarizedTurns).toBeGreaterThan(0);
    // exactly the count of newly aged-out turns (idx2 - idx1)
    expect(r2.summarizedTurns).toBe(idx2 - idx1);
  });

  it("preserves pinned facts across passes", async () => {
    const store = new FakeStore(rec(turns(12), "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 4 } }));
    await opt.processIncremental("s1");
    const sidecar = path.join(home, ".ultracode", "sessions-opt", "s1.json");
    const facts = JSON.parse(await fs.readFile(sidecar, "utf8")).pinnedFacts as string[];
    expect(facts.some((f) => /file_0\.ts/.test(f))).toBe(true);
    expect(facts.some((f) => /decided to use approach_0/i.test(f))).toBe(true);
  });
});

describe("buildWorkingSet", () => {
  it("keeps the system header + recent window + summary/pins", async () => {
    const store = new FakeStore(rec(turns(10), "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 4 } }));
    const ws = opt.buildWorkingSet(rec(turns(10), "s1"));
    expect(ws.messages[0]?.role).toBe("system");
    expect(ws.messages.length).toBeLessThan(turns(10).length);
    expect(ws.durableSummary.length).toBeGreaterThan(0);
    expect(ws.pinnedFacts.length).toBeGreaterThan(0);
  });

  it("does not split a tool-call / tool-result pair at the window boundary", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u0" },
      { role: "assistant", content: "a0" },
      { role: "user", content: "u1" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "read", arguments: {} }],
      },
      { role: "tool", content: "result", toolCallId: "c1" },
    ];
    const store = new FakeStore(rec(msgs, "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 1 } }));
    const ws = opt.buildWorkingSet(rec(msgs, "s1"));
    // The last message is a tool result; its assistant tool-call must be present.
    const hasToolResult = ws.messages.some((m) => m.role === "tool");
    const hasToolCall = ws.messages.some((m) => (m.toolCalls?.length ?? 0) > 0);
    expect(hasToolResult).toBe(true);
    expect(hasToolCall).toBe(true);
  });

  it("token saving is consistent with the counter (after <= before) on a compactable session", async () => {
    const counter = new HeuristicTokenCounter();
    // Long, verbose assistant turns that compact down to a short summary.
    const messages: ChatMessage[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `step ${i}` });
      messages.push({
        role: "assistant",
        content: `Detailed explanation number ${i}. ` + "filler ".repeat(80),
      });
    }
    const store = new FakeStore(rec(messages, "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { counter, thresholds: { recentKeep: 4 } }));
    const r = await opt.processIncremental("s1");
    expect(r.afterTokens).toBeLessThanOrEqual(r.beforeTokens);
    expect(r.savedTokens).toBe(Math.max(0, r.beforeTokens - r.afterTokens));
    expect(r.savedTokens).toBeGreaterThan(0);
    expect(r.beforeTokens).toBe(counter.countMessages(messages));
  });
});

describe("dedup", () => {
  it("collapses repeated identical tool outputs to a back-reference", () => {
    const dup = "X".repeat(120);
    const msgs: ChatMessage[] = [
      { role: "user", content: "go" },
      { role: "tool", content: dup, toolCallId: "a" },
      { role: "user", content: "again" },
      { role: "tool", content: dup, toolCallId: "b" },
    ];
    const out = dedupMessages(msgs);
    expect(out[1]?.content).toBe(dup); // first kept
    expect(out[3]?.content).toMatch(/duplicate of an earlier/);
  });

  it("never collapses user turns or short content", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "same" },
      { role: "user", content: "same" },
      { role: "tool", content: "short", toolCallId: "a" },
      { role: "tool", content: "short", toolCallId: "b" },
    ];
    const out = dedupMessages(msgs);
    expect(out.every((m) => !/duplicate of an earlier/.test(m.content))).toBe(true);
  });
});

describe("mergeSummary / extractiveSummary purity", () => {
  it("mergeSummary caps to maxChars and is idempotent on identical trailing chunk", () => {
    const merged = mergeSummary("old summary", "new bit", 100);
    expect(merged).toContain("new bit");
    expect(mergeSummary(merged, "new bit", 100)).toBe(merged); // idempotent
    const capped = mergeSummary("a".repeat(90), "b".repeat(90), 100);
    expect(capped.length).toBeLessThanOrEqual(100);
  });

  it("extractiveSummary is empty for empty input and notes tool calls", () => {
    expect(extractiveSummary([], 100)).toBe("");
    const s = extractiveSummary(
      [{ role: "assistant", content: "", toolCalls: [{ id: "1", name: "grep", arguments: {} }] }],
      100,
    );
    expect(s).toMatch(/called: grep/);
  });
});

describe("LLM summarisation gating", () => {
  function fakeProvider(text: string): ILLMProvider {
    return {
      name: "anthropic",
      listModels: async () => ["claude-3-5-haiku-latest"],
      complete: vi.fn(async () => ({
        text,
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop" as const,
      })),
      stream: async function* () {
        yield { type: "done" as const, usage: { inputTokens: 0, outputTokens: 0 } };
      },
      healthCheck: async () => true,
    };
  }

  function gate(allowed: boolean): IBudgetGate {
    return {
      estimate: () => ({
        tokensIn: 10,
        tokensOut: 10,
        byModel: [],
        usdLow: 0,
        usdHigh: 0.01,
        eur: 0,
        fxRate: 0.9,
        assumptions: [],
      }),
      check: () => ({
        allowed,
        requiresApproval: false,
        remainingUsd: 1,
        capUsd: null,
        reason: allowed ? "ok" : "cap exceeded",
      }),
      record: vi.fn(async () => {}),
      formatReport: () => "report",
    };
  }

  it("uses the LLM summary when enabled and budget allows", async () => {
    const provider = fakeProvider("LLM-CRAFTED SUMMARY");
    const store = new FakeStore(rec(turns(12), "s1"));
    const opt = createSessionOptimizer(
      baseOpts(store, {
        provider,
        budget: gate(true),
        thresholds: { recentKeep: 4, enableLlmSummary: true },
      }),
    );
    await opt.processIncremental("s1");
    const sidecar = path.join(home, ".ultracode", "sessions-opt", "s1.json");
    const summary = JSON.parse(await fs.readFile(sidecar, "utf8")).durableSummary;
    expect(summary).toContain("LLM-CRAFTED SUMMARY");
    expect((provider.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("falls back to extractive when the budget refuses", async () => {
    const provider = fakeProvider("SHOULD NOT BE USED");
    const store = new FakeStore(rec(turns(12), "s1"));
    const opt = createSessionOptimizer(
      baseOpts(store, {
        provider,
        budget: gate(false),
        thresholds: { recentKeep: 4, enableLlmSummary: true },
      }),
    );
    await opt.processIncremental("s1");
    const sidecar = path.join(home, ".ultracode", "sessions-opt", "s1.json");
    const summary = JSON.parse(await fs.readFile(sidecar, "utf8")).durableSummary;
    expect(summary).not.toContain("SHOULD NOT BE USED");
    expect((provider.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("falls back to extractive when the provider throws", async () => {
    const provider: ILLMProvider = {
      name: "anthropic",
      listModels: async () => [],
      complete: vi.fn(async () => {
        throw new Error("network down");
      }),
      stream: async function* () {},
      healthCheck: async () => true,
    };
    const store = new FakeStore(rec(turns(12), "s1"));
    const opt = createSessionOptimizer(
      baseOpts(store, {
        provider,
        budget: gate(true),
        thresholds: { recentKeep: 4, enableLlmSummary: true },
      }),
    );
    const r = await opt.processIncremental("s1");
    expect(r.durableSummaryUpdated).toBe(true); // extractive still produced a summary
  });
});

describe("extreme inputs", () => {
  it("handles a huge session and unicode without throwing", async () => {
    const big: ChatMessage[] = [{ role: "system", content: "sys 日本語 ✅" }];
    for (let i = 0; i < 400; i++) {
      big.push({ role: "user", content: `café_${i}.md decided to use Ω_${i}` });
      big.push({ role: "assistant", content: "x".repeat(500) });
    }
    const store = new FakeStore(rec(big, "s1"));
    const opt = createSessionOptimizer(baseOpts(store, { thresholds: { recentKeep: 6 } }));
    const r = await opt.processIncremental("s1");
    expect(Number.isFinite(r.savedTokens)).toBe(true);
    expect(r.savedTokens).toBeGreaterThanOrEqual(0);
  });
});
