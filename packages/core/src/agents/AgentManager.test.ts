import { describe, expect, it } from "vitest";
import { AgentError, DEFAULT_CONFIG, EventBus, NoopLogger, ProviderError } from "@ultracode/shared";
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  ToolDefinition,
  ToolResult,
  UltraCodeConfig,
  UltraCodeEvent,
} from "@ultracode/shared";
import type { IToolRunner } from "../execution/types.js";
import { AgentManager, createAgentManager, MAX_DELEGATION_DEPTH } from "./AgentManager.js";
import { BUILT_IN_AGENTS } from "./builtins.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const stop = (text: string): CompletionResult => ({
  text,
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  finishReason: "stop",
});

/** Provider answering every completion with "stop" after an optional delay. */
class EchoProvider implements ILLMProvider {
  readonly requests: CompletionRequest[] = [];
  active = 0;
  maxActive = 0;
  constructor(
    readonly name: string = "fake",
    private readonly delayMs = 0,
  ) {}
  async listModels(): Promise<string[]> {
    return [];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(req);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.delayMs > 0) await sleep(this.delayMs);
      return stop(`echo:${req.model}`);
    } finally {
      this.active--;
    }
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<CompletionChunk> {
    throw new ProviderError("not scripted", { provider: this.name });
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

const toolDef = (name: string): ToolDefinition => ({
  name,
  description: name,
  category: "utility",
  parameters: { type: "object" },
  permission: "always",
});

class StubRunner implements IToolRunner {
  list(): ToolDefinition[] {
    return [toolDef("read"), toolDef("grep")];
  }
  async execute(): Promise<ToolResult> {
    return { ok: true, output: "x", durationMs: 1 };
  }
}

function makeConfig(mutate?: (c: UltraCodeConfig) => void): UltraCodeConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  if (mutate) mutate(config);
  return config;
}

function makeManager(
  config = makeConfig(),
  extra: Partial<ConstructorParameters<typeof AgentManager>[0]> = {},
): { manager: AgentManager; provider: EchoProvider } {
  const provider = new EchoProvider();
  const manager = createAgentManager({
    config,
    logger: new NoopLogger(),
    tools: new StubRunner(),
    provider,
    ...extra,
  });
  return { manager, provider };
}

describe("AgentManager registry", () => {
  it("registers all built-in agents", () => {
    const { manager } = makeManager();
    expect(manager.list().map((d) => d.name).sort()).toEqual(
      [...BUILT_IN_AGENTS.map((d) => d.name)].sort(),
    );
  });

  it("creates agents lazily and caches instances", () => {
    const { manager } = makeManager();
    const a = manager.get("plan");
    expect(manager.get("plan")).toBe(a);
  });

  it("throws AgentError for unknown agents", () => {
    const { manager } = makeManager();
    expect(() => manager.get("nope")).toThrowError(AgentError);
    expect(() => manager.setActive("nope")).toThrowError(AgentError);
  });

  it("register() replaces definitions and invalidates the cache", () => {
    const { manager } = makeManager();
    const before = manager.get("default");
    manager.register({ name: "default", description: "patched", type: "custom" });
    expect(manager.get("default")).not.toBe(before);
    expect(manager.list().find((d) => d.name === "default")?.description).toBe("patched");
  });

  it("rejects definitions without a name", () => {
    const { manager } = makeManager();
    expect(() => manager.register({ name: "  ", description: "x", type: "custom" })).toThrowError(
      AgentError,
    );
  });

  it("creates custom definitions for config-only agents", () => {
    const config = makeConfig((c) => {
      c.agents.agents["mybot"] = { disabledTools: ["grep"] };
    });
    const { manager } = makeManager(config);
    const def = manager.list().find((d) => d.name === "mybot");
    expect(def?.type).toBe("custom");
    expect(manager.get("mybot").listTools().map((t) => t.name)).toEqual(["read"]);
  });
});

describe("AgentManager config overrides", () => {
  it("merges model/disabledTools overrides into built-in agents", async () => {
    const config = makeConfig((c) => {
      c.agents.agents["review"] = { activeModel: "special-model", disabledTools: ["grep"] };
    });
    const { manager, provider } = makeManager(config);
    const review = manager.get("review");
    expect(review.listTools().map((t) => t.name)).toEqual(["read"]);
    const result = await review.run({ prompt: "review this" });
    expect(result.text).toBe("echo:special-model");
    expect(provider.requests[0]?.model).toBe("special-model");
  });

  it("uses resolveProvider for per-agent provider overrides", async () => {
    const other = new EchoProvider("anthropic");
    const config = makeConfig((c) => {
      c.agents.agents["plan"] = { activeProvider: "anthropic" };
    });
    const resolved: string[] = [];
    const { manager, provider } = makeManager(config, {
      resolveProvider: (name) => {
        resolved.push(String(name));
        return other;
      },
    });
    await manager.get("plan").run({ prompt: "p" });
    expect(resolved).toEqual(["anthropic"]);
    expect(other.requests).toHaveLength(1);
    expect(provider.requests).toHaveLength(0);
  });

  it("falls back to the default model from core config", async () => {
    const config = makeConfig((c) => {
      c.core.activeModel = "core-model";
    });
    const { manager, provider } = makeManager(config);
    await manager.get("default").run({ prompt: "p" });
    expect(provider.requests[0]?.model).toBe("core-model");
  });
});

