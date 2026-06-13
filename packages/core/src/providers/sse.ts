/**
 * Streaming-body parsing utilities for LLM providers.
 *
 * Three robust, dependency-free parsers over `ReadableStream<Uint8Array>`:
 *
 * - {@link streamLines} — splits a byte stream into text lines, tolerant of
 *   `\r\n` and `\n` endings, chunk boundaries in the middle of lines and even
 *   in the middle of multi-byte UTF-8 sequences.
 * - {@link parseSSEEvents} — parses `text/event-stream` payloads into discrete
 *   events (multi-line `data:` accumulation, comments, `event:` names).
 * - {@link parseSSEJson} — convenience layer that JSON-parses each SSE `data`
 *   payload, honours the `[DONE]` sentinel and logs-and-skips broken JSON.
 * - {@link parseNDJSON} — newline-delimited JSON (Ollama wire format), broken
 *   lines are logged and skipped.
 *
 * All parsers accept an optional `AbortSignal`; abort is observed between (and
 * during) reads, the underlying reader is cancelled, and the abort reason is
 * thrown to the consumer.
 *
 * All parsers also enforce a streaming inactivity watchdog (`idleTimeoutMs`,
 * default {@link DEFAULT_IDLE_TIMEOUT_MS}): the timer is reset on every chunk
 * read and a stalled body rejects with a {@link StreamIdleTimeoutError} once the
 * window elapses. The caller's `AbortSignal` always takes precedence over the
 * idle timeout.
 */

import type { CompletionChunk, FinishReason, TokenUsage } from "ultracode-shared";
import type { Logger } from "ultracode-shared";

/**
 * Terminal `"done"` chunk augmented with provider-local stream-completion
 * metadata.
 *
 * The shared {@link CompletionChunk} contract is frozen and only declares
 * `type`/`usage` for the terminal chunk. When a streaming body ends WITHOUT a
 * proper terminal signal (OpenAI: the `[DONE]` sentinel; Anthropic:
 * `message_stop`/`message_delta`; Ollama: a `done: true` line) the provider can
 * neither trust the usage nor a guessed finish reason. Rather than silently
 * reporting zeroed usage and a fabricated `finishReason`, providers yield this
 * structurally-extended chunk: `incomplete: true` flags the truncation and
 * `finishReason` carries the best-known value so a careful consumer can detect
 * the cut-off. Plain {@link CompletionChunk} consumers ignore the extra fields,
 * so the change is backward-compatible.
 */
export interface TerminalCompletionChunk extends CompletionChunk {
  type: "done";
  usage: TokenUsage;
  /** Best-known finish reason; present when the stream ended without a terminal event. */
  finishReason?: FinishReason;
  /** `true` when the stream ended before a proper terminal signal was observed. */
  incomplete?: boolean;
}

/**
 * Default streaming idle timeout (ms).
 *
 * A streaming body that produces no data for longer than this window is
 * considered stalled and aborted. `fetch()`'s per-request timeout only covers
 * the headers (it resolves once they arrive), so without this watchdog a hung
 * provider stream would wedge the run forever — notably on the non-interactive
 * `run -p` path, which passes no external abort signal. Reuses the same order
 * of magnitude as the providers' default per-request `timeoutMs`.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/**
 * Error thrown when a streaming body stalls (no data within the idle window).
 * `BaseProvider.toProviderError` recognises it and maps it onto a retryable
 * timeout `ProviderError`, mirroring the existing per-request timeout path.
 */
export class StreamIdleTimeoutError extends Error {
  /** Always true: lets `BaseProvider.toProviderError` flag a retryable timeout. */
  public readonly isIdleTimeout = true;
  constructor(public readonly idleTimeoutMs: number) {
    super(`Stream stalled: no data received within ${idleTimeoutMs}ms`);
    this.name = "StreamIdleTimeoutError";
    // Restore prototype chain so `instanceof` works after transpilation/bundling.
    Object.setPrototypeOf(this, StreamIdleTimeoutError.prototype);
  }
}

/** A single parsed Server-Sent Event. */
export interface SSEEvent {
  /** Value of the `event:` field, when present. */
  event?: string;
  /** Concatenated `data:` payload (multi-line data joined with `\n`). */
  data: string;
}

/** Build the error thrown when an abort signal fires. */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

/**
 * Await `promise` but reject immediately when `signal` aborts.
 * The temporary abort listener is always removed.
 */
