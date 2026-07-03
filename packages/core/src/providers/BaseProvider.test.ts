import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ProviderOptions,
} from "ultracode-shared";
import { ProviderError } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseProvider, isRetryableStatus, parseRetryAfter } from "./BaseProvider.js";
import { LocalProvider } from "./LocalProvider.js";
import { StreamIdleTimeoutError } from "./sse.js";
import { captureLogger, stubFetchSequence, stubHangingFetch, testOptions } from "./testkit.test.js";

/** Minimal concrete subclass exposing the protected HTTP layer. */
class TestProvider extends BaseProvider {
  public readonly name = "test";
  constructor(options: ProviderOptions) {
    super(options, captureLogger().logger);
  }
  public request(
    url: string,
    init?: Parameters<BaseProvider["fetchWithRetry"]>[1],
  ): Promise<Response> {
    return this.fetchWithRetry(url, init);
  }
  public mapError(err: unknown, signal?: AbortSignal): ProviderError {
    return this.toProviderError(err, "Streaming from test failed", signal);
  }
  public idleTimeout(): number {
    return this.streamIdleTimeoutMs();
  }
  public drive(
    stream: AsyncIterable<CompletionChunk>,
    onChunk: (c: CompletionChunk) => void,
    onConsumerError?: (err: unknown, c: CompletionChunk) => void,
  ): Promise<CompletionChunk | undefined> {
    return this.consumeStream(stream, onChunk, onConsumerError);
  }
  public listModels(): Promise<string[]> {
    return Promise.resolve([]);
  }
  public complete(_req: CompletionRequest): Promise<CompletionResult> {
    return Promise.reject(new Error("unused"));
  }
  // eslint-disable-next-line require-yield
  public async *stream(_req: CompletionRequest): AsyncIterable<CompletionChunk> {
    return;
  }
  public healthCheck(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("2")).toBe(2_000);
  });
  it("parses HTTP-dates relative to now", () => {
    const now = Date.parse("2026-06-11T12:00:00Z");
    expect(parseRetryAfter("Thu, 11 Jun 2026 12:00:05 GMT", now)).toBe(5_000);
  });
  it("clamps past dates to 0 and rejects garbage", () => {
    const now = Date.parse("2026-06-11T12:00:00Z");
    expect(parseRetryAfter("Thu, 11 Jun 2026 11:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
  });
});

