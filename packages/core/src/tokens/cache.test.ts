import type { ToolDefinition } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { ANTHROPIC_MAX_CACHE_BREAKPOINTS, cachePrefixHint, computePrefixKey } from "./cache.js";
import type { PromptPayload } from "./types.js";

function tool(name: string): ToolDefinition {
  return {
    name,
    description: "d",
    category: "utility",
    parameters: { type: "object", properties: {}, required: [] },
    permission: "always",
  };
}

describe("computePrefixKey", () => {
  it("is stable for identical prefixes", () => {
    const a = computePrefixKey("sys", [tool("x")]);
    const b = computePrefixKey("sys", [tool("x")]);
    expect(a).toBe(b);
  });

  it("changes when the system prompt changes", () => {
    expect(computePrefixKey("sys A", [])).not.toBe(computePrefixKey("sys B", []));
  });

  it("changes when the toolset changes", () => {
    expect(computePrefixKey("sys", [tool("a")])).not.toBe(computePrefixKey("sys", [tool("b")]));
  });

  it("ignores message history (not part of the prefix)", () => {
    // Same system + tools → same key regardless of any history we never pass.
    expect(computePrefixKey("sys", [tool("a")])).toBe(computePrefixKey("sys", [tool("a")]));
  });
});

describe("cachePrefixHint", () => {
  it("produces a cachePrefix hint with a stable key", () => {
    const p: PromptPayload = { system: "sys", tools: [tool("a")], messages: [] };
    const hint = cachePrefixHint(p);
    expect(hint.cachePrefix).toBe(true);
    expect(hint.key).toBe(computePrefixKey("sys", [tool("a")]));
  });
});

describe("constants", () => {
  it("exposes the Anthropic breakpoint cap", () => {
    expect(ANTHROPIC_MAX_CACHE_BREAKPOINTS).toBe(4);
  });
});
