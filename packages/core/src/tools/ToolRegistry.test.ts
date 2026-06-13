import { describe, expect, it } from "vitest";
import { ToolError } from "ultracode-shared";
import type { ITool, ToolDefinition } from "ultracode-shared";
import { ToolRegistry } from "./ToolRegistry.js";

function fakeTool(name: string): ITool<Record<string, unknown>, unknown> {
  const definition: ToolDefinition = {
    name,
    description: `fake ${name}`,
    category: "utility",
    parameters: { type: "object" },
    permission: "always",
  };
  return {
    definition,
    validate: (args) => (args ?? {}) as Record<string, unknown>,
    execute: async () => ({ ok: true, output: name, durationMs: 0 }),
  };
}

describe("ToolRegistry", () => {
  it("registers, gets, has, lists and unregisters", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool("b"));
    registry.register(fakeTool("a"));

    expect(registry.size).toBe(2);
    expect(registry.has("a")).toBe(true);
    expect(registry.get("a")?.definition.name).toBe("a");
    expect(registry.list().map((d) => d.name)).toEqual(["a", "b"]);

    expect(registry.unregister("a")).toBe(true);
    expect(registry.unregister("a")).toBe(false);
    expect(registry.has("a")).toBe(false);
    expect(registry.get("a")).toBeUndefined();
  });

  it("throws ToolError on name collision", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool("dup"));
    expect(() => registry.register(fakeTool("dup"))).toThrow(ToolError);
    expect(() => registry.register(fakeTool("dup"))).toThrow(/already registered/);
  });

  it("rejects empty names", () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(fakeTool(""))).toThrow(ToolError);
    expect(() => registry.register(fakeTool("   "))).toThrow(ToolError);
  });
});
