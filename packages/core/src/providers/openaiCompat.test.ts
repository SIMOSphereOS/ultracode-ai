import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "ultracode-shared";
import type { ChatMessage, CompletionChunk, CompletionRequest, ToolDefinition } from "ultracode-shared";
import { MistralProvider, MISTRAL_BASE_URL } from "./MistralProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import {
  OpenAIToolCallAssembler,
  isReasoningModel,
  mapOpenAIFinishReason,
  safeParseArgs,
  toOpenAIMessages,
  toOpenAITools,
} from "./openaiCompat.js";
import {
  captureLogger,
  collect,
  jsonResponse,
  sse,
  streamResponse,
  stubFetchSequence,
  stubHangingFetch,
  testOptions,
} from "./testkit.test.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const toolDef: ToolDefinition = {
  name: "read",
  description: "Read a file",
  category: "file",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  permission: "always",
};

describe("wire mapping", () => {
  it("maps assistant tool calls and tool results onto the wire format", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "be brief" },
      { role: "user", content: "read foo" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "read", arguments: { path: "foo" } }],
      },
      { role: "tool", content: "contents", toolCallId: "c1", name: "read" },
    ];
    const wire = toOpenAIMessages(messages);
    expect(wire[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "read", arguments: '{"path":"foo"}' } },
      ],
    });
    expect(wire[3]).toMatchObject({ role: "tool", content: "contents", tool_call_id: "c1" });
  });

  it("maps tool definitions onto function tools", () => {
    expect(toOpenAITools([toolDef])).toEqual([
      {
        type: "function",
        function: { name: "read", description: "Read a file", parameters: toolDef.parameters },
      },
    ]);
  });

  it("maps finish reasons", () => {
    expect(mapOpenAIFinishReason("stop", false)).toBe("stop");
    expect(mapOpenAIFinishReason("length", false)).toBe("length");
    expect(mapOpenAIFinishReason("tool_calls", false)).toBe("tool_calls");
    expect(mapOpenAIFinishReason("content_filter", false)).toBe("error");
    expect(mapOpenAIFinishReason(undefined, true)).toBe("tool_calls");
  });

  it("safeParseArgs tolerates broken and non-object JSON", () => {
    const { logger, logs } = captureLogger();
    expect(safeParseArgs("{broken", logger)).toEqual({});
    expect(safeParseArgs("[1,2]", logger)).toEqual({});
    expect(safeParseArgs("", logger)).toEqual({});
    expect(safeParseArgs('{"a":1}', logger)).toEqual({ a: 1 });
    expect(logs.filter((l) => l.level === "warn")).toHaveLength(1);
  });
});

describe("isReasoningModel", () => {
  it("matches the o1/o3/o4/gpt-5 families incl. suffixes", () => {
    for (const id of ["o1", "o1-preview", "o3", "o3-mini", "o4-mini", "gpt-5", "gpt-5-2025-08-01", "O3-MINI"]) {
      expect(isReasoningModel(id)).toBe(true);
    }
  });

  it("does NOT match classic GPT models (gpt-4o stays on the legacy path)", () => {
    for (const id of ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo", "gpt-4-turbo", "o1mini"]) {
      expect(isReasoningModel(id)).toBe(false);
    }
  });
});

