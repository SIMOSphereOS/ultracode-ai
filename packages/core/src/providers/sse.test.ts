import { describe, expect, it } from "vitest";
import { parseNDJSON, parseSSEEvents, parseSSEJson, streamLines } from "./sse.js";
import { captureLogger, collect, streamFromChunks } from "./testkit.test.js";

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
    const events = await collect(parseSSEEvents(streamFromChunks(["data: a\r\n\r\ndata: b\r\n\r\n"])));
    expect(events).toEqual([{ data: "a" }, { data: "b" }]);
  });
});

describe("parseSSEJson", () => {
  it("stops at the [DONE] sentinel", async () => {
    const { logger } = captureLogger();
    const events = await collect(
      parseSSEJson(streamFromChunks(['data: {"x":1}\n\ndata: [DONE]\n\ndata: {"x":2}\n\n']), logger),
    );
    expect(events).toEqual([{ json: { x: 1 } }]);
  });

  it("logs and skips broken JSON lines without aborting the stream", async () => {
    const { logger, logs } = captureLogger();
    const events = await collect(
      parseSSEJson(streamFromChunks(['data: {"ok":1}\n\ndata: {broken\n\ndata: {"ok":2}\n\n']), logger),
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
});
