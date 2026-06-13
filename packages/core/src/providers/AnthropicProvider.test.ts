import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@ultracode/shared";
import type { ChatMessage } from "@ultracode/shared";
import {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_VERSION,
  AnthropicProvider,
  isRetryableAnthropicErrorType,
  mapAnthropicStopReason,
  toAnthropicMessages,
  toAnthropicTools,
} from "./AnthropicProvider.js";
import {
  captureLogger,
  collect,
  jsonResponse,
  streamResponse,
  stubFetchSequence,
  testOptions,
} from "./testkit.test.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Encode one named Anthropic SSE event. */
function anthropicEvent(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
}

describe("toAnthropicMessages", () => {
  it("lifts system messages to top level and maps tool roles to tool_result blocks", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "be precise" },
      { role: "system", content: "answer in German" },
      { role: "user", content: "read foo" },
      {
        role: "assistant",
        content: "on it",
        toolCalls: [{ id: "tu_1", name: "read", arguments: { path: "foo" } }],
      },
      { role: "tool", content: "file contents", toolCallId: "tu_1" },
      { role: "tool", content: "more", toolCallId: "tu_2" },
    ];
    const { system, messages: wire } = toAnthropicMessages(messages);
    expect(system).toBe("be precise\n\nanswer in German");
    expect(wire).toEqual([
      { role: "user", content: [{ type: "text", text: "read foo" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "on it" },
          { type: "tool_use", id: "tu_1", name: "read", input: { path: "foo" } },
        ],
      },
      {
        // consecutive tool results merge into one alternation-safe user turn
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tu_1", content: "file contents" },
          { type: "tool_result", tool_use_id: "tu_2", content: "more" },
        ],
      },
    ]);
  });

  it("returns undefined system and empty messages for empty input", () => {
    expect(toAnthropicMessages([])).toEqual({ system: undefined, messages: [] });
  });
});

describe("mapAnthropicStopReason / tools", () => {
  it("maps stop reasons", () => {
    expect(mapAnthropicStopReason("end_turn", false)).toBe("stop");
    expect(mapAnthropicStopReason("tool_use", false)).toBe("tool_calls");
    expect(mapAnthropicStopReason("max_tokens", false)).toBe("length");
    expect(mapAnthropicStopReason("weird", false)).toBe("error");
    expect(mapAnthropicStopReason(undefined, true)).toBe("tool_calls");
  });

  it("classifies mid-stream error types as retryable / non-retryable", () => {
    for (const t of ["overloaded_error", "api_error", "rate_limit_error"]) {
      expect(isRetryableAnthropicErrorType(t)).toBe(true);
    }
    for (const t of ["invalid_request_error", "authentication_error", "permission_error", undefined]) {
      expect(isRetryableAnthropicErrorType(t)).toBe(false);
    }
  });

  it("maps tools onto input_schema", () => {
    expect(
      toAnthropicTools([
        {
          name: "grep",
          description: "search",
          category: "search",
          parameters: { type: "object" },
          permission: "always",
        },
      ]),
    ).toEqual([{ name: "grep", description: "search", input_schema: { type: "object" } }]);
  });
});

