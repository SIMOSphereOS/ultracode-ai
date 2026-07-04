import { describe, expect, it } from "vitest";
import { LspClient, parseDiagnostics } from "./LspClient.js";
import { ScriptedTransport } from "./testutil.test.js";
import type { JsonRpcRequestMessage, JsonRpcResponseMessage } from "./transport.js";
import { JSONRPC_VERSION, LspError } from "./transport.js";

function ok(id: JsonRpcRequestMessage["id"], result: unknown): JsonRpcResponseMessage {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

const DIAG = {
  range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
  severity: 1,
  message: "Cannot find name 'foo'.",
  source: "ts",
  code: 2304,
};

describe("LspClient handshake", () => {
  it("sends initialize with rootUri/capabilities/clientInfo, then the initialized notification", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") {
        return ok(msg.id, {
          capabilities: { textDocumentSync: 1 },
          serverInfo: { name: "srv", version: "9" },
        });
      }
      return ok(msg.id, null);
    });
    const client = new LspClient(transport, {
      serverName: "srv",
      clientInfo: { name: "ultracode", version: "1.3.1" },
    });

    const info = await client.initialize("file:///proj");

    expect(transport.started).toBe(true);
    expect(client.isInitialized).toBe(true);
    expect(info.serverInfo).toEqual({ name: "srv", version: "9" });

    const initReq = transport.requests[0];
    expect(initReq?.method).toBe("initialize");
    expect(initReq?.params).toMatchObject({
      rootUri: "file:///proj",
      clientInfo: { name: "ultracode", version: "1.3.1" },
    });
    expect((initReq?.params as { capabilities?: unknown }).capabilities).toBeDefined();
    expect(transport.notifications[0]?.method).toBe("initialized");
  });

  it("is idempotent: a second initialize does not re-handshake", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    await client.initialize("file:///p");
    expect(transport.requests.filter((r) => r.method === "initialize")).toHaveLength(1);
  });

  it("passes a null rootUri through when none is given", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize(undefined);
    expect((transport.requests[0]?.params as { rootUri: unknown }).rootUri).toBeNull();
  });
});

describe("LspClient.openDocument", () => {
  it("sends textDocument/didOpen with the document item", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    await client.openDocument("file:///p/a.ts", "typescript", "const x = 1;\n", 3);

    const didOpen = transport.notifications.find((n) => n.method === "textDocument/didOpen");
    expect(didOpen?.params).toEqual({
      textDocument: {
        uri: "file:///p/a.ts",
        languageId: "typescript",
        version: 3,
        text: "const x = 1;\n",
      },
    });
  });

  it("throws when called before initialize", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, {}));
    const client = new LspClient(transport, { serverName: "srv" });
    await expect(client.openDocument("file:///a", "ts", "")).rejects.toBeInstanceOf(LspError);
  });
});

describe("LspClient.getDiagnostics", () => {
  it("returns diagnostics pushed via publishDiagnostics for the URI", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv", diagnosticsWaitMs: 1_000 });
    await client.initialize("file:///p");
    await client.openDocument("file:///p/a.ts", "typescript", "x");

    const pending = client.getDiagnostics("file:///p/a.ts");
    transport.push("textDocument/publishDiagnostics", {
      uri: "file:///p/a.ts",
      diagnostics: [DIAG],
    });
    const diagnostics = await pending;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ message: "Cannot find name 'foo'.", severity: 1 });
  });

  it("returns immediately when diagnostics already arrived before the call", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    transport.push("textDocument/publishDiagnostics", {
      uri: "file:///p/a.ts",
      diagnostics: [DIAG],
    });
    const diagnostics = await client.getDiagnostics("file:///p/a.ts", { timeoutMs: 5_000 });
    expect(diagnostics).toHaveLength(1);
  });

  it("resolves empty (never throws) when no push arrives within the window", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    const diagnostics = await client.getDiagnostics("file:///p/a.ts", { timeoutMs: 15 });
    expect(diagnostics).toEqual([]);
  });

  it("only returns diagnostics for the requested URI", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    transport.push("textDocument/publishDiagnostics", {
      uri: "file:///p/other.ts",
      diagnostics: [DIAG],
    });
    const diagnostics = await client.getDiagnostics("file:///p/a.ts", { timeoutMs: 15 });
    expect(diagnostics).toEqual([]);
  });

  it("resolves early with what is cached when the caller aborts", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    const controller = new AbortController();
    const pending = client.getDiagnostics("file:///p/a.ts", {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toEqual([]);
  });
});

describe("LspClient.shutdown / exit / dispose", () => {
  it("sends shutdown (request) then exit (notification)", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    await client.shutdown();
    await client.exit();
    expect(transport.requests.some((r) => r.method === "shutdown")).toBe(true);
    expect(transport.notifications.some((n) => n.method === "exit")).toBe(true);
  });

  it("dispose runs shutdown+exit+close and never throws", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { capabilities: {} }));
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    await expect(client.dispose()).resolves.toBeUndefined();
    expect(transport.closed).toBe(true);
    expect(transport.notifications.some((n) => n.method === "exit")).toBe(true);
  });

  it("dispose does not throw even when shutdown rejects", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") return ok(msg.id, { capabilities: {} });
      return { jsonrpc: JSONRPC_VERSION, id: msg.id, error: { code: -1, message: "boom" } };
    });
    const client = new LspClient(transport, { serverName: "srv" });
    await client.initialize("file:///p");
    await expect(client.dispose()).resolves.toBeUndefined();
    expect(transport.closed).toBe(true);
  });
});

describe("LspClient rpc error mapping", () => {
  it("maps a JSON-RPC error response onto LspError", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") {
        return { jsonrpc: JSONRPC_VERSION, id: msg.id, error: { code: -32000, message: "nope" } };
      }
      return ok(msg.id, {});
    });
    const client = new LspClient(transport, { serverName: "srv" });
    const err = await client.initialize("file:///p").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).message).toMatch(/nope/);
    expect((err as LspError).details).toMatchObject({ code: -32000, method: "initialize" });
  });
});

describe("parseDiagnostics", () => {
  it("keeps well-formed diagnostics and drops malformed entries", () => {
    const parsed = parseDiagnostics([
      DIAG,
      "garbage",
      { message: "no range" },
      { range: { start: { line: 0, character: 0 } }, message: "no end" },
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ message: DIAG.message, code: 2304, source: "ts" });
  });

  it("returns an empty array for non-array input", () => {
    expect(parseDiagnostics(undefined)).toEqual([]);
    expect(parseDiagnostics({ not: "an array" })).toEqual([]);
  });
});
