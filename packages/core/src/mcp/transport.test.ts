import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSONRPC_VERSION, McpError } from "./jsonRpc.js";
import {
  captureLogger,
  createFakeChild,
  defaultResponder,
  type FakeChild,
  type FakeResponder,
} from "./testutil.test.js";
import { HttpTransport, StdioTransport } from "./transport.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a StdioTransport wired to a fake child; returns both plus the spawn spy. */
function makeStdio(
  responder: FakeResponder,
  childOverride?: FakeChild,
): { transport: StdioTransport; child: FakeChild; spawnFn: ReturnType<typeof vi.fn> } {
  const child = childOverride ?? createFakeChild(responder);
  const spawnFn = vi.fn(() => child as unknown as ChildProcess);
  const transport = new StdioTransport({ command: "fake-mcp", args: ["--stdio"], spawnFn });
  return { transport, child, spawnFn };
}

function req(id: number, method: string, params?: unknown) {
  return params !== undefined
    ? { jsonrpc: JSONRPC_VERSION as typeof JSONRPC_VERSION, id, method, params }
    : { jsonrpc: JSONRPC_VERSION as typeof JSONRPC_VERSION, id, method };
}

describe("StdioTransport", () => {
  it("spawns, exchanges a request/response over newline-delimited JSON", async () => {
    const { transport, spawnFn } = makeStdio(
      defaultResponder([{ name: "t" }], () => ({ content: [] })),
    );
    await transport.start();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args, opts] = spawnFn.mock.calls[0] as [string, string[], { stdio: unknown }];
    expect(command).toBe("fake-mcp");
    expect(args).toEqual(["--stdio"]);
    expect(opts.stdio).toEqual(["pipe", "pipe", "pipe"]);

    const response = await transport.request(req(1, "initialize"));
    expect(response.id).toBe(1);
    expect(response.result).toMatchObject({ serverInfo: { name: "fake-server" } });
    await transport.close();
  });

  it("correlates concurrent requests by id", async () => {
    // Server replies out of order: id 2 first, then id 1.
    const child = createFakeChild((message) => {
      if (!("id" in message)) return [];
      return [{ jsonrpc: JSONRPC_VERSION, id: message.id, result: { echoed: message.id } }];
    });
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

  it("skips malformed JSON lines without crashing", async () => {
    const { logger, logs } = captureLogger();
    const child = createFakeChild(() => []);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const transport = new StdioTransport({ command: "fake", logger, spawnFn });
    await transport.start();
    const pending = transport.request(req(1, "x"), { timeoutMs: 200 });
    child.emitLine("this is not json");
    child.emitLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
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
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(/timed out/);
    await transport.close();
  });

  it("rejects all pending requests when the process exits", async () => {
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const pending = transport.request(req(1, "x"), { timeoutMs: 5_000 });
    child.emit("exit", 1, null);
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(/exited/);
  });

  it("rejects start() with McpError when the process fails to spawn", async () => {
    const child = createFakeChild(() => [], { spawnError: new Error("ENOENT") });
    const { transport } = makeStdio(() => [], child);
    const err = await transport.start().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(/spawn/i);
  });

  it("honours the caller abort signal on a pending request", async () => {
    const controller = new AbortController();
    const child = createFakeChild(() => []);
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    const pending = transport.request(req(1, "x"), {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 5);
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).details?.aborted).toBe(true);
    await transport.close();
  });

  it("notify writes without expecting a response", async () => {
    const written: string[] = [];
    const child = createFakeChild(() => []);
    child.stdin.on("data", (c: Buffer) => written.push(c.toString("utf8")));
    const { transport } = makeStdio(() => [], child);
    await transport.start();
    await transport.notify({ jsonrpc: JSONRPC_VERSION, method: "notifications/initialized" });
    expect(written.join("")).toContain("notifications/initialized");
    await transport.close();
  });
});

/** A minimal Response factory for the HTTP transport tests. */
function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function sseResponse(events: string[]): Response {
  return new Response(events.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("HttpTransport", () => {
  it("POSTs JSON-RPC and parses a JSON response, sending bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 7, result: { pong: true } }),
    );
    const transport = new HttpTransport({
      url: "https://mcp.example/rpc",
      apiKey: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const response = await transport.request(req(7, "ping"));
    expect(response.result).toEqual({ pong: true });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mcp.example/rpc");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toMatchObject({ id: 7, method: "ping" });
  });

  it("parses a JSON-RPC response delivered as an SSE stream", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        `data: ${JSON.stringify({ jsonrpc: "2.0", id: 3, result: { via: "sse" } })}\n\n`,
      ]),
    );
    const transport = new HttpTransport({
      url: "https://mcp.example/rpc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const response = await transport.request(req(3, "ping"));
    expect(response.result).toEqual({ via: "sse" });
  });

  it("throws McpError on a non-2xx status", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const transport = new HttpTransport({
      url: "https://mcp.example/rpc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const err = await transport.request(req(1, "ping")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).details).toMatchObject({ status: 500 });
  });

  it("throws McpError when the id does not match", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ jsonrpc: "2.0", id: 999, result: {} }));
    const transport = new HttpTransport({
      url: "https://mcp.example/rpc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const err = await transport.request(req(1, "ping")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(/matching JSON-RPC id/);
  });

  it("times out a hung request", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const transport = new HttpTransport({
      url: "https://mcp.example/rpc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const err = await transport.request(req(1, "ping"), { timeoutMs: 15 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(/timed out/);
  });
});