describe("AgentManager active agent", () => {
  it("defaults to the configured default agent", () => {
    const config = makeConfig((c) => {
      c.agents.default = "plan";
    });
    const { manager } = makeManager(config);
    expect(manager.getActiveName()).toBe("plan");
    expect(manager.getActive().definition.name).toBe("plan");
  });

  it("falls back to 'default' for unknown configured defaults", () => {
    const config = makeConfig((c) => {
      c.agents.default = "ghost";
    });
    const { manager } = makeManager(config);
    expect(manager.getActiveName()).toBe("default");
  });

  it("setActive switches and emits agent.switched", () => {
    const events = new EventBus();
    const seen: UltraCodeEvent[] = [];
    events.on("agent.switched", (e) => seen.push(e));
    const { manager } = makeManager(makeConfig(), { events });

    manager.setActive("review");
    manager.setActive("review"); // no-op, no duplicate event
    expect(manager.getActiveName()).toBe("review");
    expect(seen).toEqual([{ type: "agent.switched", from: "default", to: "review" }]);
  });
});

describe("AgentManager delegation", () => {
  it("delegates a prompt to a subagent and returns its result", async () => {
    const { manager } = makeManager();
    const result = await manager.delegate("plan", "explore the repo");
    expect(result.text).toBe(`echo:${DEFAULT_CONFIG.core.activeModel}`);
    expect(result.turns).toBe(1);
  });

  it(`allows depth up to ${MAX_DELEGATION_DEPTH} and rejects depth 3 with AgentError`, async () => {
    const { manager } = makeManager();
    await expect(manager.delegate("plan", "d1", { depth: 1 })).resolves.toBeDefined();
    await expect(manager.delegate("plan", "d2", { depth: 2 })).resolves.toBeDefined();
    await expect(manager.delegate("plan", "d3", { depth: 3 })).rejects.toBeInstanceOf(AgentError);
  });

  it("rejects invalid depths", async () => {
    const { manager } = makeManager();
    await expect(manager.delegate("plan", "p", { depth: 0 })).rejects.toBeInstanceOf(AgentError);
    await expect(manager.delegate("plan", "p", { depth: 1.5 })).rejects.toBeInstanceOf(AgentError);
  });

  it("bounds concurrent delegations by tools.perTool.task.maxConcurrent", async () => {
    const config = makeConfig((c) => {
      c.tools.perTool["task"] = { maxConcurrent: 2 };
    });
    const provider = new EchoProvider("fake", 25);
    const manager = createAgentManager({
      config,
      logger: new NoopLogger(),
      tools: new StubRunner(),
      provider,
    });

    await Promise.all([
      manager.delegate("plan", "a"),
      manager.delegate("plan", "b"),
      manager.delegate("plan", "c"),
      manager.delegate("plan", "d"),
      manager.delegate("plan", "e"),
    ]);
    expect(provider.requests).toHaveLength(5);
    expect(provider.maxActive).toBeLessThanOrEqual(2);
  });

  it("defaults to 3 concurrent delegations when not configured", async () => {
    const provider = new EchoProvider("fake", 20);
    const manager = createAgentManager({
      config: makeConfig(),
      logger: new NoopLogger(),
      tools: new StubRunner(),
      provider,
    });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) => manager.delegate("plan", `p${i}`)),
    );
    expect(provider.maxActive).toBeLessThanOrEqual(3);
    expect(provider.maxActive).toBeGreaterThan(1); // genuinely parallel
  });

  it("releases the slot when a delegated run fails", async () => {
    const failing: ILLMProvider = {
      name: "fail",
      listModels: async () => [],
      complete: async () => {
        throw new ProviderError("down", { provider: "fail" });
      },
      // eslint-disable-next-line require-yield
      stream: async function* (): AsyncIterable<CompletionChunk> {
        throw new ProviderError("down", { provider: "fail" });
      },
      healthCheck: async () => false,
    };
    const config = makeConfig((c) => {
      c.tools.perTool["task"] = { maxConcurrent: 1 };
    });
    const manager = createAgentManager({
      config,
      logger: new NoopLogger(),
      tools: new StubRunner(),
      provider: failing,
    });
    await expect(manager.delegate("plan", "a")).rejects.toBeInstanceOf(AgentError);
    // Slot must be free again — a second delegation may fail, but not hang.
    await expect(manager.delegate("plan", "b")).rejects.toBeInstanceOf(AgentError);
  });
});
