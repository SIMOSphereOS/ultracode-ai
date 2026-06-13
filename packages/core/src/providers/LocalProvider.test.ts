import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@ultracode/shared";
import { LocalProvider, OLLAMA_BASE_URL } from "./LocalProvider.js";
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

function ndjson(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

describe("LocalProvider.complete", () => {
  it("talks to <endpoint>/api/chat without an API key and parses the reply", async () => {
    const mock = stubFetchSequence(
      jsonResponse({
        message: { role: "assistant", content: "Moin" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 4,
        eval_count: 9,
      }),
    );
    const options = testOptions();
    delete (options as { apiKey?: string }).apiKey;
    const provider = new LocalProvider(options);
    const result = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      model: "llama3.2",
      temperature: 0.2,
      maxTokens: 128,
    });
    expect(result).toEqual({
      text: "Moin",
      toolCalls: [],
      usage: { inputTokens: 4, outputTokens: 9 },
      finishReason: "stop",
    });
    const [url, init] = mock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(`${OLLAMA_BASE_URL}/api/chat`);
    expect(JSON.parse(init.body)).toMatchObject({
      model: "llama3.2",
      stream: false,
      options: { temperature: 0.2, num_predict: 128 },
    });
  });

  it("honours a custom baseUrl from options", async () => {
    const mock = stubFetchSequence(jsonResponse({ message: { content: "" }, done: true }));
    const provider = new LocalProvider(testOptions({ baseUrl: "http://gpu-box:11434/" }));
    await provider.complete({ messages: [], model: "m" });
    expect((mock.mock.calls[0] as [string])[0]).toBe("http://gpu-box:11434/api/chat");
  });

  it("synthesises ids for Ollama tool calls (object arguments)", async () => {
    stubFetchSequence(
      jsonResponse({
        message: {
          content: "",
          tool_calls: [{ function: { name: "get_weather", arguments: { city: "Aschaffenburg" } } }],
        },
        done: true,
      }),
    );
    const provider = new LocalProvider(testOptions());
    const result = await provider.complete({ messages: [], model: "m" });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: "get_weather",
      arguments: { city: "Aschaffenburg" },
    });
    expect(result.toolCalls[0]?.id).toMatch(/^call_/);
    expect(result.finishReason).toBe("tool_calls");
  });

  it("throws non-retryable ProviderError on invalid response shape", async () => {
    stubFetchSequence(jsonResponse({ no: "message" }));
    const provider = new LocalProvider(testOptions());
    const err = await provider.complete({ messages: [], model: "m" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
  });
});

describe("LocalProvider tool-result correlation (tool_name)", () => {
  const reply = (): Response => jsonResponse({ message: { content: "" }, done: true });

  function toolMessageWire(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const [, init] = mock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as { messages: Record<string, unknown>[] };
    const toolMsg = body.messages.find((m) => m.role === "tool");
    if (toolMsg === undefined) throw new Error("no tool message in wire body");
    return toolMsg;
  }

  it("uses an explicit tool name when present", async () => {
    const mock = stubFetchSequence(reply());
    const provider = new LocalProvider(testOptions());
    await provider.complete({
      messages: [{ role: "tool", content: "result", toolCallId: "call_7", name: "read_file" }],
      model: "m",
    });
    expect(toolMessageWire(mock).tool_name).toBe("read_file");
  });

  it("falls back to a stable name derived from toolCallId when name is absent", async () => {
    const mock = stubFetchSequence(reply());
    const provider = new LocalProvider(testOptions());
    await provider.complete({
      messages: [{ role: "tool", content: "result", toolCallId: "call_7" }],
      model: "m",
    });
    // Correlation must NOT be dropped: a deterministic tool_name is emitted.
    expect(toolMessageWire(mock).tool_name).toBe("tool_call_7");
  });
});