describe("reasoning-model request shaping (OpenAI)", () => {
  const okResponse = (): Response =>
    jsonResponse({
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

  function bodyFrom(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const [, init] = mock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body) as Record<string, unknown>;
  }

  it("emits max_completion_tokens (not max_tokens) and omits a non-default temperature for o3", async () => {
    const mock = stubFetchSequence(okResponse());
    const provider = new OpenAIProvider(testOptions());
    await provider.complete({ messages: [], model: "o3-mini", maxTokens: 256, temperature: 0.2 });
    const body = bodyFrom(mock);
    expect(body.max_completion_tokens).toBe(256);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it("keeps the default temperature for a reasoning model", async () => {
    const mock = stubFetchSequence(okResponse());
    const provider = new OpenAIProvider(testOptions());
    await provider.complete({ messages: [], model: "gpt-5", maxTokens: 64, temperature: 1 });
    const body = bodyFrom(mock);
    expect(body.max_completion_tokens).toBe(64);
    expect(body.temperature).toBe(1);
  });

  it("leaves the gpt-4o path unchanged (max_tokens + temperature)", async () => {
    const mock = stubFetchSequence(okResponse());
    const provider = new OpenAIProvider(testOptions());
    await provider.complete({ messages: [], model: "gpt-4o", maxTokens: 256, temperature: 0.2 });
    const body = bodyFrom(mock);
    expect(body.max_tokens).toBe(256);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.2);
  });
});

describe("prompt_cache_key subclass gating", () => {
  const cacheReq = (): CompletionRequest =>
    ({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
      cacheHint: { cachePrefix: true, key: "prefix-xyz" },
    }) as unknown as CompletionRequest;

  it("Mistral does NOT emit prompt_cache_key even with a cache hint", async () => {
    const mock = stubFetchSequence(
      jsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const provider = new MistralProvider(testOptions());
    await provider.complete(cacheReq());
    const [, init] = mock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).prompt_cache_key).toBeUndefined();
  });

  it("OpenAI still emits prompt_cache_key with a cache hint", async () => {
    const mock = stubFetchSequence(
      jsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const provider = new OpenAIProvider(testOptions());
    await provider.complete(cacheReq());
    const [, init] = mock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).prompt_cache_key).toBe("prefix-xyz");
  });
});

describe("OpenAIToolCallAssembler", () => {
  it("assembles fragments spread over many deltas, multiple indices", () => {
    const { logger } = captureLogger();
    const assembler = new OpenAIToolCallAssembler(logger);
    assembler.add([{ index: 0, id: "c0", function: { name: "re" } }]);
    assembler.add([{ index: 0, function: { name: "ad", arguments: '{"pa' } }]);
    assembler.add([{ index: 1, id: "c1", function: { name: "grep", arguments: '{"q":' } }]);
    assembler.add([{ index: 0, function: { arguments: 'th":"a.txt"}' } }]);
    assembler.add([{ index: 1, function: { arguments: '"x"}' } }]);
    expect(assembler.drain()).toEqual([
      { id: "c0", name: "read", arguments: { path: "a.txt" } },
      { id: "c1", name: "grep", arguments: { q: "x" } },
    ]);
    expect(assembler.size).toBe(0);
  });

  it("discards nameless calls and tolerates broken argument JSON", () => {
    const { logger, logs } = captureLogger();
    const assembler = new OpenAIToolCallAssembler(logger);
    assembler.add([{ index: 0, function: { arguments: "{}" } }]); // no name
    assembler.add([{ index: 1, id: "c1", function: { name: "x", arguments: "{nope" } }]);
    const calls = assembler.drain();
    expect(calls).toEqual([{ id: "c1", name: "x", arguments: {} }]);
    expect(logs.some((l) => l.level === "warn")).toBe(true);
  });

  it("ignores junk input shapes", () => {
    const { logger } = captureLogger();
    const assembler = new OpenAIToolCallAssembler(logger);
    assembler.add("garbage");
    assembler.add([null, 42, { index: "x" }]);
    expect(assembler.drain()).toEqual([]);
  });
});

