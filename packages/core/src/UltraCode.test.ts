import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONFIG,
  EventBus,
  NoopLogger,
  ProviderError,
  SessionError,
  ValidationError,
} from "@ultracode/shared";
import type { AgentRunResult } from "@ultracode/shared";
import type { AgentManager } from "./agents/AgentManager.js";
import { createTaskTool } from "./UltraCode.js";
import type {
  ChangeAnalysis,
  ChatMessage,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  ISessionStore,
  QualityReport,
  ReleasePlan,
  SessionMeta,
  SessionRecord,
  ToolDefinition,
  ToolResult,
  UltraCodeConfig,
  VersionSuggestion,
} from "@ultracode/shared";
import { createAgentManager } from "./agents/AgentManager.js";
import type { IToolRunner } from "./execution/types.js";
import { UltraCode } from "./UltraCode.js";
import type { UltraCodeParts, VersioningFacade } from "./UltraCode.js";

/* ----------------------------------------------------------------------------
 * Fakes
 * ------------------------------------------------------------------------- */

type Scripted = CompletionResult | ((req: CompletionRequest) => CompletionResult);

class FakeProvider implements ILLMProvider {
  readonly name = "fake";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly results: Scripted[] = []) {}
  async listModels(): Promise<string[]> {
    return [];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(req);
    const next = this.results.shift();
    if (!next) throw new ProviderError("exhausted", { provider: "fake" });
    return typeof next === "function" ? next(req) : next;
  }
  async *stream(req: CompletionRequest): AsyncIterable<CompletionChunk> {
    this.requests.push(req);
    yield { type: "text", text: "str" };
    yield { type: "text", text: "eam" };
    yield { type: "done", usage: { inputTokens: 1, outputTokens: 1 } };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

const stop = (text: string): CompletionResult => ({
  text,
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  finishReason: "stop",
});

const toolDef = (name: string): ToolDefinition => ({
  name,
  description: name,
  category: "utility",
  parameters: { type: "object" },
  permission: "always",
});

class FakeToolRunner implements IToolRunner {
  readonly executed: string[] = [];
  list(): ToolDefinition[] {
    return [toolDef("read"), toolDef("grep")];
  }
  async execute(name: string): Promise<ToolResult> {
    this.executed.push(name);
    return { ok: true, output: `out:${name}`, durationMs: 1 };
  }
}

class FakeSessionStore implements ISessionStore {
  readonly sessions = new Map<string, SessionRecord>();
  private counter = 0;

  async create(agentName: string, title?: string): Promise<SessionMeta> {
    const id = `sess-${++this.counter}`;
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id,
      title: title ?? "untitled",
      createdAt: now,
      updatedAt: now,
      agentName,
      messageCount: 0,
      messages: [],
    };
    this.sessions.set(id, record);
    const { messages: _messages, ...meta } = record;
    return meta;
  }

  async get(id: string): Promise<SessionRecord | null> {
    const record = this.sessions.get(id);
    return record ? { ...record, messages: [...record.messages] } : null;
  }

  async appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
    const record = this.sessions.get(id);
    if (!record) throw new SessionError(`unknown session ${id}`);
    record.messages.push(...msgs);
    record.messageCount = record.messages.length;
    record.updatedAt = new Date().toISOString();
  }

  async list(limit?: number): Promise<SessionMeta[]> {
    const metas = [...this.sessions.values()].map(({ messages: _m, ...meta }) => meta);
    return limit === undefined ? metas : metas.slice(0, limit);
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async prune(): Promise<number> {
    return 0;
  }
}

const versioningFake = (): VersioningFacade & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    analyze: async (range?: string) => {
      calls.push(`analyze:${range ?? ""}`);
      return {
        files: [],
        commits: [],
        breakingChanges: [],
        categories: {},
        securityFindings: [],
      } as unknown as ChangeAnalysis;
    },
    suggest: async () => {
      calls.push("suggest");
      return {
        currentVersion: "1.0.0",
        suggestedVersion: "1.1.0",
        bump: "minor",
        confidence: 0.9,
        reasons: ["feature commits"],
      } as VersionSuggestion;
    },
    plan: async (version?: string) => {
      calls.push(`plan:${version ?? ""}`);
      return {
        version: version ?? "1.1.0",
        milestones: [],
        risks: [],
        changelogDraft: "",
      } as ReleasePlan;
    },
    quality: async () => {
      calls.push("quality");
      return { passed: true, gates: [], overallScore: 100 } as QualityReport;
    },
  };
};

interface Harness {
  ultra: UltraCode;
  provider: FakeProvider;
  store: FakeSessionStore;
  tools: FakeToolRunner;
  versioning: ReturnType<typeof versioningFake>;
  events: EventBus;
}

