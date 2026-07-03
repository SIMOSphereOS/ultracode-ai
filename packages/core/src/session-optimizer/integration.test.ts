/**
 * Integration: the {@link UltraCode} facade wires the {@link SessionOptimizer}
 * so that (a) continuing a session replays a compacted working set and (b) a
 * background compaction pass runs after a successful turn without ever breaking
 * the run.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  ISessionStore,
  SessionMeta,
  SessionRecord,
  UltraCodeConfig,
} from "ultracode-shared";
import { DEFAULT_CONFIG, EventBus, NoopLogger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentManager } from "../agents/AgentManager.js";
import type { UltraCodeParts, VersioningFacade } from "../UltraCode.js";
import { UltraCode } from "../UltraCode.js";
import { createSessionOptimizer } from "./SessionOptimizer.js";

let home: string;
beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "uc-sopt-int-"));
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

class StubProvider implements ILLMProvider {
  readonly name = "anthropic";
  public lastRequest?: CompletionRequest;
  async listModels(): Promise<string[]> {
    return ["m"];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.lastRequest = req;
    return {
      text: "ok",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    };
  }
  async *stream() {
    yield { type: "done" as const, usage: { inputTokens: 0, outputTokens: 0 } };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

class MapStore implements ISessionStore {
  readonly sessions = new Map<string, SessionRecord>();
  async create(agentName: string, title?: string): Promise<SessionMeta> {
    const id = `sess-1`;
    const now = new Date().toISOString();
    const r: SessionRecord = {
      id,
      title: title ?? "t",
      createdAt: now,
      updatedAt: now,
      agentName,
      messageCount: 0,
      messages: [],
    };
    this.sessions.set(id, r);
    const { messages: _m, ...meta } = r;
    return meta;
  }
  async get(id: string): Promise<SessionRecord | null> {
    const r = this.sessions.get(id);
    return r ? { ...r, messages: [...r.messages] } : null;
  }
  async appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
    const r = this.sessions.get(id);
    if (!r) return;
    r.messages.push(...msgs);
    r.messageCount = r.messages.length;
  }
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

/**
 * In-memory store supporting multiple sessions with working `list`/`delete`/
 * `prune`, used to exercise the facade's prune set-difference and delete paths.
 * `list()` returns most-recent-first (insertion order reversed), matching the
 * {@link ISessionStore} contract `prune` relies on.
 */
