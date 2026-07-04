import type { ChildProcess } from "node:child_process";
import type { McpServerConfig, ToolContext } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/ToolRegistry.js";
import { connectMcpServer, McpError, registerMcpTools } from "./index.js";
import {
  createFakeChild,
  defaultResponder,
  type FakeChildOptions,
  type FakeResponder,
} from "./testutil.test.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const TOOLS = [
  { name: "forecast", description: "Get a forecast", inputSchema: { type: "object" } },
  { name: "alerts" },
];

/** A spawnFn that returns a fresh fake child running the default responder. */
function stdioSpawn(
  responder: FakeResponder = defaultResponder(TOOLS, (name) => ({
    content: [{ type: "text", text: `ran ${name}` }],
    isError: false,
  })),
  childOptions?: FakeChildOptions,
): () => ChildProcess {
  return () => createFakeChild(responder, childOptions) as unknown as ChildProcess;
}

describe("connectMcpServer (stdio)", () => {
  it("handshakes, discovers tools and exposes them namespaced", async () => {
    const config: McpServerConfig = {
      name: "weather",
      transport: "stdio",
      command: "weather-mcp",
      args: ["--stdio"],
    };
    const handle = await connectMcpServer(config, { spawnFn: stdioSpawn() });
    expect(handle.serverName).toBe("weather");
    expect(handle.tools.map((t) => t.definition.name)).toEqual([
      "weather.forecast",
      "weather.alerts",
    ]);
    expect(handle.client.isInitialized).toBe(true);

    // The wrapped tool actually round-trips through tools/call.
    const forecast = handle.tools[0];
    const context: ToolContext = { cwd: "/tmp", env: {}, logger: new NoopLogger() };
    const result = await forecast?.execute({}, context);
    expect(result?.ok).toBe(true);
    expect(result?.output.text).toBe("ran forecast");
    await handle.dispose();
  });

  it("rejects with McpError when stdio config lacks a command", async () => {
    const config: McpServerConfig = { name: "bad", transport: "stdio" };
    await expect(connectMcpServer(config)).rejects.toBeInstanceOf(McpError);
  });

  it("rejects when the server process fails to spawn", async () => {
    const config: McpServerConfig = { name: "gone", transport: "stdio", command: "nope" };
    const handle = connectMcpServer(config, {
      spawnFn: stdioSpawn(
        defaultResponder([], () => ({ content: [] })),
        {
          spawnError: new Error("ENOENT"),
        },
      ),
    });
    await expect(handle).rejects.toBeInstanceOf(McpError);
  });
});

describe("connectMcpServer (http)", () => {
  it("resolves the API key from env and connects over HTTP", async () => {
    let step = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const msg = JSON.parse((init?.body as string) ?? "{}") as { id: number; method: string };
      step += 1;
      if (msg.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      const result =
        msg.method === "initialize"
          ? { protocolVersion: "2024-11-05", capabilities: {} }
          : { tools: TOOLS };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const config: McpServerConfig = {
      name: "remote",
      transport: "http",
      url: "https://mcp.example/rpc",
      apiKeyEnv: "REMOTE_KEY",
    };
    const handle = await connectMcpServer(config, {
      env: { REMOTE_KEY: "abc123" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(handle.tools.map((t) => t.definition.name)).toEqual([
      "remote.forecast",
      "remote.alerts",
    ]);
    expect(step).toBeGreaterThanOrEqual(2);
    // The bearer token from env made it onto the wire.
    const authed = fetchImpl.mock.calls.some(
      (c) =>
        (c[1] as RequestInit).headers &&
        ((c[1] as RequestInit).headers as Record<string, string>).authorization === "Bearer abc123",
    );
    expect(authed).toBe(true);
    await handle.dispose();
  });

  it("rejects with McpError when http config lacks a url", async () => {
    const config: McpServerConfig = { name: "bad", transport: "http" };
    await expect(connectMcpServer(config)).rejects.toBeInstanceOf(McpError);
  });
});

describe("registerMcpTools", () => {
  it("registers every tool into a ToolRegistry and returns handles", async () => {
    const registry = new ToolRegistry();
    const configs: McpServerConfig[] = [
      { name: "weather", transport: "stdio", command: "weather-mcp" },
    ];
    const result = await registerMcpTools(configs, {
      registry,
      spawnFn: stdioSpawn(),
    });
    expect(result.errors).toEqual([]);
    expect(result.tools).toHaveLength(2);
    expect(registry.has("weather.forecast")).toBe(true);
    expect(registry.has("weather.alerts")).toBe(true);
    await result.dispose();
  });

  it("collects per-server errors without aborting the healthy servers", async () => {
    // One good stdio server, one broken (missing command).
    const configs: McpServerConfig[] = [
      { name: "good", transport: "stdio", command: "good-mcp" },
      { name: "broken", transport: "stdio" },
    ];
    const result = await registerMcpTools(configs, { spawnFn: stdioSpawn() });
    expect(result.tools.map((t) => t.definition.name)).toEqual(["good.forecast", "good.alerts"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.server).toBe("broken");
    expect(result.errors[0]?.error).toBeInstanceOf(McpError);
    await result.dispose();
  });

  it("skips duplicate tool names in the registry without losing the batch", async () => {
    const registry = new ToolRegistry();
    // Two servers that both expose a tool named "dup" would collide only within
    // their own namespace; here we pre-register a colliding name to force it.
    const configs: McpServerConfig[] = [
      { name: "weather", transport: "stdio", command: "weather-mcp" },
    ];
    // Pre-register weather.forecast so the batch hits a duplicate on register.
    registry.register({
      definition: {
        name: "weather.forecast",
        description: "pre-existing",
        category: "mcp",
        parameters: { type: "object" },
        permission: "ask",
      },
      validate: (a: unknown) => a as Record<string, unknown>,
      execute: async () => ({ ok: true, output: undefined, durationMs: 0 }),
    });
    const result = await registerMcpTools(configs, { registry, spawnFn: stdioSpawn() });
    // forecast collided (skipped from registry) but alerts still registered.
    expect(registry.has("weather.alerts")).toBe(true);
    // The non-colliding tool is still returned in the batch tools list.
    expect(result.tools.some((t) => t.definition.name === "weather.alerts")).toBe(true);
    await result.dispose();
  });
});