function makeHarness(
  scripted: Scripted[],
  mutateConfig?: (c: UltraCodeConfig) => void,
  partsOverride?: Partial<UltraCodeParts>,
): Harness {
  const config = structuredClone(DEFAULT_CONFIG);
  if (mutateConfig) mutateConfig(config);
  const logger = new NoopLogger();
  const events = new EventBus();
  const provider = new FakeProvider(scripted);
  const tools = new FakeToolRunner();
  const store = new FakeSessionStore();
  const versioning = versioningFake();
  const agents = createAgentManager({ config, logger, tools, provider, events });
  const ultra = new UltraCode({
    config,
    logger,
    events,
    sessions: store,
    tools,
    agents,
    versioning,
    ...partsOverride,
  });
  return { ultra, provider, store, tools, versioning, events };
}

/* ----------------------------------------------------------------------------
 * Tests
 * ------------------------------------------------------------------------- */

describe("UltraCode facade", () => {
  it("runs a prompt end to end (tool round + stop) and persists the session", async () => {
    const h = makeHarness([
      {
        text: "",
        toolCalls: [{ id: "c1", name: "read", arguments: { path: "a.txt" } }],
        usage: { inputTokens: 2, outputTokens: 3 },
        finishReason: "tool_calls",
      },
      stop("final answer"),
    ]);

    const result = await h.ultra.run("summarise a.txt");
    expect(result.text).toBe("final answer");
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.turns).toBe(2);
    expect(h.tools.executed).toEqual(["read"]);

    // Session was created and the user/assistant pair persisted.
    const sessions = await h.store.list();
    expect(sessions).toHaveLength(1);
    const record = await h.store.get(sessions[0]!.id);
    expect(record?.messages).toEqual([
      { role: "user", content: "summarise a.txt" },
      { role: "assistant", content: "final answer" },
    ]);
  });

  it("continues an existing session by replaying its history", async () => {
    const h = makeHarness([stop("follow-up answer")]);
    const meta = await h.store.create("default", "earlier");
    await h.store.appendMessages(meta.id, [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);

    await h.ultra.run("second question", { sessionId: meta.id });
    const sent = h.provider.requests[0]?.messages.map((m) => m.content) ?? [];
    expect(sent).toContain("first question");
    expect(sent).toContain("first answer");
    expect(sent[sent.length - 1]).toBe("second question");

    const record = await h.store.get(meta.id);
    expect(record?.messageCount).toBe(4);
  });

  it("throws SessionError for an unknown sessionId", async () => {
    const h = makeHarness([stop("never")]);
    await expect(h.ultra.run("x", { sessionId: "ghost" })).rejects.toBeInstanceOf(SessionError);
    expect(h.provider.requests).toHaveLength(0);
  });

  it("does not create sessions when persistence is disabled", async () => {
    const h = makeHarness([stop("ok")], (c) => {
      c.sessions.enablePersistence = false;
    });
    await h.ultra.run("x");
    expect(await h.store.list()).toHaveLength(0);
  });

  it("rejects with a clear ProviderError when no API key is configured", async () => {
    const ensure = vi.fn(() => {
      throw new ProviderError(
        'No API key configured for provider "mistral". Set the MISTRAL_API_KEY environment variable.',
        { provider: "mistral", retryable: false },
      );
    });
    const h = makeHarness([stop("never")], undefined, { ensureProviderReady: ensure });

    const err = await h.ultra.run("hello").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toContain("API key");
    expect(h.provider.requests).toHaveLength(0);
    expect(ensure).toHaveBeenCalledOnce();
  });

  it("routes to the requested agent (system prompt of that agent is used)", async () => {
    const h = makeHarness([stop("review done")]);
    await h.ultra.run("check this", { agent: "review" });
    const sys = h.provider.requests[0]?.messages[0];
    expect(sys?.role).toBe("system");
    expect(sys?.content).toContain("code-review mode");
  });

  it("forwards streaming chunks via onChunk", async () => {
    const h = makeHarness([]); // stream() path is self-contained in FakeProvider
    const chunks: CompletionChunk[] = [];
    const result = await h.ultra.run("stream it", { onChunk: (c) => chunks.push(c) });
    expect(result.text).toBe("stream");
    expect(chunks.map((c) => c.type)).toEqual(["text", "text", "done"]);
  });

  it("supports aborting a run via signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const h = makeHarness([stop("never")]);
    const err = await h.ultra
      .run("x", { signal: controller.signal })
      .catch((e: unknown) => e);
    expect((err as Error).name).toBe("AbortError");
  });

  it("exposes agents, tools and per-name agent lookup", () => {
    const h = makeHarness([]);
    expect(h.ultra.listAgents().map((a) => a.name)).toContain("security");
    expect(h.ultra.listTools().map((t) => t.name)).toEqual(["read", "grep"]);
    expect(h.ultra.getAgent("plan").definition.name).toBe("plan");
  });

  it("delegates versioning calls to the injected versioning facade", async () => {
    const h = makeHarness([]);
    await h.ultra.versioning.analyze("v1.0.0..HEAD");
    const suggestion = await h.ultra.versioning.suggest();
    await h.ultra.versioning.plan("2.0.0");
    const quality = await h.ultra.versioning.quality();
    expect(suggestion.suggestedVersion).toBe("1.1.0");
    expect(quality.passed).toBe(true);
    expect(h.versioning.calls).toEqual(["analyze:v1.0.0..HEAD", "suggest", "plan:2.0.0", "quality"]);
  });

  it("dispose() runs all disposables, tolerates failures and is idempotent", async () => {
    const order: string[] = [];
    const h = makeHarness([], undefined, {
      disposables: [
        () => {
          order.push("a");
        },
        async () => {
          order.push("b");
          throw new Error("cleanup failed");
        },
        () => {
          order.push("c");
        },
      ],
    });
    h.events.on("error", () => undefined);
    expect(h.events.listenerCount("error")).toBe(1);

    await h.ultra.dispose();
    await h.ultra.dispose();
    expect(order).toEqual(["a", "b", "c"]);
    expect(h.events.listenerCount("error")).toBe(0);
  });

  // RES-002: dispose() must close a session store that exposes close().
  it("dispose() closes the session store when it has a close() method", async () => {
    const close = vi.fn();
    const closableStore = Object.assign(new FakeSessionStore(), { close });
    const h = makeHarness([], undefined, { sessions: closableStore });
    await h.ultra.dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  it("dispose() tolerates a session store without close()", async () => {
    const h = makeHarness([]); // FakeSessionStore has no close()
    await expect(h.ultra.dispose()).resolves.toBeUndefined();
  });

  it("a successful run is not destroyed by a failing appendMessages", async () => {
    const h = makeHarness([stop("kept")]);
    h.store.appendMessages = async () => {
      throw new SessionError("disk full");
    };
    const result = await h.ultra.run("x");
    expect(result.text).toBe("kept");
  });
});

/* ----------------------------------------------------------------------------
 * Q-1: UltraCode.create() integration (deterministic / offline)
 * ------------------------------------------------------------------------- */

describe("UltraCode.create", () => {
  let cwd: string;
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (cwd !== undefined) await fs.rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  function clearKey(name: string): void {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }

  it("wires a fully-functional instance offline and fails to run without an API key", async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "uc-create-"));
    // Ensure no anthropic key is present so ensureProviderReady fails.
    clearKey("ANTHROPIC_API_KEY");
    clearKey("ULTRACODE_ANTHROPIC_API_KEY");

    const ultra = await UltraCode.create({
      cwd,
      logger: new NoopLogger(),
      configOverrides: {
        core: { activeProvider: "anthropic", defaultAgent: "default" },
        sessions: { enablePersistence: false },
      },
    });

    try {
      // Read-only surfaces are wired and work offline.
      expect(ultra.listTools().map((t) => t.name)).toContain("task");
      expect(ultra.listAgents().length).toBeGreaterThan(0);
      expect(ultra.configManager).toBeDefined();
      expect(ultra.sessions).toBeDefined();
      expect(typeof ultra.versioning.quality).toBe("function");

      // run() surfaces a clear ProviderError because no key is configured.
      const err = await ultra.run("hello").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).message).toContain("API key");
    } finally {
      await ultra.dispose();
    }
  });
});

