import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  parseNDJSON,
  parseSSEEvents,
  parseSSEJson,
  StreamIdleTimeoutError,
  streamLines,
} from "./sse.js";
import { captureLogger, collect, streamFromChunks } from "./testkit.test.js";

/**
 * Build a stream that emits `head` chunks then stalls forever (never enqueues
 * again, never closes) — models a hung provider body. The returned `feed`
 * pushes additional chunks; `close` ends the stream cleanly.
 */
function stallingStream(head: ReadonlyArray<string>): {
  stream: ReadableStream<Uint8Array>;
  feed: (chunk: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      for (const chunk of head) controller.enqueue(encoder.encode(chunk));
    },
  });
  return {
    stream,
    feed: (chunk: string) => ctrl.enqueue(encoder.encode(chunk)),
    close: () => ctrl.close(),
  };
}

describe("streamLines", () => {
  it("splits lines across arbitrary chunk boundaries", async () => {
    const lines = await collect(streamLines(streamFromChunks(["hel", "lo\nwor", "ld\n", "tail"])));
    expect(lines).toEqual(["hello", "world", "tail"]);
  });

  it("handles \\r\\n line endings", async () => {
    const lines = await collect(streamLines(streamFromChunks(["a\r\nb\r", "\nc\r\n"])));
    expect(lines).toEqual(["a", "b", "c"]);
  });

  it("handles UTF-8 sequences split mid-character (emoji across chunks)", async () => {
    const bytes = new TextEncoder().encode("🎉🦄\n");
    const lines = await collect(
      streamLines(streamFromChunks([bytes.slice(0, 2), bytes.slice(2, 5), bytes.slice(5)])),
    );
    expect(lines).toEqual(["🎉🦄"]);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect(streamLines(streamFromChunks([])))).toEqual([]);
  });

  it("handles a single huge line (>= 1 MB)", async () => {
    const big = "x".repeat(1_048_576);
    const chunks: string[] = [];
    for (let i = 0; i < big.length; i += 65_536) chunks.push(big.slice(i, i + 65_536));
    chunks.push("\n");
    const lines = await collect(streamLines(streamFromChunks(chunks)));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(1_048_576);
  });

  it("throws the abort reason when the signal aborts mid-stream", async () => {
    const controller = new AbortController();
    const iterator = streamLines(streamFromChunks(["a\n", "b\n", "c\n"]), controller.signal);
    const first = await iterator.next();
    expect(first.value).toBe("a");
    controller.abort(new Error("user abort"));
    await expect(iterator.next()).rejects.toThrow("user abort");
  });

  it("throws immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const iterator = streamLines(streamFromChunks(["a\n"]), controller.signal);
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects with an idle-timeout error when the stream stalls after a chunk", async () => {
    const { stream } = stallingStream(["first\n"]);
    const iterator = streamLines(stream, undefined, 20);
    const first = await iterator.next();
    expect(first.value).toBe("first");
    // No further data arrives within the idle window → idle timeout fires.
    await expect(iterator.next()).rejects.toBeInstanceOf(StreamIdleTimeoutError);
  });

  it("does not time out while data keeps arriving within the idle window", async () => {
    const { stream, feed, close } = stallingStream(["a\n"]);
    const idleMs = 40;
    const iterator = streamLines(stream, undefined, idleMs);
    expect((await iterator.next()).value).toBe("a");
    // Emit two more lines, each well within the idle window, resetting the timer.
    for (const line of ["b", "c"]) {
      await new Promise((r) => setTimeout(r, idleMs / 2));
      feed(`${line}\n`);
      expect((await iterator.next()).value).toBe(line);
    }
    close();
    expect((await iterator.next()).done).toBe(true);
  });

  it("lets the caller's abort win over the idle timeout", async () => {
    const { stream } = stallingStream(["x\n"]);
    const controller = new AbortController();
    const iterator = streamLines(stream, controller.signal, 10_000);
    expect((await iterator.next()).value).toBe("x");
    controller.abort(new Error("user abort"));
    await expect(iterator.next()).rejects.toThrow("user abort");
  });

  it("disables the watchdog for a non-positive idle timeout", async () => {
    const lines = await collect(streamLines(streamFromChunks(["a\n", "b\n"]), undefined, 0));
    expect(lines).toEqual(["a", "b"]);
  });

  it("exposes a default idle window consistent with provider timeouts", () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("parseSSEEvents", () => {
  it("parses events torn across chunk boundaries", async () => {
    const events = await collect(
      parseSSEEvents(streamFromChunks(['data: {"a"', ":1}\n", "\nda", 'ta: {"b":2}\n\n'])),
    );
    expect(events).toEqual([{ data: '{"a":1}' }, { data: '{"b":2}' }]);
  });

  it("joins multi-line data and reads event names", async () => {
    const events = await collect(
      parseSSEEvents(streamFromChunks(["event: message_start\ndata: line1\ndata: line2\n\n"])),
    );
    expect(events).toEqual([{ event: "message_start", data: "line1\nline2" }]);
  });

  it("skips comment lines and flushes a trailing event without final blank line", async () => {
    const events = await collect(parseSSEEvents(streamFromChunks([": keep-alive\ndata: tail"])));
    expect(events).toEqual([{ data: "tail" }]);
  });

  it("handles \\r\\n separated SSE", async () => {
    const events = await collect(
      parseSSEEvents(streamFromChunks(["data: a\r\n\r\ndata: b\r\n\r\n"])),
    );
    expect(events).toEqual([{ data: "a" }, { data: "b" }]);
  });
});

describe("parseSSEJson", () => {
  it("stops at the [DONE] sentinel", async () => {
    const { logger } = captureLogger();
    const events = await collect(
      parseSSEJson(
        streamFromChunks(['data: {"x":1}\n\ndata: [DONE]\n\ndata: {"x":2}\n\n']),
        logger,
      ),
    );
    expect(events).toEqual([{ json: { x: 1 } }]);
  });

  it("logs and skips broken JSON lines without aborting the stream", async () => {
    const { logger, logs } = captureLogger();
    const events = await collect(
      parseSSEJson(
        streamFromChunks(['data: {"ok":1}\n\ndata: {broken\n\ndata: {"ok":2}\n\n']),
        logger,
      ),
    );
    expect(events.map((e) => e.json)).toEqual([{ ok: 1 }, { ok: 2 }]);
    expect(logs.some((l) => l.level === "warn" && l.msg.includes("malformed JSON"))).toBe(true);
  });

  it("handles unicode/emoji/surrogate payloads", async () => {
    const { logger } = captureLogger();
    const payload = { text: "Grüße 🎉 \u{1F984} 😀" };
    const events = await collect(
      parseSSEJson(streamFromChunks([`data: ${JSON.stringify(payload)}\n\n`]), logger),
    );
    expect(events).toEqual([{ json: payload }]);
  });

  it("surfaces an idle timeout from a stalled SSE body", async () => {
    const { logger } = captureLogger();
    const { stream } = stallingStream(['data: {"x":1}\n\n']);
    const iterator = parseSSEJson(stream, logger, undefined, 20);
    expect((await iterator.next()).value).toEqual({ json: { x: 1 } });
    await expect(iterator.next()).rejects.toBeInstanceOf(StreamIdleTimeoutError);
  });
});

describe("parseNDJSON", () => {
  it("parses NDJSON lines and skips empty + broken lines", async () => {
    const { logger, logs } = captureLogger();
    const items = await collect(
      parseNDJSON(streamFromChunks(['{"a":1}\n', "\n", "not-json\n", '{"b"', ":2}\n"]), logger),
    );
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
    expect(logs.filter((l) => l.level === "warn")).toHaveLength(1);
  });

  it("surfaces an idle timeout from a stalled NDJSON body", async () => {
    const { logger } = captureLogger();
    const { stream } = stallingStream(['{"a":1}\n']);
    const iterator = parseNDJSON(stream, logger, undefined, 20);
    expect((await iterator.next()).value).toEqual({ a: 1 });
    await expect(iterator.next()).rejects.toBeInstanceOf(StreamIdleTimeoutError);
  });
});
