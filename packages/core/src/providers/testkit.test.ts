/**
 * Shared test helpers for the provider test suites.
 *
 * Named `*.test.ts` so it is excluded from the build; contains a smoke test so
 * vitest accepts the file.
 */

import type { Logger, ProviderOptions } from "ultracode-shared";
import { describe, expect, it, vi } from "vitest";

/** Build a `ReadableStream<Uint8Array>` from string/byte chunks. */
export function streamFromChunks(
  chunks: ReadonlyArray<string | Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const chunk = chunks[i++] as string | Uint8Array;
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      } else {
        controller.close();
      }
    },
  });
}

/** A JSON `Response` with status 200 (or as given). */
export function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/** A streaming `Response` whose body is built from the given chunks. */
export function streamResponse(chunks: ReadonlyArray<string | Uint8Array>): Response {
  return new Response(streamFromChunks(chunks), { status: 200 });
}

/** Encode one OpenAI-style SSE event line. */
export function sse(data: unknown): string {
  return `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
}

/** Default provider options for tests (fast retries, short timeout). */
export function testOptions(overrides: Partial<ProviderOptions> = {}): ProviderOptions {
  return { apiKey: "test-key", timeoutMs: 5_000, maxRetries: 2, retryDelayMs: 1, ...overrides };
}

/** Logger capturing all calls for assertions. */
export interface CapturedLog {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  meta?: Record<string, unknown>;
}

/** Create a capturing logger plus its log buffer. */
export function captureLogger(): { logger: Logger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = [];
  const push =
    (level: CapturedLog["level"]) =>
    (msg: string, meta?: Record<string, unknown>): void => {
      const entry: CapturedLog = { level, msg };
      if (meta !== undefined) entry.meta = meta;
      logs.push(entry);
    };
  return {
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
    logs,
  };
}

/** Collect an async iterable into an array. */
export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

/**
 * Install a mocked global `fetch` returning the given responses in order
 * (factories are invoked lazily, so streams are fresh per call).
 * Returns the mock for call assertions.
 */
export function stubFetchSequence(
  ...responses: Array<Response | (() => Response | Promise<Response>) | Error>
): ReturnType<typeof vi.fn> {
  let call = 0;
  const mock = vi.fn(async (_url: unknown, _init?: unknown): Promise<Response> => {
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next();
    if (next === undefined) throw new Error("stubFetchSequence: no response configured");
    return next;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/**
 * Install a mocked global `fetch` that never resolves on its own but rejects
 * with an `AbortError` when the request's signal aborts (simulates a hung
 * server for timeout/abort tests).
 */
export function stubHangingFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    (_url: unknown, init?: { signal?: AbortSignal }): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal === undefined) return;
        const onAbort = (): void =>
          reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("testkit", () => {
  it("streams chunks back as bytes", async () => {
    const reader = streamFromChunks(["a", "b"]).getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("a");
  });
});
