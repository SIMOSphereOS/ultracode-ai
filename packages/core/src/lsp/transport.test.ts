import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureLogger,
  createFakeChild,
  type FakeChild,
  type FakeResponder,
  frame,
} from "./testutil.test.js";
import {
  encodeFrame,
  JSONRPC_VERSION,
  LspError,
  LspStdioTransport,
  parseContentLength,
} from "./transport.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build an LspStdioTransport wired to a fake child; returns both plus the spawn spy. */
function makeStdio(
  responder: FakeResponder,
  childOverride?: FakeChild,
): { transport: LspStdioTransport; child: FakeChild; spawnFn: ReturnType<typeof vi.fn> } {
  const child = childOverride ?? createFakeChild(responder);
  const spawnFn = vi.fn(() => child as unknown as ChildProcess);
  const transport = new LspStdioTransport({ command: "fake-lsp", args: ["--stdio"], spawnFn });
  return { transport, child, spawnFn };
}

function req(id: number, method: string, params?: unknown) {
  return params !== undefined
    ? { jsonrpc: JSONRPC_VERSION as typeof JSONRPC_VERSION, id, method, params }
    : { jsonrpc: JSONRPC_VERSION as typeof JSONRPC_VERSION, id, method };
}

describe("Content-Length framing helpers", () => {
  it("encodeFrame emits a byte-accurate Content-Length header", () => {
    // "ä" is 2 UTF-8 bytes, so the byte length must exceed the character length.
    const buf = encodeFrame({ jsonrpc: "2.0", id: 1, method: "x", params: { s: "ä" } });
    const text = buf.toString("utf8");
    const bodyStart = text.indexOf("\r\n\r\n") + 4;
    const declared = parseContentLength(text.slice(0, bodyStart));
    const actualBytes = Buffer.byteLength(text.slice(bodyStart), "utf8");
    expect(declared).toBe(actualBytes);
  });

  it("parseContentLength is case-insensitive and ignores other headers", () => {
    expect(parseContentLength("Content-Type: x\r\ncontent-length: 42")).toBe(42);
    expect(parseContentLength("X: 1\r\nY: 2")).toBeUndefined();
  });
});

