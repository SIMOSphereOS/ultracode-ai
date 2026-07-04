import { describe, expect, it } from "vitest";
import type { JsonRpcRequestMessage, JsonRpcResponseMessage } from "./jsonRpc.js";
import { JSONRPC_VERSION, McpError } from "./jsonRpc.js";
import { MCP_PROTOCOL_VERSION, McpClient } from "./McpClient.js";
import { captureLogger, ScriptedTransport } from "./testutil.test.js";

function ok(id: JsonRpcRequestMessage["id"], result: unknown): JsonRpcResponseMessage {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

describe("McpClient handshake", () => {
  it("sends initialize with protocol/client info, then the initialized notification", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") {
        return ok(msg.id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "srv", version: "9" },
        });
      }
      return ok(msg.id, {});
    });
    const client = new McpClient(transport, {
      serverName: "srv",
      clientInfo: { name: "ultracode", version: "1.3.1" },
    });

    const info = await client.initialize();

    expect(transport.started).toBe(true);
    expect(client.isInitialized).toBe(true);
    expect(info.protocolVersion).toBe("2024-11-05");
    expect(info.serverInfo).toEqual({ name: "srv", version: "9" });

    const initReq = transport.requests[0];
    expect(initReq?.method).toBe("initialize");
    expect(initReq?.params).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      clientInfo: { name: "ultracode", version: "1.3.1" },
    });
    // The initialized notification is sent AFTER the initialize response.
    expect(transport.notifications[0]?.method).toBe("notifications/initialized");
  });

  it("is idempotent: a second initialize does not re-handshake", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, { protocolVersion: "2024-11-05" }));
    const client = new McpClient(transport, { serverName: "srv" });
    await client.initialize();
    await client.initialize();
    expect(transport.requests.filter((r) => r.method === "initialize")).toHaveLength(1);
  });
});

describe("McpClient.listTools", () => {
  it("returns descriptors and follows cursor pagination", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") return ok(msg.id, { protocolVersion: "2024-11-05" });
      if (msg.method === "tools/list") {
        const cursor = (msg.params as { cursor?: string } | undefined)?.cursor;
        if (cursor === undefined) {
          return ok(msg.id, {
            tools: [{ name: "alpha", description: "A", inputSchema: { type: "object" } }],
            nextCursor: "page2",
          });
        }
        return ok(msg.id, { tools: [{ name: "beta" }] });
      }
      return ok(msg.id, {});
    });
    const client = new McpClient(transport, { serverName: "srv" });
    await client.initialize();

    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["alpha", "beta"]);
    expect(tools[0]).toEqual({ name: "alpha", description: "A", inputSchema: { type: "object" } });
  });

  it("skips descriptors without a name and logs a warning", async () => {
    const { logger, logs } = captureLogger();
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") return ok(msg.id, { protocolVersion: "2024-11-05" });
      return ok(msg.id, { tools: [{ description: "nameless" }, { name: "good" }] });
    });
    const client = new McpClient(transport, { serverName: "srv", logger });
    await client.initialize();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["good"]);
    expect(logs.some((l) => l.level === "warn")).toBe(true);
  });

  it("throws when called before initialize", async () => {
    const transport = new ScriptedTransport((msg) => ok(msg.id, {}));
    const client = new McpClient(transport, { serverName: "srv" });
    await expect(client.listTools()).rejects.toBeInstanceOf(McpError);
  });
});

describe("McpClient.callTool", () => {
  it("sends name + arguments and returns content/isError", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") return ok(msg.id, { protocolVersion: "2024-11-05" });
      if (msg.method === "tools/call") {
        return ok(msg.id, { content: [{ type: "text", text: "42" }], isError: false });
      }
      return ok(msg.id, {});
    });
    const client = new McpClient(transport, { serverName: "srv" });
    await client.initialize();

    const result = await client.callTool("add", { a: 1, b: 2 });
    expect(result).toEqual({ content: [{ type: "text", text: "42" }], isError: false });

    const callReq = transport.requests.find((r) => r.method === "tools/call");
    expect(callReq?.params).toEqual({ name: "add", arguments: { a: 1, b: 2 } });
  });

  it("maps a JSON-RPC error response onto McpError", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") return ok(msg.id, { protocolVersion: "2024-11-05" });
      return {
        jsonrpc: JSONRPC_VERSION,
        id: msg.id,
        error: { code: -32000, message: "boom" },
      };
    });
    const client = new McpClient(transport, { serverName: "srv" });
    await client.initialize();
    const err = await client.callTool("x", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(/boom/);
    expect((err as McpError).details).toMatchObject({ code: -32000, method: "tools/call" });
  });

  it("defaults isError to false and filters malformed content blocks", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") return ok(msg.id, { protocolVersion: "2024-11-05" });
      return ok(msg.id, { content: [{ type: "text", text: "ok" }, "garbage", { noType: true }] });
    });
    const client = new McpClient(transport, { serverName: "srv" });
    await client.initialize();
    const result = await client.callTool("x", undefined);
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
  });
});
