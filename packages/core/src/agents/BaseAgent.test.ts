import type {
  AgentDefinition,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  Logger,
  LogMeta,
  ToolCallRequest,
  ToolDefinition,
  ToolResult,
} from "ultracode-shared";
import { AgentError, NoopLogger, ProviderError } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import type { IToolRunner } from "../execution/types.js";
import { BaseAgent } from "./BaseAgent.js";
import { BUILT_IN_AGENTS } from "./builtins.js";

const def = (name: string): ToolDefinition => ({
  name,
  description: name,
  category: "utility",
  parameters: { type: "object" },
  permission: "always",
});

const ALL_TOOLS = [
  "read",
  "write_file",
  "edit",
  "delete_file",
  "bash",
  "grep",
  "glob",
  "git_status",
].map(def);

class RecordingRunner implements IToolRunner {
  readonly executed: string[] = [];
  list(): ToolDefinition[] {
    return ALL_TOOLS;
  }
  async execute(name: string): Promise<ToolResult> {
    this.executed.push(name);
    return { ok: true, output: `ran ${name}`, durationMs: 1 };
  }
}

type Scripted = CompletionResult | (() => CompletionResult);

class FakeProvider implements ILLMProvider {
  readonly name = "fake";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly results: Scripted[]) {}
  async listModels(): Promise<string[]> {
    return [];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(req);
    const next = this.results.shift();
    if (!next) throw new ProviderError("exhausted", { provider: "fake" });
    return typeof next === "function" ? next() : next;
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<CompletionChunk> {
    throw new ProviderError("not scripted", { provider: "fake" });
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

const toolTurn = (calls: ToolCallRequest[]): CompletionResult => ({
  text: "",
  toolCalls: calls,
  usage: { inputTokens: 1, outputTokens: 1 },
  finishReason: "tool_calls",
});

/** A turn that the provider truncated at the token cap. */
const lengthTurn = (text: string): CompletionResult => ({
  text,
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 9 },
  finishReason: "length",
});

/** Logger that records every warn() call for assertions. */
class CapturingLogger implements Logger {
  readonly warnings: Array<{ msg: string; meta?: LogMeta }> = [];
  debug(): void {}
  info(): void {}
  warn(msg: string, meta?: LogMeta): void {
    this.warnings.push(meta === undefined ? { msg } : { msg, meta });
  }
  error(): void {}
}

const builtin = (name: string): AgentDefinition => {
  const found = BUILT_IN_AGENTS.find((a) => a.name === name);
  if (!found) throw new Error(`missing builtin ${name}`);
  return found;
};

function makeAgent(
  definition: AgentDefinition,
  provider: ILLMProvider,
  tools: IToolRunner = new RecordingRunner(),
  extra: Partial<ConstructorParameters<typeof BaseAgent>[0]> = {},
): BaseAgent {
  return new BaseAgent({
    definition,
    systemPrompt: "TEST SYSTEM PROMPT",
    provider,
    tools,
    model: "fake-model",
    logger: new NoopLogger(),
    ...extra,
  });
}

describe("BaseAgent tool restrictions", () => {
  it("security agent exposes only read/grep/glob/git_* (wildcard allow-list)", () => {
    const agent = makeAgent(builtin("security"), new FakeProvider([]));
    expect(agent.listTools().map((t) => t.name)).toEqual(["read", "grep", "glob", "git_status"]);
  });

  it("plan agent has write_file/edit/delete_file/bash disabled", () => {
    const agent = makeAgent(builtin("plan"), new FakeProvider([]));
    expect(agent.listTools().map((t) => t.name)).toEqual(["read", "grep", "glob", "git_status"]);
  });

  it("review agent keeps bash but no file mutation", () => {
    const agent = makeAgent(builtin("review"), new FakeProvider([]));
    expect(agent.listTools().map((t) => t.name)).toEqual([
      "read",
      "bash",
      "grep",
      "glob",
      "git_status",
    ]);
  });

  it("refuses disallowed tool calls via an error tool message and still completes", async () => {
    const inner = new RecordingRunner();
    const provider = new FakeProvider([
      toolTurn([{ id: "c1", name: "write_file", arguments: { path: "x" } }]),
      stop("finished"),
    ]);
    const agent = makeAgent(builtin("plan"), provider, inner);

    const result = await agent.run({ prompt: "try writing" });
    expect(result.text).toBe("finished");
    expect(inner.executed).toEqual([]); // never reached the real runner
    const toolMsg = provider.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("TOOL_NOT_FOUND");
  });

  it("only advertises allowed tools to the provider", async () => {
    const provider = new FakeProvider([stop("ok")]);
    const agent = makeAgent(builtin("security"), provider);
    await agent.run({ prompt: "audit" });
    expect(provider.requests[0]?.tools?.map((t) => t.name)).toEqual([
      "read",
      "grep",
      "glob",
      "git_status",
    ]);
  });
});

describe("BaseAgent.run", () => {
  it("returns the aggregated AgentRunResult", async () => {
    const provider = new FakeProvider([
      toolTurn([{ id: "c1", name: "read", arguments: {} }]),
      stop("done"),
    ]);
    const agent = makeAgent(builtin("default"), provider);
    const result = await agent.run({ prompt: "go" });
    expect(result).toEqual({
      text: "done",
      toolCallsExecuted: 1,
      usage: { inputTokens: 2, outputTokens: 2 },
      turns: 2,
      finishReason: "stop",
    });
  });

  it("surfaces a 'length' finishReason on the result and logs a warning", async () => {
    const provider = new FakeProvider([lengthTurn("partial answer that got cut")]);
    const logger = new CapturingLogger();
    const agent = makeAgent(builtin("default"), provider, new RecordingRunner(), { logger });

    const result = await agent.run({ prompt: "write a long essay" });

    expect(result.text).toBe("partial answer that got cut");
    expect(result.finishReason).toBe("length");
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.msg).toContain("truncated");
    expect(logger.warnings[0]?.meta).toMatchObject({ agent: "default" });
  });

  it("does not warn for a clean 'stop' finishReason", async () => {
    const provider = new FakeProvider([stop("complete answer")]);
    const logger = new CapturingLogger();
    const agent = makeAgent(builtin("default"), provider, new RecordingRunner(), { logger });

    const result = await agent.run({ prompt: "hi" });

    expect(result.finishReason).toBe("stop");
    expect(logger.warnings).toHaveLength(0);
  });

  it("injects collected context into the system message", async () => {
    const provider = new FakeProvider([stop("ok")]);
    const agent = makeAgent(builtin("default"), provider, new RecordingRunner(), {
      contextCollector: async (prompt) => `CTX for ${prompt}`,
    });
    await agent.run({ prompt: "hello" });
    const sys = provider.requests[0]?.messages[0];
    expect(sys?.role).toBe("system");
    expect(sys?.content).toContain("TEST SYSTEM PROMPT");
    expect(sys?.content).toContain("CTX for hello");
  });

  it("continues without context when the collector fails", async () => {
    const provider = new FakeProvider([stop("ok")]);
    const agent = makeAgent(builtin("default"), provider, new RecordingRunner(), {
      contextCollector: async () => {
        throw new Error("context backend down");
      },
    });
    const result = await agent.run({ prompt: "hello" });
    expect(result.text).toBe("ok");
    expect(provider.requests[0]?.messages[0]?.content).toBe("TEST SYSTEM PROMPT");
  });

  it("wraps generic failures in AgentError with the cause preserved", async () => {
    const boom = new TypeError("unexpected");
    const provider = new FakeProvider([
      () => {
        throw boom;
      },
    ]);
    const agent = makeAgent(builtin("default"), provider);
    const err = await agent.run({ prompt: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect((err as AgentError).cause).toBe(boom);
  });

  it("wraps ProviderError in AgentError but keeps the message visible", async () => {
    const provider = new FakeProvider([
      () => {
        throw new ProviderError("rate limited", { provider: "fake", retryable: true });
      },
    ]);
    const agent = makeAgent(builtin("default"), provider);
    const err = await agent.run({ prompt: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect((err as AgentError).message).toContain("rate limited");
  });

  it("rejects with the abort-derived error unchanged", async () => {
    const controller = new AbortController();
    controller.abort();
    const agent = makeAgent(builtin("default"), new FakeProvider([stop("never")]));
    const err = await agent
      .run({ prompt: "x", signal: controller.signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("AbortError");
    expect(err).not.toBeInstanceOf(AgentError);
  });
});