describe("LocalProvider.stream (NDJSON)", () => {
  it("parses NDJSON chunks into text, tool_call and done with usage", async () => {
    stubFetchSequence(
      streamResponse([
        ndjson({ message: { role: "assistant", content: "Hal" }, done: false }),
        ndjson({ message: { role: "assistant", content: "lo 🦙" }, done: false }),
        ndjson({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ function: { name: "read", arguments: { path: "x" } } }],
          },
          done: false,
        }),
        ndjson({ done: true, done_reason: "stop", prompt_eval_count: 5, eval_count: 17 }),
      ]),
    );
    const provider = new LocalProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "llama3.2" }));
    expect(chunks[0]).toEqual({ type: "text", text: "Hal" });
    expect(chunks[1]).toEqual({ type: "text", text: "lo 🦙" });
    expect(chunks[2]).toMatchObject({ type: "tool_call", toolCall: { name: "read", arguments: { path: "x" } } });
    expect(chunks[3]).toEqual({ type: "done", usage: { inputTokens: 5, outputTokens: 17 } });
  });

  it("handles NDJSON lines split across network chunks and skips broken lines", async () => {
    const { logger, logs } = captureLogger();
    const lineA = ndjson({ message: { content: "a" }, done: false });
    stubFetchSequence(
      streamResponse([
        lineA.slice(0, 10),
        lineA.slice(10),
        "this is not json\n",
        ndjson({ done: true, prompt_eval_count: 1, eval_count: 1 }),
      ]),
    );
    const provider = new LocalProvider(testOptions(), logger);
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks[0]).toEqual({ type: "text", text: "a" });
    expect(chunks.at(-1)).toEqual({ type: "done", usage: { inputTokens: 1, outputTokens: 1 } });
    expect(logs.some((l) => l.level === "warn")).toBe(true);
  });

  it("flags the terminal chunk incomplete when the NDJSON stream ends without done:true", async () => {
    stubFetchSequence(streamResponse([ndjson({ message: { content: "partial" }, done: false })]));
    const provider = new LocalProvider(testOptions());
    const chunks = await collect(provider.stream({ messages: [], model: "m" }));
    expect(chunks[0]).toEqual({ type: "text", text: "partial" });
    expect(chunks.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
      incomplete: true,
      finishReason: "error",
    });
  });

  it("surfaces in-band Ollama errors as ProviderError", async () => {
    stubFetchSequence(streamResponse([ndjson({ error: "model 'nope' not found" })]));
    const provider = new LocalProvider(testOptions());
    const err = await collect(provider.stream({ messages: [], model: "nope" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toMatch(/not found/);
  });

  it("aborting mid-NDJSON-stream rejects with abort ProviderError", async () => {
    const controller = new AbortController();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        if (pulls === 1) c.enqueue(new TextEncoder().encode(ndjson({ message: { content: "x" }, done: false })));
      },
    });
    stubFetchSequence(new Response(body, { status: 200 }));
    const provider = new LocalProvider(testOptions());
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

describe("LocalProvider listModels / healthCheck", () => {
  it("lists models via /api/tags", async () => {
    const mock = stubFetchSequence(
      jsonResponse({ models: [{ name: "llama3.2:latest" }, { name: "qwen2.5-coder:7b" }] }),
    );
    const provider = new LocalProvider(testOptions());
    expect(await provider.listModels()).toEqual(["llama3.2:latest", "qwen2.5-coder:7b"]);
    expect((mock.mock.calls[0] as [string])[0]).toBe(`${OLLAMA_BASE_URL}/api/tags`);
  });

  it("healthCheck returns false (not throw) when the Ollama server is down", async () => {
    stubFetchSequence(new TypeError("connect ECONNREFUSED 127.0.0.1:11434"));
    const provider = new LocalProvider(testOptions());
    await expect(provider.healthCheck()).resolves.toBe(false);
  });

  it("healthCheck returns true when /api/tags answers", async () => {
    stubFetchSequence(jsonResponse({ models: [] }));
    const provider = new LocalProvider(testOptions());
    await expect(provider.healthCheck()).resolves.toBe(true);
  });
});
