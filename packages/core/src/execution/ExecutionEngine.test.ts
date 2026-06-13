import { describe, expect, it } from "vitest";
import {
  AgentError,
  EventBus,
  NoopLogger,
  ProviderError,
  MAX_TOOL_OUTPUT_CHARS,
} from "@ultracode/shared";
import type {
  ChatMessage,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
  Logger,
  LogMeta,
  TokenUsage,
  ToolCallRequest,
  ToolContext,
  ToolDefinition,
  ToolResult,
  UltraCodeEvent,
} from "@ultracode/shared";
import { DEFAULT_NO_PROGRESS_LIMIT, ExecutionEngine, isAbortError } from "./ExecutionEngine.js";
import type { IToolRunner } from "./types.js";

/* ----------------------------------------------------------------------------
 * Fakes
 * ------------------------------------------------------------------------- */

const usage = (inputTokens: number, outputTokens: number): TokenUsage => ({
  inputTokens,
  outputTokens,
});

const stop = (text: string, u: TokenUsage = usage(1, 2)): CompletionResult => ({
  text,
  toolCalls: [],
  usage: u,
  finishReason: "stop",
});

const toolTurn = (
  calls: ToolCallRequest[],
  u: TokenUsage = usage(1, 2),
): CompletionResult => ({
  text: "",
  toolCalls: calls,
  usage: u,
  finishReason: "tool_calls",
});

const call = (id: string, name: string, args: unknown = {}): ToolCallRequest => ({
  id,
  name,
  arguments: args as Record<string, unknown>,
});

type ScriptedResult = CompletionResult | (() => CompletionResult | Promise<CompletionResult>);