class MultiStore implements ISessionStore {
  readonly sessions = new Map<string, SessionRecord>();
  /** Seed an empty session under a caller-chosen id (insertion order = age). */
  seed(id: string): void {
    const now = new Date().toISOString();
    this.sessions.set(id, {
      id,
      title: "t",
      createdAt: now,
      updatedAt: now,
      agentName: "default",
      messageCount: 0,
      messages: [],
    });
  }
  async create(agentName: string, title?: string): Promise<SessionMeta> {
    const id = `sess-${this.sessions.size + 1}`;
    this.seed(id);
    const r = this.sessions.get(id)!;
    r.agentName = agentName;
    if (title !== undefined) r.title = title;
    const { messages: _m, ...meta } = r;
    return meta;
  }
  async get(id: string): Promise<SessionRecord | null> {
    const r = this.sessions.get(id);
    return r ? { ...r, messages: [...r.messages] } : null;
  }
  async appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
    const r = this.sessions.get(id);
    if (!r) return;
    r.messages.push(...msgs);
    r.messageCount = r.messages.length;
  }
  async list(limit?: number): Promise<SessionMeta[]> {
    // Most-recent-first: reverse insertion order.
    const metas = [...this.sessions.values()].reverse().map(({ messages: _m, ...meta }) => meta);
    return limit === undefined ? metas : metas.slice(0, limit);
  }
  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }
  async prune(maxSessions: number): Promise<number> {
    // Keep the `maxSessions` most-recent; delete the rest (the older tail).
    const keep = new Set((await this.list(maxSessions)).map((m) => m.id));
    let removed = 0;
    for (const id of [...this.sessions.keys()]) {
      if (!keep.has(id)) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

const versioningStub: VersioningFacade = {
  analyze: async () => ({}) as never,
  suggest: async () => ({}) as never,
  plan: async () => ({}) as never,
  quality: async () => ({}) as never,
};

function build(
  store: ISessionStore,
  provider: ILLMProvider,
  optimizer: UltraCodeParts["sessionOptimizer"],
  mutate?: (c: UltraCodeConfig) => void,
): UltraCode {
  const config = structuredClone(DEFAULT_CONFIG);
  if (mutate) mutate(config);
  const logger = new NoopLogger();
  const events = new EventBus();
  const tools = {
    execute: async () => ({ ok: true, output: null, durationMs: 0 }),
    list: () => [],
  };
  const agents = createAgentManager({ config, logger, tools, provider, events });
  const parts: UltraCodeParts = {
    config,
    logger,
    events,
    sessions: store,
    tools,
    agents,
    versioning: versioningStub,
    budget: {} as never,
    authoring: {} as never,
    learning: {} as never,
  };
  if (optimizer) parts.sessionOptimizer = optimizer;
  return new UltraCode(parts);
}

describe("UltraCode + SessionOptimizer integration", () => {
  it("replays a compacted working set when continuing a long session", async () => {
    const store = new MapStore();
    const provider = new StubProvider();
    const optimizer = createSessionOptimizer({
      sessionStore: store,
      logger: new NoopLogger(),
      homeDir: home,
      thresholds: { recentKeep: 4 },
    });

    // Seed a long session.
    await store.create("default", "t");
    const long: ChatMessage[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 12; i++) {
      long.push({ role: "user", content: `decided to use plan_${i} in file_${i}.ts` });
      long.push({ role: "assistant", content: `done ${i}` });
    }
    await store.appendMessages("sess-1", long);

    const ultra = build(store, provider, optimizer);
    await ultra.run("next prompt", { sessionId: "sess-1" });

    // The history replayed to the provider is compacted: a leading "Compacted
    // session context" system message replaces the full transcript.
    const history = provider.lastRequest?.messages ?? [];
    const joined = history.map((m) => m.content).join("\n");
    expect(joined).toContain("Compacted session context");
    expect(joined).toContain("Pinned facts");
    // Far fewer messages than the 25 raw + new prompt.
    expect(history.length).toBeLessThan(long.length);
  });

  it("replays a prior persisted durable summary from the sidecar when continuing a session", async () => {
    const store = new MapStore();
    const provider = new StubProvider();
    const optimizer = createSessionOptimizer({
      sessionStore: store,
      logger: new NoopLogger(),
      homeDir: home,
      thresholds: { recentKeep: 4 },
    });

    // Seed a session plus a sidecar carrying a durable summary produced by an
    // earlier incremental pass (e.g. a cheap-model summary). Replaying must
    // surface this persisted summary — it is NOT re-derivable from the raw
    // history alone, so it proves the persisted path (not the sync one) ran.
    await store.create("default", "t");
    const msgs: ChatMessage[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 12; i++) {
      msgs.push({ role: "user", content: `turn ${i}` });
      msgs.push({ role: "assistant", content: `ack ${i}` });
    }
    await store.appendMessages("sess-1", msgs);

    const sidecarDir = path.join(home, ".ultracode", "sessions-opt");
    await fs.mkdir(sidecarDir, { recursive: true });
    const PERSISTED = "PERSISTED-SUMMARY-MARKER: earlier turns chose plan A.";
    await fs.writeFile(
      path.join(sidecarDir, "sess-1.json"),
      JSON.stringify({
        version: 1,
        sessionId: "sess-1",
        summarizedUpToIndex: 8,
        durableSummary: PERSISTED,
        pinnedFacts: ["decision: use plan A"],
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const ultra = build(store, provider, optimizer);
    await ultra.run("continue", { sessionId: "sess-1" });

    const history = provider.lastRequest?.messages ?? [];
    const joined = history.map((m) => m.content).join("\n");
    expect(joined).toContain("Compacted session context");
    expect(joined).toContain(PERSISTED);
    expect(joined).toContain("decision: use plan A");
  });

  it("starts a background compaction pass after a successful turn (fire-and-forget)", async () => {
    const store = new MapStore();
    const provider = new StubProvider();
    const optimizer = createSessionOptimizer({
      sessionStore: store,
      logger: new NoopLogger(),
      homeDir: home,
      thresholds: { recentKeep: 2, minMessages: 2 },
    });
    const spy = vi.spyOn(optimizer, "processIncremental");

    const ultra = build(store, provider, optimizer, (c) => {
      c.sessions.enablePersistence = true;
    });
    await ultra.run("hello");
    // Allow the fire-and-forget microtask to run.
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a throwing background optimizer never breaks the run", async () => {
    const store = new MapStore();
    const provider = new StubProvider();
    const optimizer = {
      buildWorkingSet: () => {
        throw new Error("boom");
      },
      buildWorkingSetPersisted: async () => {
        throw new Error("boom");
      },
      processIncremental: vi.fn(async () => {
        throw new Error("background boom");
      }),
      forget: vi.fn(async () => {}),
    };

    const ultra = build(store, provider, optimizer, (c) => {
      c.sessions.enablePersistence = true;
    });
    // buildWorkingSet only runs on a continued session; here a fresh run still
    // triggers the background pass which rejects — the run must still succeed.
    const result = await ultra.run("hello");
    expect(result.text).toBe("ok");
    await new Promise((r) => setTimeout(r, 10));
    expect(optimizer.processIncremental).toHaveBeenCalled();
  });

  it("falls back to raw history when buildWorkingSetPersisted throws on a continued session", async () => {
    const store = new MapStore();
    const provider = new StubProvider();
    await store.create("default", "t");
    await store.appendMessages("sess-1", [
      { role: "system", content: "sys" },
      { role: "user", content: "earlier" },
      { role: "assistant", content: "reply" },
    ]);
    const optimizer = {
      buildWorkingSet: () => {
        throw new Error("ws boom");
      },
      buildWorkingSetPersisted: async () => {
        throw new Error("ws boom");
      },
      processIncremental: vi.fn(async () => ({
        sessionId: "sess-1",
        beforeTokens: 0,
        afterTokens: 0,
        savedTokens: 0,
        summarizedTurns: 0,
        durableSummaryUpdated: false,
      })),
      forget: vi.fn(async () => {}),
    };
    const ultra = build(store, provider, optimizer);
    const result = await ultra.run("again", { sessionId: "sess-1" });
    expect(result.text).toBe("ok");
    // Raw history was replayed (contains the earlier user turn).
    const joined = (provider.lastRequest?.messages ?? []).map((m) => m.content).join("\n");
    expect(joined).toContain("earlier");
  });

  it("forgets EXACTLY the pruned sessions' sidecars while retained ones survive", async () => {
    // Multi-session store with working list/delete/prune so the facade's
    // before/after set-difference picks real ids. `list()` is most-recent-first.
    const store = new MultiStore();
    const provider = new StubProvider();
    const optimizer = createSessionOptimizer({
      sessionStore: store,
      logger: new NoopLogger(),
      homeDir: home,
      thresholds: { recentKeep: 2, minMessages: 2 },
    });

    // Seed N sessions, each with a persisted optimizer sidecar (written via a
    // real incremental compaction pass against enough turns to summarise).
    const ids = ["sess-a", "sess-b", "sess-c", "sess-d"];
    for (const id of ids) {
      store.seed(id);
      const msgs: ChatMessage[] = [{ role: "system", content: "sys" }];
      for (let i = 0; i < 8; i++) {
        msgs.push({ role: "user", content: `${id} decided plan_${i} in file_${i}.ts` });
        msgs.push({ role: "assistant", content: `${id} done ${i}` });
      }
      await store.appendMessages(id, msgs);
      await optimizer.processIncremental(id);
    }

    const sidecar = (id: string): string =>
      path.join(home, ".ultracode", "sessions-opt", `${id}.json`);
    // Pre-condition: every seeded session has a persisted sidecar on disk.
    for (const id of ids) {
      await expect(fs.access(sidecar(id))).resolves.toBeUndefined();
    }

    const ultra = build(store, provider, optimizer);
    // Keep the 2 most-recent (sess-d, sess-c); prune sess-b and sess-a.
    const removed = await ultra.pruneSessions(2);
    expect(removed).toBe(2);

    // EXACTLY the pruned sessions' sidecars are gone…
    await expect(fs.access(sidecar("sess-a"))).rejects.toThrow();
    await expect(fs.access(sidecar("sess-b"))).rejects.toThrow();
    // …and the retained sessions' sidecars survive untouched.
    await expect(fs.access(sidecar("sess-c"))).resolves.toBeUndefined();
    await expect(fs.access(sidecar("sess-d"))).resolves.toBeUndefined();
  });

  it("deleteSession removes the session's sidecar and reports prior existence", async () => {
    const store = new MultiStore();
    const provider = new StubProvider();
    const optimizer = createSessionOptimizer({
      sessionStore: store,
      logger: new NoopLogger(),
      homeDir: home,
      thresholds: { recentKeep: 2, minMessages: 2 },
    });

    store.seed("sess-x");
    const msgs: ChatMessage[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 8; i++) {
      msgs.push({ role: "user", content: `sess-x decided plan_${i} in file_${i}.ts` });
      msgs.push({ role: "assistant", content: `sess-x done ${i}` });
    }
    await store.appendMessages("sess-x", msgs);
    await optimizer.processIncremental("sess-x");

    const sidecar = path.join(home, ".ultracode", "sessions-opt", "sess-x.json");
    await expect(fs.access(sidecar)).resolves.toBeUndefined();

    const ultra = build(store, provider, optimizer);

    // Deleting an existing session returns true and removes its sidecar.
    await expect(ultra.deleteSession("sess-x")).resolves.toBe(true);
    await expect(fs.access(sidecar)).rejects.toThrow();

    // Deleting an unknown session returns false; sidecar cleanup is still a no-op.
    await expect(ultra.deleteSession("sess-missing")).resolves.toBe(false);
  });

  it("enableSessionOptimization:false disables both paths", async () => {
    const store = new MapStore();
    const provider = new StubProvider();
    const optimizer = {
      buildWorkingSet: vi.fn(() => ({ messages: [], durableSummary: "", pinnedFacts: [] })),
      buildWorkingSetPersisted: vi.fn(async () => ({
        messages: [],
        durableSummary: "",
        pinnedFacts: [],
      })),
      processIncremental: vi.fn(async () => ({
        sessionId: "s",
        beforeTokens: 0,
        afterTokens: 0,
        savedTokens: 0,
        summarizedTurns: 0,
        durableSummaryUpdated: false,
      })),
      forget: vi.fn(async () => {}),
    };
    const config = structuredClone(DEFAULT_CONFIG);
    config.sessions.enablePersistence = true;
    const events = new EventBus();
    const tools = {
      execute: async () => ({ ok: true, output: null, durationMs: 0 }),
      list: () => [],
    };
    const agents = createAgentManager({
      config,
      logger: new NoopLogger(),
      tools,
      provider,
      events,
    });
    const ultra = new UltraCode({
      config,
      logger: new NoopLogger(),
      events,
      sessions: store,
      tools,
      agents,
      versioning: versioningStub,
      budget: {} as never,
      authoring: {} as never,
      learning: {} as never,
      sessionOptimizer: optimizer,
      enableSessionOptimization: false,
    });
    await ultra.run("hello");
    await new Promise((r) => setTimeout(r, 10));
    expect(optimizer.buildWorkingSet).not.toHaveBeenCalled();
    expect(optimizer.buildWorkingSetPersisted).not.toHaveBeenCalled();
    expect(optimizer.processIncremental).not.toHaveBeenCalled();
  });
});
