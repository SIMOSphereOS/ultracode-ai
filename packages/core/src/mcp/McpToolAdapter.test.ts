import type { ToolContext } from "ultracode-shared";
import { NoopLogger, ValidationError } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { JSONRPC_VERSION } from "./jsonRpc.js";
import { McpClient, type McpToolDescriptor } from "./McpClient.js";
import { extractText, McpToolAdapter, toParameterSchema } from "./McpToolAdapter.js";
import { ScriptedTransport } from "./testutil.test.js";

function ctx(signal?: AbortSignal): ToolContext {
  const base: ToolContext = { cwd: "/tmp", env: {}, logger: new NoopLogger() };
  if (signal !== undefined) base.signal = signal;
  return base;
}

/** An initialized client whose tools/call is scripted by `onCall`. */
async function makeClient(onCall: (name: string, args: unknown) => unknown): Promise<McpClient> {
  const transport = new ScriptedTransport((msg) => {
    if (msg.method === "initialize") {
      return { jsonrpc: JSONRPC_VERSION, id: msg.id, result: { protocolVersion: "2024-11-05" } };
    }
    const params = msg.params as { name: string; arguments: unknown };
    return { jsonrpc: JSONRPC_VERSION, id: msg.id, result: onCall(params.name, params.arguments) };
  });
  const client = new McpClient(transport, { serverName: "weather" });
  await client.initialize();
  return client;
}

describe("McpToolAdapter definition", () => {
  it("namespaces the tool name, sets mcp category and default ask permission", async () => {
    const client = await makeClient(() => ({ content: [] }));
    const descriptor: McpToolDescriptor = {
      name: "forecast",
      description: "Get a forecast",
      inputSchema: {
        type: "object",
        required: ["city"],
        properties: {
          city: { type: "string", description: "City name" },
          days: { type: "integer", default: 3 },
        },
      },
    };
    const tool = new McpToolAdapter(client, descriptor);
    expect(tool.definition.name).toBe("weather.forecast");
    expect(tool.definition.category).toBe("mcp");
    expect(tool.definition.permission).toBe("ask");
    expect(tool.definition.description).toBe("Get a forecast");
    expect(tool.definition.parameters).toMatchObject({
      type: "object",
      required: ["city"],
      properties: { city: { type: "string" }, days: { type: "integer", default: 3 } },
    });
  });

  it("honours a permission override and synthesises a description when absent", async () => {
    const client = await makeClient(() => ({ content: [] }));
    const tool = new McpToolAdapter(client, { name: "raw" }, { permission: "always" });
    expect(tool.definition.permission).toBe("always");
    expect(tool.definition.description).toContain("raw");
    expect(tool.definition.parameters.type).toBe("object");
  });
});

describe("McpToolAdapter.validate", () => {
  it("accepts an object and defaults missing/empty args to an object", async () => {
    const client = await makeClient(() => ({ content: [] }));
    const tool = new McpToolAdapter(client, { name: "t" });
    expect(tool.validate({ a: 1 })).toEqual({ a: 1 });
    expect(tool.validate(undefined)).toEqual({});
  });

  it("rejects non-object args with ValidationError", async () => {
    const client = await makeClient(() => ({ content: [] }));
    const tool = new McpToolAdapter(client, { name: "t" });
    expect(() => tool.validate("nope")).toThrow(ValidationError);
    expect(() => tool.validate([1, 2])).toThrow(ValidationError);
  });

  it("enforces top-level required keys from the input schema", async () => {
    const client = await makeClient(() => ({ content: [] }));
    const tool = new McpToolAdapter(client, {
      name: "t",
      inputSchema: { type: "object", required: ["city"] },
    });
    expect(() => tool.validate({})).toThrow(/missing required city/);
    expect(tool.validate({ city: "AB" })).toEqual({ city: "AB" });
  });
});

describe("McpToolAdapter.execute", () => {
  it("calls tools/call and returns ok with concatenated text", async () => {
    const client = await makeClient((name, args) => ({
      content: [
        { type: "text", text: `called ${name}` },
        { type: "text", text: JSON.stringify(args) },
      ],
      isError: false,
    }));
    const tool = new McpToolAdapter(client, { name: "echo" });
    const result = await tool.execute({ x: 1 }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output.text).toBe('called echo\n{"x":1}');
    expect(result.output.content).toHaveLength(2);
    expect(typeof result.durationMs).toBe("number");
  });

  it("maps an MCP isError result onto ok:false with a ToolError", async () => {
    const client = await makeClient(() => ({
      content: [{ type: "text", text: "file not found" }],
      isError: true,
    }));
    const tool = new McpToolAdapter(client, { name: "read" });
    const result = await tool.execute({}, ctx());
    expect(result.ok).toBe(false);
    expect(result.output.isError).toBe(true);
    expect(result.error?.message).toMatch(/file not found/);
    expect(result.error?.details).toMatchObject({ toolName: "weather.read" });
  });

  it("never rejects: a transport failure becomes ok:false", async () => {
    const transport = new ScriptedTransport((msg) => {
      if (msg.method === "initialize") {
        return { jsonrpc: JSONRPC_VERSION, id: msg.id, result: { protocolVersion: "2024-11-05" } };
      }
      return Promise.reject(new Error("socket hangup"));
    });
    const client = new McpClient(transport, { serverName: "weather" });
    await client.initialize();
    const tool = new McpToolAdapter(client, { name: "flaky" });
    const result = await tool.execute({}, ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/socket hangup/);
  });

  it("short-circuits to ok:false when the context signal is already aborted", async () => {
    const client = await makeClient(() => ({ content: [] }));
    const tool = new McpToolAdapter(client, { name: "t" });
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const result = await tool.execute({}, ctx(controller.signal));
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/cancelled/);
  });
});

describe("toParameterSchema / extractText", () => {
  it("defaults to an object schema for a missing/invalid schema", () => {
    expect(toParameterSchema(undefined)).toEqual({ type: "object", properties: {} });
    expect(toParameterSchema("nonsense")).toEqual({ type: "object", properties: {} });
  });

  it("maps nested arrays, enums and union types", () => {
    const converted = toParameterSchema({
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        mode: { type: ["string", "null"], enum: ["a", "b", null] },
      },
    });
    expect(converted.properties?.tags).toEqual({ type: "array", items: { type: "string" } });
    expect(converted.properties?.mode).toMatchObject({ type: "string", enum: ["a", "b", null] });
  });

  it("extractText concatenates only text blocks", () => {
    expect(
      extractText([
        { type: "text", text: "one" },
        { type: "image", data: "..." },
        { type: "text", text: "two" },
      ]),
    ).toBe("one\ntwo");
  });
});