/* ----------------------------------------------------------------------------
 * Q-2: createTaskTool unit tests
 * ------------------------------------------------------------------------- */

describe("createTaskTool", () => {
  function fakeAgents(delegate: AgentManager["delegate"]): AgentManager {
    return { delegate } as unknown as AgentManager;
  }

  const ctx = () => ({ cwd: ".", env: {}, logger: new NoopLogger() });

  it("validate rejects empty agent or prompt with ValidationError", () => {
    const tool = createTaskTool(fakeAgents(async () => ({}) as AgentRunResult));
    expect(() => tool.validate({ agent: "", prompt: "x" })).toThrow(ValidationError);
    expect(() => tool.validate({ agent: "plan", prompt: "" })).toThrow(ValidationError);
    expect(() => tool.validate("not-an-object")).toThrow(ValidationError);
    expect(tool.validate({ agent: "plan", prompt: "do it" })).toEqual({
      agent: "plan",
      prompt: "do it",
    });
  });

  it("execute returns ok:true with the delegate result", async () => {
    const result: AgentRunResult = {
      text: "delegated answer",
      toolCallsExecuted: 2,
      usage: { inputTokens: 5, outputTokens: 7 },
      turns: 3,
    };
    const tool = createTaskTool(fakeAgents(async () => result));
    const out = await tool.execute({ agent: "plan", prompt: "go" }, ctx());
    expect(out.ok).toBe(true);
    expect(out.output).toMatchObject({ agent: "plan", text: "delegated answer", turns: 3 });
  });

  it("execute returns ok:false (never throws) when delegate rejects", async () => {
    const tool = createTaskTool(
      fakeAgents(async () => {
        throw new Error("boom");
      }),
    );
    const out = await tool.execute({ agent: "plan", prompt: "go" }, ctx());
    expect(out.ok).toBe(false);
    expect(out.error?.message).toContain("boom");
  });
});