describe("LspStdioTransport", () => {
  it("spawns and exchanges a request/response over Content-Length frames", async () => {
    const { transport, spawnFn } = makeStdio((message) =>
      "id" in message
        ? [{ jsonrpc: JSONRPC_VERSION, id: message.id, result: { ready: true } }]
        : [],
    );
    await transport.start();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args, opts] = spawnFn.mock.calls[0] as [string, string[], { stdio: unknown }];
    expect(command).toBe("fake-lsp");
    expect(args).toEqual(["--stdio"]);
    expect(opts.stdio).toEqual(["pipe", "pipe", "pipe"]);

    const response = await transport.request(req(1, "initialize"));
    expect(response.id).toBe(1);
    expect(response.result).toEqual({ ready: true });
    await transport.close();
  });

  it("writes outgoing messages using Content-Length framing", async () => {
    const written: Buffer[] = [];
    const child = createFakeChild(() => []);
    child.stdin.on("data", (c: Buffer) => written.push(c));
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    await transport.notify({ jsonrpc: JSONRPC_VERSION, method: "initialized", params: {} });
    const raw = Buffer.concat(written).toString("utf8");
    expect(raw).toMatch(/^Content-Length: \d+\r\n\r\n/);
    expect(raw).toContain('"method":"initialized"');
    await transport.close();
  });

  it("reassembles a frame split across multiple stdout chunks", async () => {
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const pending = transport.request(req(7, "x"), { timeoutMs: 500 });
    const full = frame({ jsonrpc: "2.0", id: 7, result: { split: true } });
    child.emitRaw(full.subarray(0, 6));
    child.emitRaw(full.subarray(6, 20));
    child.emitRaw(full.subarray(20));
    const response = await pending;
    expect(response.result).toEqual({ split: true });
    await transport.close();
  });

  it("dispatches two frames delivered in a single chunk", async () => {
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const p1 = transport.request(req(1, "a"), { timeoutMs: 500 });
    const p2 = transport.request(req(2, "b"), { timeoutMs: 500 });
    const both = Buffer.concat([
      frame({ jsonrpc: "2.0", id: 1, result: { n: 1 } }),
      frame({ jsonrpc: "2.0", id: 2, result: { n: 2 } }),
    ]);
    child.emitRaw(both);
    expect((await p1).result).toEqual({ n: 1 });
    expect((await p2).result).toEqual({ n: 2 });
    await transport.close();
  });

  it("correlates concurrent requests by id (out-of-order replies)", async () => {
    const child = createFakeChild((message) =>
      "id" in message
        ? [{ jsonrpc: JSONRPC_VERSION, id: message.id, result: { echoed: message.id } }]
        : [],
    );
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const [r1, r2] = await Promise.all([
      transport.request(req(1, "a")),
      transport.request(req(2, "b")),
    ]);
    expect(r1.result).toEqual({ echoed: 1 });
    expect(r2.result).toEqual({ echoed: 2 });
    await transport.close();
  });

  it("routes server-pushed notifications to the notification handler", async () => {
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    const seen: Array<{ method: string; params: unknown }> = [];
    transport.onNotification((method, params) => seen.push({ method, params }));
    await transport.start();
    child.emitMessage({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///a.ts", diagnostics: [] },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("textDocument/publishDiagnostics");
    expect(seen[0]?.params).toMatchObject({ uri: "file:///a.ts" });
    await transport.close();
  });

  it("ignores a server-initiated request without crashing", async () => {
    const { logger, logs } = captureLogger();
    const child = createFakeChild(() => []);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const transport = new LspStdioTransport({ command: "fake-lsp", logger, spawnFn });
    await transport.start();
    child.emitMessage({ jsonrpc: "2.0", id: 99, method: "window/showMessageRequest", params: {} });
    await new Promise((resolve) => setImmediate(resolve));
    expect(logs.some((l) => l.level === "debug")).toBe(true);
    await transport.close();
  });

  it("skips a malformed JSON frame without crashing", async () => {
    const { logger, logs } = captureLogger();
    const child = createFakeChild(() => []);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const transport = new LspStdioTransport({ command: "fake-lsp", logger, spawnFn });
    await transport.start();
    const pending = transport.request(req(1, "x"), { timeoutMs: 500 });
    child.emitRaw(Buffer.from("Content-Length: 5\r\n\r\n{bad}", "utf8"));
    child.emitMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    const response = await pending;
    expect(response.result).toEqual({ ok: true });
    expect(logs.some((l) => l.level === "warn")).toBe(true);
    await transport.close();
  });

  it("skips a frame missing a Content-Length header", async () => {
    const { logger, logs } = captureLogger();
    const child = createFakeChild(() => []);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const transport = new LspStdioTransport({ command: "fake-lsp", logger, spawnFn });
    await transport.start();
    const pending = transport.request(req(1, "x"), { timeoutMs: 500 });
    child.emitRaw(Buffer.from("X-Nonsense: 1\r\n\r\n", "utf8"));
    child.emitMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    const response = await pending;
    expect(response.result).toEqual({ ok: true });
    expect(logs.some((l) => l.level === "warn")).toBe(true);
    await transport.close();
  });

  it("rejects a request that exceeds its timeout", async () => {
    const child = createFakeChild(() => []); // never answers
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const err = await transport.request(req(1, "x"), { timeoutMs: 20 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).message).toMatch(/timed out/);
    await transport.close();
  });

  it("rejects all pending requests when the process exits", async () => {
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const pending = transport.request(req(1, "x"), { timeoutMs: 5_000 });
    child.emit("exit", 1, null);
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).message).toMatch(/exited/);
  });

  it("rejects start() with LspError when the process fails to spawn", async () => {
    const child = createFakeChild(() => [], { spawnError: new Error("ENOENT") });
    const { transport } = makeStdio(() => [], child);
    const err = await transport.start().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).message).toMatch(/spawn/i);
  });

  it("honours the caller abort signal on a pending request", async () => {
    const controller = new AbortController();
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const pending = transport.request(req(1, "x"), { timeoutMs: 5_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).details?.aborted).toBe(true);
    await transport.close();
  });

  it("rejects requests made after close", async () => {
    const { transport } = makeStdio(() => []);
    await transport.start();
    await transport.close();
    const err = await transport.request(req(1, "x")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).message).toMatch(/closed/);
  });
});