describe("isRetryableStatus", () => {
  it("flags 408/429/5xx and not 4xx", () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("BaseProvider.fetchWithRetry", () => {
  it("retries a 429 with Retry-After and then succeeds", async () => {
    const mock = stubFetchSequence(
      () => new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
      () => new Response("ok", { status: 200 }),
    );
    const provider = new TestProvider(testOptions());
    const response = await provider.request("https://example.test/x");
    expect(response.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("exhausts maxRetries on persistent 500s and throws retryable ProviderError", async () => {
    const mock = stubFetchSequence(() => new Response("boom", { status: 500 }));
    const provider = new TestProvider(testOptions({ maxRetries: 2, retryDelayMs: 1 }));
    const err = await provider.request("https://example.test/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    const pe = err as ProviderError;
    expect(pe.retryable).toBe(true);
    expect(pe.statusCode).toBe(500);
    expect(pe.provider).toBe("test");
    expect(mock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry a 401 and marks it non-retryable", async () => {
    const mock = stubFetchSequence(() => new Response("nope", { status: 401 }));
    const provider = new TestProvider(testOptions({ maxRetries: 5 }));
    const err = await provider.request("https://example.test/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).statusCode).toBe(401);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors and surfaces them as retryable when exhausted", async () => {
    const mock = stubFetchSequence(new TypeError("fetch failed"));
    const provider = new TestProvider(testOptions({ maxRetries: 1, retryDelayMs: 1 }));
    const err = await provider.request("https://example.test/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request and reports a retryable timeout error", async () => {
    const mock = stubHangingFetch();
    const provider = new TestProvider(testOptions({ timeoutMs: 25, maxRetries: 0 }));
    const err = await provider.request("https://example.test/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as ProviderError).message).toMatch(/timed out/);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("gives the caller's abort signal precedence over retries", async () => {
    const controller = new AbortController();
    let calls = 0;
    const mock = vi.fn(async (): Promise<Response> => {
      calls += 1;
      controller.abort(new Error("user cancelled"));
      return new Response("boom", { status: 500 });
    });
    vi.stubGlobal("fetch", mock);
    const provider = new TestProvider(testOptions({ maxRetries: 5, retryDelayMs: 1 }));
    const err = await provider
      .request("https://example.test/x", { signal: controller.signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect(
      (err as ProviderError).details?.aborted ?? (err as ProviderError).statusCode,
    ).toBeTruthy();
    expect(calls).toBe(1); // no retry after abort
  });

  it("rejects immediately when called with an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = stubFetchSequence(() => new Response("ok"));
    const provider = new TestProvider(testOptions());
    const err = await provider
      .request("https://example.test/x", { signal: controller.signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).details?.aborted).toBe(true);
    expect(mock).not.toHaveBeenCalled();
  });

  it("aborts the in-flight fetch when the caller aborts mid-request", async () => {
    stubHangingFetch();
    const controller = new AbortController();
    const provider = new TestProvider(testOptions({ timeoutMs: 60_000, maxRetries: 3 }));
    const pending = provider.request("https://example.test/x", { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stop now")), 10);
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).message).toMatch(/aborted/i);
  });
});

describe("BaseProvider.consumeStream (consumer isolation)", () => {
  async function* chunks(...items: CompletionChunk[]): AsyncIterable<CompletionChunk> {
    for (const item of items) yield item;
  }

  it("keeps streaming when the consumer throws and still returns the done chunk", async () => {
    const provider = new TestProvider(testOptions());
    const seen: string[] = [];
    let consumerErrors = 0;
    const stream = chunks(
      { type: "text", text: "a" },
      { type: "text", text: "boom" },
      { type: "text", text: "b" },
      { type: "done", usage: { inputTokens: 1, outputTokens: 2 } },
    );
    const done = await provider.drive(
      stream,
      (c) => {
        if (c.text === "boom") throw new Error("consumer blew up");
        if (c.type === "text") seen.push(c.text ?? "");
      },
      () => {
        consumerErrors += 1;
      },
    );
    // Every chunk after the throwing one was still delivered; cleanup completed.
    expect(seen).toEqual(["a", "b"]);
    expect(consumerErrors).toBe(1);
    expect(done).toEqual({ type: "done", usage: { inputTokens: 1, outputTokens: 2 } });
  });

  it("does not swallow errors raised by the stream itself", async () => {
    const provider = new TestProvider(testOptions());
    async function* faulty(): AsyncIterable<CompletionChunk> {
      yield { type: "text", text: "a" };
      throw new Error("stream failed");
    }
    const err = await provider.drive(faulty(), () => {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/stream failed/);
  });

  it("survives a consumer that throws AND a faulty error sink", async () => {
    const provider = new TestProvider(testOptions());
    let delivered = 0;
    const done = await provider.drive(
      chunks(
        { type: "text", text: "x" },
        { type: "done", usage: { inputTokens: 0, outputTokens: 0 } },
      ),
      () => {
        delivered += 1;
        throw new Error("always throws");
      },
      () => {
        throw new Error("error sink also throws");
      },
    );
    expect(delivered).toBe(2);
    expect(done?.type).toBe("done");
  });
});

describe("BaseProvider streaming idle timeout", () => {
  it("reuses the per-request timeout as the stream idle window", () => {
    const provider = new TestProvider(testOptions({ timeoutMs: 12_345 }));
    expect(provider.idleTimeout()).toBe(12_345);
  });

  it("maps a StreamIdleTimeoutError onto a retryable timeout ProviderError", () => {
    const provider = new TestProvider(testOptions());
    const mapped = provider.mapError(new StreamIdleTimeoutError(750));
    expect(mapped).toBeInstanceOf(ProviderError);
    expect(mapped.retryable).toBe(true);
    expect(mapped.provider).toBe("test");
    expect(mapped.message).toMatch(/stalled/i);
    expect(mapped.details?.timeout).toBe(true);
    expect(mapped.details?.idleTimeoutMs).toBe(750);
  });

  it("lets the caller's abort win over an idle timeout when mapping", () => {
    const provider = new TestProvider(testOptions());
    const controller = new AbortController();
    controller.abort(new Error("user cancelled"));
    const mapped = provider.mapError(new StreamIdleTimeoutError(750), controller.signal);
    expect(mapped.retryable).toBe(false);
    expect(mapped.details?.aborted).toBe(true);
    expect(mapped.message).toMatch(/aborted/i);
  });

  it("end-to-end: a real provider stream wires its configured timeout into the idle watchdog", async () => {
    // Drive an ACTUAL provider streaming method (LocalProvider.stream) with a
    // distinctively small configured `timeoutMs`. The body emits one NDJSON
    // line then stalls forever, so the parser's idle watchdog must fire — but
    // only if the provider actually passed `streamIdleTimeoutMs()` (= the
    // configured value) as the parser's 4th argument. The surfaced timeout
    // ProviderError carries `idleTimeoutMs`, which we assert equals the
    // CONFIGURED value (not the 60s parser default), proving the configurable
    // path end-to-end rather than just the helper in isolation.
    const configuredTimeoutMs = 20;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"message":{"content":"hi"}}\n'));
        // Never close / never enqueue again: the body stalls until the watchdog.
      },
    });
    stubFetchSequence(() => new Response(body, { status: 200 }));
    const provider = new LocalProvider(
      testOptions({ timeoutMs: configuredTimeoutMs }),
      captureLogger().logger,
    );

    const err = await (async () => {
      try {
        for await (const _ of provider.stream({ model: "m", messages: [] })) {
          /* drain the first text chunk, then stall until the idle watchdog */
        }
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect(err).toBeInstanceOf(ProviderError);
    const pe = err as ProviderError;
    expect(pe.retryable).toBe(true);
    expect(pe.message).toMatch(/stalled/i);
    expect(pe.details?.timeout).toBe(true);
    // The configured timeout (not DEFAULT_IDLE_TIMEOUT_MS = 60_000) flowed
    // through streamIdleTimeoutMs() into the parser's watchdog.
    expect(pe.details?.idleTimeoutMs).toBe(configuredTimeoutMs);
    expect(pe.cause).toBeInstanceOf(StreamIdleTimeoutError);
    expect((pe.cause as StreamIdleTimeoutError).idleTimeoutMs).toBe(configuredTimeoutMs);
  });
});