describe("MistralProvider.complete", () => {
  it("performs a non-streaming completion against the Mistral endpoint", async () => {
    const mock = stubFetchSequence(
      jsonResponse({
        choices: [{ message: { content: "Servus" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    const provider = new MistralProvider(testOptions());
    const result = await provider.complete({ messages: [{ role: "user", content: "hi" }], model: "mistral-large-latest" });
    expect(result).toEqual({
      text: "Servus",
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    });
    const [url, init] = mock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(`${MISTRAL_BASE_URL}/chat/completions`);
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "mistral-large-latest", stream: false });
  });

  it("parses non-streaming tool calls", async () => {
    stubFetchSequence(
      jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "c9", type: "function", function: { name: "read", arguments: '{"path":"x"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    );
    const provider = new MistralProvider(testOptions());
    const result = await provider.complete({ messages: [], model: "m" });
    expect(result.toolCalls).toEqual([{ id: "c9", name: "read", arguments: { path: "x" } }]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.text).toBe("");
  });

  it("throws a non-retryable ProviderError on an empty response body", async () => {
    stubFetchSequence(new Response("", { status: 200 }));
    const provider = new MistralProvider(testOptions());
    const err = await provider.complete({ messages: [], model: "m" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).message).toMatch(/empty response/);
  });

  it("throws on structurally invalid responses (no choices)", async () => {
    stubFetchSequence(jsonResponse({ unexpected: true }));
    const provider = new MistralProvider(testOptions());
    await expect(provider.complete({ messages: [], model: "m" })).rejects.toThrow(/invalid completion/);
  });

  it("handles a huge (>= 1 MB) completion text", async () => {
    const big = "ü".repeat(524_288); // 1 MiB+ of UTF-8
    stubFetchSequence(
      jsonResponse({
        choices: [{ message: { content: big }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const provider = new MistralProvider(testOptions());
    const result = await provider.complete({ messages: [], model: "m" });
    expect(result.text.length).toBe(524_288);
    expect(result.text).toBe(big);
  });

  it("retries 429 with Retry-After before succeeding", async () => {
    const mock = stubFetchSequence(
      () => new Response("rate limited", { status: 429, headers: { "retry-after": "0" } }),
      () =>
        jsonResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
    );
    const provider = new MistralProvider(testOptions());
    const result = await provider.complete({ messages: [], model: "m" });
    expect(result.text).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe("OpenAI-compatible streaming", () => {
  function chunkDelta(delta: Record<string, unknown>, finish: string | null = null): unknown {
    return { choices: [{ delta, finish_reason: finish }] };
  }

  it("streams text chunks and a final done chunk with usage", async () => {
    stubFetchSequence(
      streamResponse([
        sse(chunkDelta({ content: "Hel" })),
        sse(chunkDelta({ content: "lo 🎉" })),
        sse({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 7 } }),
        sse("[DONE]"),
      ]),
    );
    const provider = new OpenAIProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "gpt-4o" }));
    expect(chunks).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo 🎉" },
      { type: "done", usage: { inputTokens: 3, outputTokens: 7 } },
    ]);
  });

  it("requests stream usage via stream_options (OpenAI default)", async () => {
    const mock = stubFetchSequence(streamResponse([sse("[DONE]")]));
    const provider = new OpenAIProvider(testOptions());
    await collect(provider.stream({ messages: [], model: "gpt-4o" }));
    const [, init] = mock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it("assembles tool-call fragments spread over many deltas", async () => {
    stubFetchSequence(
      streamResponse([
        sse(chunkDelta({ tool_calls: [{ index: 0, id: "call_1", function: { name: "re" } }] })),
        sse(chunkDelta({ tool_calls: [{ index: 0, function: { name: "ad", arguments: "" } }] })),
        sse(chunkDelta({ tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] })),
        sse(chunkDelta({ tool_calls: [{ index: 0, function: { arguments: 'th":"日本.txt"}' } }] })),
        sse(chunkDelta({}, "tool_calls")),
        sse("[DONE]"),
      ]),
    );
    const provider = new MistralProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks[0]).toEqual({
      type: "tool_call",
      toolCall: { id: "call_1", name: "read", arguments: { path: "日本.txt" } },
    });
    expect(chunks.at(-1)?.type).toBe("done");
  });

  it("survives SSE events torn across chunk boundaries", async () => {
    const event = sse(chunkDelta({ content: "split-me" }));
    const pieces = [event.slice(0, 7), event.slice(7, 19), event.slice(19), sse("[DONE]")];
    stubFetchSequence(streamResponse(pieces));
    const provider = new OpenAIProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks[0]).toEqual({ type: "text", text: "split-me" });
  });

  it("logs and skips a broken JSON line mid-stream", async () => {
    const { logger, logs } = captureLogger();
    stubFetchSequence(
      streamResponse([
        sse(chunkDelta({ content: "a" })),
        "data: {definitely-not-json\n\n",
        sse(chunkDelta({ content: "b" })),
        sse("[DONE]"),
      ]),
    );
    const provider = new OpenAIProvider(testOptions(), logger);
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["a", "b"]);
    expect(logs.some((l) => l.level === "warn")).toBe(true);
  });

  it("rejects with an abort-flavoured ProviderError when aborted mid-stream", async () => {
    const controller = new AbortController();
    const event = sse(chunkDelta({ content: "first" }));
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        if (pulls === 1) c.enqueue(new TextEncoder().encode(event));
        // afterwards: never enqueue again, simulating a stalled stream
      },
    });
    stubFetchSequence(new Response(body, { status: 200 }));
    const provider = new OpenAIProvider(testOptions());
    const iterator = provider
      .stream({ messages: [], model: "m", signal: controller.signal })
      [Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toEqual({ type: "text", text: "first" });
    setTimeout(() => controller.abort(new Error("user stop")), 5);
    const err = await iterator.next().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).details?.aborted).toBe(true);
  });

  it("flushes tool calls and flags incomplete when a stream ends without a finish_reason", async () => {
    stubFetchSequence(
      streamResponse([
        sse(chunkDelta({ tool_calls: [{ index: 0, id: "c", function: { name: "x", arguments: "{}" } }] })),
      ]),
    );
    const provider = new MistralProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    // The tool call is still flushed, but the terminal chunk is now flagged
    // incomplete (no finish_reason / no [DONE] was ever observed) and carries a
    // best-known finishReason rather than implying a clean stop.
    expect(chunks[0]).toEqual({ type: "tool_call", toolCall: { id: "c", name: "x", arguments: {} } });
    expect(chunks[1]).toEqual({
      type: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
      incomplete: true,
      finishReason: "tool_calls",
    });
  });

  it("flags an entirely empty SSE stream as incomplete", async () => {
    stubFetchSequence(streamResponse([]));
    const provider = new OpenAIProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    // No finish_reason / no [DONE] ever arrived → the terminal chunk is flagged
    // incomplete instead of implying a clean, zero-token stop.
    expect(chunks).toEqual([
      { type: "done", usage: { inputTokens: 0, outputTokens: 0 }, incomplete: true, finishReason: "error" },
    ]);
  });
});

describe("listModels / healthCheck", () => {
  it("lists model ids", async () => {
    stubFetchSequence(jsonResponse({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { junk: 1 }] }));
    const provider = new OpenAIProvider(testOptions());
    expect(await provider.listModels()).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("healthCheck returns true for a healthy endpoint", async () => {
    stubFetchSequence(jsonResponse({ data: [] }));
    const provider = new MistralProvider(testOptions());
    expect(await provider.healthCheck()).toBe(true);
  });

  it("healthCheck returns false (never throws) when the server is down", async () => {
    stubFetchSequence(new TypeError("ECONNREFUSED"));
    const provider = new MistralProvider(testOptions({ maxRetries: 0 }));
    await expect(provider.healthCheck()).resolves.toBe(false);
  });

  it("healthCheck returns false for an unhealthy (non-2xx) backend", async () => {
    stubFetchSequence(new Response("teapot", { status: 503 }));
    const provider = new OpenAIProvider(testOptions());
    await expect(provider.healthCheck()).resolves.toBe(false);
  });

  it("healthCheck returns false when the probe hangs (short internal timeout)", async () => {
    stubHangingFetch();
    const provider = new OpenAIProvider(testOptions({ timeoutMs: 20 }));
    await expect(provider.healthCheck()).resolves.toBe(false);
  });
});