async function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) throw abortReason(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Race `reader.read()` against the caller's abort signal AND an inactivity
 * watchdog. The idle timer is (re)armed before each read and cleared as soon as
 * data (or `done`) arrives; if it elapses first the read rejects with a
 * {@link StreamIdleTimeoutError}. The caller's external abort always wins: it is
 * composed in via {@link raceAbort}, never replaced.
 */
async function readWithIdleTimeout<T>(
  read: Promise<T>,
  signal: AbortSignal | undefined,
  idleTimeoutMs: number,
): Promise<T> {
  // Non-positive timeout disables the watchdog (idle protection opt-out).
  if (!(idleTimeoutMs > 0)) return raceAbort(read, signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StreamIdleTimeoutError(idleTimeoutMs)), idleTimeoutMs);
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }
  });
  try {
    return await Promise.race([raceAbort(read, signal), idle]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Split a byte stream into text lines.
 *
 * Handles `\r\n` and `\n` line endings, lines split across arbitrary chunk
 * boundaries (including mid-UTF-8-sequence) and a trailing line without a
 * final newline. Cancels the reader on early exit or abort.
 *
 * An inactivity watchdog (`idleTimeoutMs`, default {@link DEFAULT_IDLE_TIMEOUT_MS})
 * guards every read: the timer is reset on every chunk, and a stalled stream
 * rejects with a {@link StreamIdleTimeoutError} once the window elapses. Pass a
 * non-positive value to disable it. The caller's `signal` always takes
 * precedence over the idle timeout.
 */
export async function* streamLines(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
): AsyncGenerator<string, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      if (signal?.aborted) throw abortReason(signal);
      // Idle timer is armed here and reset implicitly on the next loop turn,
      // i.e. once a chunk (or `done`) is observed.
      const { done, value } = await readWithIdleTimeout(reader.read(), signal, idleTimeoutMs);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer.length > 0) {
      yield buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* the stream may already be closed/errored — ignore */
    }
    try {
      reader.releaseLock();
    } catch {
      /* lock may already be released — ignore */
    }
  }
}

/**
 * Parse a `text/event-stream` body into discrete {@link SSEEvent}s.
 *
 * Implements the SSE field grammar pragmatically: `data:` lines accumulate
 * (joined by `\n`), `event:` sets the event name, comment lines (leading `:`)
 * are skipped, a blank line dispatches the pending event. A pending event at
 * end-of-stream is flushed.
 */
export async function* parseSSEEvents(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
): AsyncGenerator<SSEEvent, void, undefined> {
  let dataLines: string[] = [];
  let eventName: string | undefined;
  for await (const line of streamLines(stream, signal, idleTimeoutMs)) {
    if (line === "") {
      if (dataLines.length > 0) {
        const out: SSEEvent = { data: dataLines.join("\n") };
        if (eventName !== undefined) out.event = eventName;
        yield out;
      }
      dataLines = [];
      eventName = undefined;
      continue;
    }
    if (line.startsWith(":")) continue; // SSE comment
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
    else if (field === "event") eventName = value;
    // `id:` / `retry:` are irrelevant for our providers and ignored.
  }
  if (dataLines.length > 0) {
    const out: SSEEvent = { data: dataLines.join("\n") };
    if (eventName !== undefined) out.event = eventName;
    yield out;
  }
}

/** A JSON-parsed SSE event. */
export interface SSEJsonEvent {
  /** Value of the `event:` field, when present. */
  event?: string;
  /** Parsed `data` payload. */
  json: unknown;
}

/**
 * Parse a `text/event-stream` body into JSON payloads.
 *
 * - Stops cleanly at the `[DONE]` sentinel (OpenAI-style streams).
 * - Broken JSON payloads are logged via `logger.warn` and skipped — they never
 *   abort the stream.
 */
export async function* parseSSEJson(
  stream: ReadableStream<Uint8Array>,
  logger: Logger,
  signal?: AbortSignal,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
): AsyncGenerator<SSEJsonEvent, void, undefined> {
  for await (const evt of parseSSEEvents(stream, signal, idleTimeoutMs)) {
    const data = evt.data.trim();
    if (data === "[DONE]") return;
    if (data === "") continue;
    try {
      const json: unknown = JSON.parse(data);
      const out: SSEJsonEvent = { json };
      if (evt.event !== undefined) out.event = evt.event;
      yield out;
    } catch {
      logger.warn("Skipping malformed JSON in SSE stream", {
        data: data.length > 200 ? `${data.slice(0, 200)}…` : data,
      });
    }
  }
}

/**
 * Parse a newline-delimited JSON (NDJSON) body, as produced by Ollama's
 * streaming chat endpoint. Broken lines are logged and skipped.
 */
export async function* parseNDJSON(
  stream: ReadableStream<Uint8Array>,
  logger: Logger,
  signal?: AbortSignal,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
): AsyncGenerator<unknown, void, undefined> {
  for await (const line of streamLines(stream, signal, idleTimeoutMs)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      yield JSON.parse(trimmed) as unknown;
    } catch {
      logger.warn("Skipping malformed NDJSON line", {
        line: trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed,
      });
    }
  }
}