describe("AnthropicProvider.complete", () => {
  it("sends x-api-key + version headers and parses content blocks", async () => {
    const mock = stubFetchSequence(
      jsonResponse({
        content: [
          { type: "text", text: "Hallo " },
          { type: "text", text: "Welt" },
          { type: "tool_use", id: "tu_9", name: "read", input: { path: "x" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 11, output_tokens: 22 },
      }),
    );
    const provider = new AnthropicProvider(testOptions());
    const result = await provider.complete({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      model: "claude-sonnet-4-5",
      maxTokens: 1024,
    });
    expect(result).toEqual({
      text: "Hallo Welt",
      toolCalls: [{ id: "tu_9", name: "read", arguments: { path: "x" } }],
      usage: { inputTokens: 11, outputTokens: 22 },
      finishReason: "tool_calls",
    });
    const [url, init] = mock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(`${ANTHROPIC_BASE_URL}/messages`);
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(init.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.system).toBe("sys");
    expect(body.max_tokens).toBe(1024);
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
  });

  it("defaults max_tokens when the request omits it", async () => {
    const mock = stubFetchSequence(
      jsonResponse({ content: [], stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } }),
    );
    const provider = new AnthropicProvider(testOptions());
    await provider.complete({ messages: [{ role: "user", content: "x" }], model: "m" });
    const [, init] = mock.mock.calls[0] as [string, { body: string }];
    expect((JSON.parse(init.body) as Record<string, unknown>).max_tokens).toBe(4096);
  });

  it("throws non-retryable ProviderError on an invalid (content-less) response", async () => {
    stubFetchSequence(jsonResponse({ nope: true }));
    const provider = new AnthropicProvider(testOptions());
    const err = await provider.complete({ messages: [], model: "m" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
  });

  it("does not retry a 401", async () => {
    const mock = stubFetchSequence(new Response("unauthorized", { status: 401 }));
    const provider = new AnthropicProvider(testOptions({ maxRetries: 4 }));
    const err = await provider.complete({ messages: [], model: "m" }).catch((e: unknown) => e);
    expect((err as ProviderError).statusCode).toBe(401);
    expect((err as ProviderError).retryable).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries a 529-overloaded answer until exhausted (retryable:true)", async () => {
    const mock = stubFetchSequence(() => new Response("overloaded", { status: 529 }));
    const provider = new AnthropicProvider(testOptions({ maxRetries: 1, retryDelayMs: 1 }));
    const err = await provider.complete({ messages: [], model: "m" }).catch((e: unknown) => e);
    expect((err as ProviderError).retryable).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe("AnthropicProvider.stream", () => {
  it("streams text deltas and assembles input_json_delta tool calls", async () => {
    stubFetchSequence(
      streamResponse([
        anthropicEvent("message_start", { message: { usage: { input_tokens: 7 } } }),
        anthropicEvent("content_block_start", { index: 0, content_block: { type: "text" } }),
        anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Gr" } }),
        anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "üße 🎉" } }),
        anthropicEvent("content_block_stop", { index: 0 }),
        anthropicEvent("content_block_start", {
          index: 1,
          content_block: { type: "tool_use", id: "tu_1", name: "read" },
        }),
        anthropicEvent("content_block_delta", {
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"pa' },
        }),
        anthropicEvent("content_block_delta", {
          index: 1,
          delta: { type: "input_json_delta", partial_json: 'th":"a.txt"}' },
        }),
        anthropicEvent("content_block_stop", { index: 1 }),
        anthropicEvent("message_delta", { usage: { output_tokens: 13 }, delta: { stop_reason: "tool_use" } }),
        anthropicEvent("message_stop", {}),
      ]),
    );
    const provider = new AnthropicProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks).toEqual([
      { type: "text", text: "Gr" },
      { type: "text", text: "üße 🎉" },
      { type: "tool_call", toolCall: { id: "tu_1", name: "read", arguments: { path: "a.txt" } } },
      { type: "done", usage: { inputTokens: 7, outputTokens: 13 } },
    ]);
  });

  it("logs and skips broken JSON events, keeps streaming", async () => {
    const { logger, logs } = captureLogger();
    stubFetchSequence(
      streamResponse([
        anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "a" } }),
        "event: content_block_delta\ndata: {broken-json\n\n",
        anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "b" } }),
      ]),
    );
    const provider = new AnthropicProvider(testOptions(), logger);
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["a", "b"]);
    expect(logs.some((l) => l.level === "warn")).toBe(true);
  });

  it("surfaces an overloaded_error mid-stream event as a RETRYABLE ProviderError", async () => {
    stubFetchSequence(
      streamResponse([anthropicEvent("error", { error: { type: "overloaded_error", message: "busy" } })]),
    );
    const provider = new AnthropicProvider(testOptions());
    const err = await collect(provider.stream({ messages: [], model: "m" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toMatch(/busy/);
    // overloaded_error is the streamed form of a 529 → retryable so the run can
    // restart the turn (a partial response may already have streamed).
    expect((err as ProviderError).retryable).toBe(true);
  });

  it("surfaces an invalid_request mid-stream event as a NON-retryable ProviderError", async () => {
    stubFetchSequence(
      streamResponse([
        anthropicEvent("error", { error: { type: "invalid_request_error", message: "bad tools" } }),
      ]),
    );
    const provider = new AnthropicProvider(testOptions());
    const err = await collect(provider.stream({ messages: [], model: "m" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
  });

  it("flags the terminal chunk incomplete when the stream ends without message_delta/message_stop", async () => {
    // Body ends after some text but before any terminal event (dropped conn).
    stubFetchSequence(
      streamResponse([
        anthropicEvent("message_start", { message: { usage: { input_tokens: 5 } } }),
        anthropicEvent("content_block_start", { index: 0, content_block: { type: "text" } }),
        anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "partial" } }),
      ]),
    );
    const provider = new AnthropicProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks[0]).toEqual({ type: "text", text: "partial" });
    expect(chunks.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 5, outputTokens: 0 },
      incomplete: true,
      finishReason: "error",
    });
  });

  it("rejects with abort ProviderError when aborted mid-stream", async () => {
    const controller = new AbortController();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        if (pulls === 1) {
          c.enqueue(
            new TextEncoder().encode(
              anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "x" } }),
            ),
          );
        }
      },
    });
    stubFetchSequence(new Response(body, { status: 200 }));
    const provider = new AnthropicProvider(testOptions());
    const iterator = provider
      .stream({ messages: [], model: "m", signal: controller.signal })
      [Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: "text", text: "x" });
    setTimeout(() => controller.abort(), 5);
    const err = await iterator.next().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).details?.aborted).toBe(true);
  });
});

describe("AnthropicProvider listModels / healthCheck", () => {
  it("lists models from /models", async () => {
    stubFetchSequence(jsonResponse({ data: [{ id: "claude-sonnet-4-5" }] }));
    const provider = new AnthropicProvider(testOptions());
    expect(await provider.listModels()).toEqual(["claude-sonnet-4-5"]);
  });

  it("healthCheck is false when the backend is down", async () => {
    stubFetchSequence(new TypeError("connect ECONNREFUSED"));
    const provider = new AnthropicProvider(testOptions());
    await expect(provider.healthCheck()).resolves.toBe(false);
  });
});