class FakeProvider implements ILLMProvider {
  readonly name = "fake";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly results: ScriptedResult[]) {}

  async listModels(): Promise<string[]> {
    return ["fake-model"];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(req);
    const next = this.results.shift();
    if (!next) {
      throw new ProviderError("no scripted result left", { provider: "fake" });
    }
    return typeof next === "function" ? await next() : next;
  }

  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<CompletionChunk> {
    throw new ProviderError("stream not scripted", { provider: "fake" });
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

class FakeStreamProvider implements ILLMProvider {
  readonly name = "fake-stream";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly turns: CompletionChunk[][]) {}

  async listModels(): Promise<string[]> {
    return ["fake-model"];
  }

  async complete(): Promise<CompletionResult> {
    throw new ProviderError("complete not scripted", { provider: "fake-stream" });
  }

  async *stream(req: CompletionRequest): AsyncIterable<CompletionChunk> {
    this.requests.push(req);
    const turn = this.turns.shift();
    if (!turn) throw new ProviderError("no scripted chunks left", { provider: "fake-stream" });
    for (const chunk of turn) {
      await Promise.resolve();
      yield chunk;
    }
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

const toolDef = (name: string): ToolDefinition => ({
  name,
  description: `fake tool ${name}`,
  category: "utility",
  parameters: { type: "object" },
  permission: "always",
});

const okResult = (output: unknown, durationMs = 1): ToolResult => ({
  ok: true,
  output,
  durationMs,
});

type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
) => ToolResult | Promise<ToolResult>;

class FakeToolRunner implements IToolRunner {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  concurrent = 0;
  maxConcurrent = 0;

  constructor(
    private readonly defs: ToolDefinition[] = [toolDef("echo")],
    private readonly handler: ToolHandler = (name, args) => okResult({ name, args }),
  ) {}

  list(): ToolDefinition[] {
    return [...this.defs];
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    this.calls.push({ name, args });
    this.concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    try {
      return await this.handler(name, args, ctx);
    } finally {
      this.concurrent--;
    }
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

function makeEngine(
  provider: ILLMProvider,
  tools: IToolRunner,
  extra: Partial<ConstructorParameters<typeof ExecutionEngine>[0]> = {},
): ExecutionEngine {
  return new ExecutionEngine({
    provider,
    tools,
    model: "fake-model",
    logger: new NoopLogger(),
    ...extra,
  });
}

/* ----------------------------------------------------------------------------
 * Tests
 * ------------------------------------------------------------------------- */

describe("ExecutionEngine", () => {
  it("runs a multi-turn loop (two tool rounds, then stop) and accumulates usage", async () => {
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo", { step: 1 }), call("c2", "echo", { step: 2 })], usage(10, 20)),
      toolTurn([call("c3", "echo", { step: 3 })], usage(5, 5)),
      stop("all done", usage(1, 4)),
    ]);
    const tools = new FakeToolRunner();
    const engine = makeEngine(provider, tools);

    const result = await engine.run({ prompt: "do things", systemPrompt: "SYS" });

    expect(result.text).toBe("all done");
    expect(result.turns).toBe(3);
    expect(result.toolCallsExecuted).toBe(3);
    expect(result.usage).toEqual({ inputTokens: 16, outputTokens: 29 });
    expect(result.finishReason).toBe("stop");
    expect(tools.calls.map((c) => c.args)).toEqual([{ step: 1 }, { step: 2 }, { step: 3 }]);

    // Transcript shape: system, user, assistant+2 tool, assistant+1 tool, assistant.
    const roles = result.messages.map((m) => m.role);
    expect(roles).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "tool",
      "assistant",
      "tool",
      "assistant",
    ]);
    const firstTool = result.messages[3] as ChatMessage;
    expect(firstTool.toolCallId).toBe("c1");
    expect(firstTool.name).toBe("echo");

    // Each provider turn must see the full transcript so far + tool defs.
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[0]?.tools?.map((t) => t.name)).toEqual(["echo"]);
    expect(provider.requests[2]?.messages.filter((m) => m.role === "tool")).toHaveLength(3);
  });

  it("injects system prompt and context into a single system message", async () => {
    const provider = new FakeProvider([stop("ok")]);
    const engine = makeEngine(provider, new FakeToolRunner());
    await engine.run({ prompt: "hi", systemPrompt: "PERSONA", context: "PROJECT CONTEXT" });
    const sys = provider.requests[0]?.messages[0];
    expect(sys?.role).toBe("system");
    expect(sys?.content).toContain("PERSONA");
    expect(sys?.content).toContain("PROJECT CONTEXT");
  });

  it("replays history before the new prompt", async () => {
    const provider = new FakeProvider([stop("ok")]);
    const engine = makeEngine(provider, new FakeToolRunner());
    const history: ChatMessage[] = [
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
    ];
    await engine.run({ prompt: "follow-up", history });
    const messages = provider.requests[0]?.messages ?? [];
    expect(messages.map((m) => m.content)).toEqual([
      "earlier question",
      "earlier answer",
      "follow-up",
    ]);
  });

  it("throws AgentError when maxTurns is exceeded and emits an error event", async () => {
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo")]),
      toolTurn([call("c2", "echo")]),
      toolTurn([call("c3", "echo")]),
    ]);
    const events = new EventBus();
    const seen: UltraCodeEvent[] = [];
    events.on("error", (e) => seen.push(e));
    const engine = makeEngine(provider, new FakeToolRunner(), { maxTurns: 2, events });

    await expect(engine.run({ prompt: "loop forever" })).rejects.toBeInstanceOf(AgentError);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: "error", error: { code: "AGENT_ERROR" } });
  });

  it("rejects immediately with an abort error for a pre-aborted signal", async () => {
    const provider = new FakeProvider([stop("never")]);
    const engine = makeEngine(provider, new FakeToolRunner());
    const controller = new AbortController();
    controller.abort();

    await expect(
      engine.run({ prompt: "x", signal: controller.signal }),
    ).rejects.toSatisfy((err: unknown) => isAbortError(err));
    expect(provider.requests).toHaveLength(0);
  });

  it("aborts cleanly when the signal fires during the second turn", async () => {
    const controller = new AbortController();
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo")]),
      () => {
        controller.abort();
        return toolTurn([call("c2", "echo")]);
      },
    ]);
    const tools = new FakeToolRunner();
    const engine = makeEngine(provider, tools);

    await expect(
      engine.run({ prompt: "x", signal: controller.signal }),
    ).rejects.toSatisfy((err: unknown) => isAbortError(err));
    // The second turn's tool calls must never execute.
    expect(tools.calls).toHaveLength(1);
  });

  it("aborts after tool execution when a tool triggers the signal", async () => {
    const controller = new AbortController();
    const tools = new FakeToolRunner([toolDef("echo")], () => {
      controller.abort();
      return okResult("done");
    });
    const provider = new FakeProvider([toolTurn([call("c1", "echo")]), stop("never")]);
    const engine = makeEngine(provider, tools);

    await expect(
      engine.run({ prompt: "x", signal: controller.signal }),
    ).rejects.toSatisfy((err: unknown) => isAbortError(err));
    expect(provider.requests).toHaveLength(1);
  });

  it("feeds failed tool results back as tool messages without aborting the run", async () => {
    const failing: ToolResult = {
      ok: false,
      output: null,
      error: { name: "ToolError", message: "disk on fire", code: "TOOL_ERROR" },
      durationMs: 3,
    };
    const tools = new FakeToolRunner([toolDef("echo")], () => failing);
    const provider = new FakeProvider([toolTurn([call("c1", "echo")]), stop("recovered")]);
    const engine = makeEngine(provider, tools);

    const result = await engine.run({ prompt: "x" });
    expect(result.text).toBe("recovered");
    const toolMsg = provider.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain('"ok":false');
    expect(toolMsg?.content).toContain("disk on fire");
  });

  it("survives a tool runner that rejects (contract violation) by serialising the error", async () => {
    const tools = new FakeToolRunner([toolDef("echo")], () => {
      throw new Error("runner exploded");
    });
    const provider = new FakeProvider([toolTurn([call("c1", "echo")]), stop("ok")]);
    const engine = makeEngine(provider, tools);

    const result = await engine.run({ prompt: "x" });
    expect(result.text).toBe("ok");
    const toolMsg = provider.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("runner exploded");
  });

  it("executes parallel tool calls concurrently with stable result order", async () => {
    const tools = new FakeToolRunner([toolDef("slow"), toolDef("fast")], async (name) => {
      await sleep(name === "slow" ? 40 : 1);
      return okResult(name.toUpperCase());
    });
    const provider = new FakeProvider([
      toolTurn([call("c1", "slow"), call("c2", "fast")]),
      stop("done"),
    ]);
    const engine = makeEngine(provider, tools);

    const result = await engine.run({ prompt: "x" });
    const toolMessages = result.messages.filter((m) => m.role === "tool");
    expect(toolMessages.map((m) => m.toolCallId)).toEqual(["c1", "c2"]);
    expect(toolMessages.map((m) => m.content)).toEqual(["SLOW", "FAST"]);
    expect(tools.maxConcurrent).toBe(2);
  });

  it("treats non-object tool arguments defensively", async () => {
    const tools = new FakeToolRunner();
    const provider = new FakeProvider([
      toolTurn([
        call("c1", "echo", '{"parsed":true}'),
        call("c2", "echo", null),
        call("c3", "echo", 42),
        call("c4", "echo", "not json"),
        call("c5", "echo", ["array"]),
      ]),
      stop("ok"),
    ]);
    const engine = makeEngine(provider, tools);

    await engine.run({ prompt: "x" });
    expect(tools.calls.map((c) => c.args)).toEqual([{ parsed: true }, {}, {}, {}, {}]);
  });

  it("streams chunks to onChunk in order and assembles the final result", async () => {
    const provider = new FakeStreamProvider([
      [
        { type: "text", text: "He" },
        { type: "tool_call", toolCall: call("c1", "echo", { q: 1 }) },
        { type: "done", usage: usage(7, 11) },
      ],
      [
        { type: "text", text: "Hel" },
        { type: "text", text: "lo 👋" },
        { type: "done", usage: usage(2, 3) },
      ],
    ]);
    const tools = new FakeToolRunner();
    const engine = makeEngine(provider, tools);

    const chunks: CompletionChunk[] = [];
    const result = await engine.run({ prompt: "x", onChunk: (c) => chunks.push(c) });

    expect(result.text).toBe("Hello 👋");
    expect(result.turns).toBe(2);
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 14 });
    expect(chunks.map((c) => c.type)).toEqual([
      "text",
      "tool_call",
      "done",
      "text",
      "text",
      "done",
    ]);
    expect(tools.calls[0]?.args).toEqual({ q: 1 });
  });

  it("lets later partial tool-call chunks with the same id win while keeping order", async () => {
    const provider = new FakeStreamProvider([
      [
        { type: "tool_call", toolCall: call("c1", "echo", { v: "partial" }) },
        { type: "tool_call", toolCall: call("c2", "echo", { v: "second" }) },
        { type: "tool_call", toolCall: call("c1", "echo", { v: "final" }) },
        { type: "done", usage: usage(1, 1) },
      ],
      [{ type: "text", text: "ok" }, { type: "done", usage: usage(1, 1) }],
    ]);
    const tools = new FakeToolRunner();
    const engine = makeEngine(provider, tools);

    await engine.run({ prompt: "x", onChunk: () => undefined });
    expect(tools.calls.map((c) => c.args)).toEqual([{ v: "final" }, { v: "second" }]);
  });

  it("throws AgentError on a finishReason 'error' turn", async () => {
    const provider = new FakeProvider([
      { text: "", toolCalls: [], usage: usage(1, 1), finishReason: "error" },
    ]);
    const engine = makeEngine(provider, new FakeToolRunner());
    await expect(engine.run({ prompt: "x" })).rejects.toBeInstanceOf(AgentError);
  });

  it("returns on finishReason 'length' with the partial text", async () => {
    const provider = new FakeProvider([
      { text: "partial…", toolCalls: [], usage: usage(1, 1), finishReason: "length" },
    ]);
    const engine = makeEngine(provider, new FakeToolRunner());
    const result = await engine.run({ prompt: "x" });
    expect(result.finishReason).toBe("length");
    expect(result.text).toBe("partial…");
  });

  it("propagates ProviderError and emits an error event", async () => {
    const provider = new FakeProvider([
      () => {
        throw new ProviderError("rate limited", { provider: "fake", retryable: true });
      },
    ]);
    const events = new EventBus();
    const seen: UltraCodeEvent[] = [];
    events.on("error", (e) => seen.push(e));
    const engine = makeEngine(provider, new FakeToolRunner(), { events });

    await expect(engine.run({ prompt: "x" })).rejects.toBeInstanceOf(ProviderError);
    expect(seen).toHaveLength(1);
  });

  it("emits session.started and tool.executed events", async () => {
    const events = new EventBus();
    const seen: UltraCodeEvent[] = [];
    events.on("session.started", (e) => seen.push(e));
    events.on("tool.executed", (e) => seen.push(e));
    const failing = new FakeToolRunner([toolDef("echo")], (name, args) =>
      args["fail"] === true
        ? { ok: false, output: null, error: { name: "E", message: "x", code: "TOOL_ERROR" }, durationMs: 2 }
        : okResult("fine", 5),
    );
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo", { fail: false }), call("c2", "echo", { fail: true })]),
      stop("done"),
    ]);
    const engine = makeEngine(provider, failing, { events });

    await engine.run({ prompt: "x", sessionId: "sess-42" });
    expect(seen[0]).toEqual({ type: "session.started", sessionId: "sess-42" });
    expect(seen.slice(1)).toEqual([
      { type: "tool.executed", toolName: "echo", ok: true, durationMs: 5 },
      { type: "tool.executed", toolName: "echo", ok: false, durationMs: 2 },
    ]);
  });

  it("handles huge prompts (>= 1 MB) and surrogate-pair content unharmed", async () => {
    const huge = "🧪x".repeat(600_000); // > 1.2M code units incl. surrogate pairs
    const provider = new FakeProvider([stop("ok ✅")]);
    const engine = makeEngine(provider, new FakeToolRunner());

    const result = await engine.run({ prompt: huge });
    const userMsg = provider.requests[0]?.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe(huge);
    expect(result.text).toBe("ok ✅");
  });

  it("truncates oversized tool output in the tool message", async () => {
    const giant = "a".repeat(MAX_TOOL_OUTPUT_CHARS + 50_000);
    const tools = new FakeToolRunner([toolDef("echo")], () => okResult(giant));
    const provider = new FakeProvider([toolTurn([call("c1", "echo")]), stop("ok")]);
    const engine = makeEngine(provider, tools);

    await engine.run({ prompt: "x" });
    const toolMsg = provider.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS);
  });

  it("falls back to the default maxTurns for invalid values", async () => {
    const provider = new FakeProvider([stop("ok")]);
    const engine = makeEngine(provider, new FakeToolRunner(), { maxTurns: Number.NaN });
    await expect(engine.run({ prompt: "x" })).resolves.toMatchObject({ text: "ok" });
  });

  it("terminates with 'no_progress' when N identical tool batches repeat (default limit)", async () => {
    // Script more identical batches than the default limit and a high maxTurns
    // so termination is driven by the no-progress guard, not the turn budget.
    const identical = () => toolTurn([call("c", "echo", { q: "same" })]);
    const provider = new FakeProvider([identical(), identical(), identical(), identical()]);
    const tools = new FakeToolRunner();
    const logger = new CapturingLogger();
    const engine = makeEngine(provider, tools, { maxTurns: 16, logger });

    const result = await engine.run({ prompt: "loop" });

    expect(result.finishReason).toBe("no_progress");
    expect(result.turns).toBe(DEFAULT_NO_PROGRESS_LIMIT);
    // Tools ran for the first (limit - 1) turns; the stalling turn breaks before exec.
    expect(tools.calls).toHaveLength(DEFAULT_NO_PROGRESS_LIMIT - 1);
    expect(result.toolCallsExecuted).toBe(DEFAULT_NO_PROGRESS_LIMIT - 1);
    expect(logger.warnings.some((w) => w.msg.includes("stalled"))).toBe(true);
  });

  it("honours a custom noProgressLimit", async () => {
    const identical = () => toolTurn([call("c", "echo", { q: "same" })]);
    const provider = new FakeProvider([identical(), identical()]);
    const engine = makeEngine(provider, new FakeToolRunner(), {
      noProgressLimit: 2,
      maxTurns: 16,
    });
    const result = await engine.run({ prompt: "loop" });
    expect(result.finishReason).toBe("no_progress");
    expect(result.turns).toBe(2);
  });

  it("clamps a noProgressLimit below 2 up to 2", async () => {
    const identical = () => toolTurn([call("c", "echo", { q: "same" })]);
    const provider = new FakeProvider([identical(), identical()]);
    const engine = makeEngine(provider, new FakeToolRunner(), {
      noProgressLimit: 1,
      maxTurns: 16,
    });
    const result = await engine.run({ prompt: "loop" });
    expect(result.finishReason).toBe("no_progress");
    expect(result.turns).toBe(2);
  });

  it("treats batches with the same args in different key order as identical", async () => {
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo", { a: 1, b: 2 })]),
      toolTurn([call("c2", "echo", { b: 2, a: 1 })]),
    ]);
    const engine = makeEngine(provider, new FakeToolRunner(), {
      noProgressLimit: 2,
      maxTurns: 16,
    });
    const result = await engine.run({ prompt: "loop" });
    expect(result.finishReason).toBe("no_progress");
    expect(result.turns).toBe(2);
  });

  it("treats batches with the same calls in different order as identical", async () => {
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo", { n: 1 }), call("c2", "echo", { n: 2 })]),
      toolTurn([call("c3", "echo", { n: 2 }), call("c4", "echo", { n: 1 })]),
    ]);
    const engine = makeEngine(provider, new FakeToolRunner(), {
      noProgressLimit: 2,
      maxTurns: 16,
    });
    const result = await engine.run({ prompt: "loop" });
    expect(result.finishReason).toBe("no_progress");
    expect(result.turns).toBe(2);
  });

  it("does not trip the guard for well-behaved differing tool batches", async () => {
    const provider = new FakeProvider([
      toolTurn([call("c1", "echo", { step: 1 })]),
      toolTurn([call("c2", "echo", { step: 2 })]),
      toolTurn([call("c3", "echo", { step: 3 })]),
      stop("done"),
    ]);
    const engine = makeEngine(provider, new FakeToolRunner(), {
      noProgressLimit: 2,
      maxTurns: 16,
    });
    const result = await engine.run({ prompt: "work" });
    expect(result.finishReason).toBe("stop");
    expect(result.text).toBe("done");
    expect(result.turns).toBe(4);
  });

  it("resets the repeat counter when a different batch interrupts the streak", async () => {
    // A,A,B,A,A with limit 3 must NOT trip: longest identical streak is 2.
    const a = () => toolTurn([call("c", "echo", { v: "a" })]);
    const b = () => toolTurn([call("c", "echo", { v: "b" })]);
    const provider = new FakeProvider([a(), a(), b(), a(), a(), stop("done")]);
    const engine = makeEngine(provider, new FakeToolRunner(), {
      noProgressLimit: 3,
      maxTurns: 16,
    });
    const result = await engine.run({ prompt: "work" });
    expect(result.finishReason).toBe("stop");
    expect(result.turns).toBe(6);
  });
});
