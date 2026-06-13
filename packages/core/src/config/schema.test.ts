import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_CONFIG, deepMerge } from "ultracode-shared";
import { checkConfig, validateConfig } from "./schema.js";

function candidate(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    { providers: { apiKeys: {} }, ...extra },
  );
}

describe("validateConfig", () => {
  it("accepts the embedded defaults", () => {
    const config = validateConfig(candidate());
    expect(config.core.maxTokens).toBe(32000);
    expect(config.providers.apiKeys).toEqual({});
  });

  it("rejects temperature outside 0–1 with a precise path", () => {
    for (const temperature of [-0.1, 1.5, 99]) {
      let caught: unknown;
      try {
        validateConfig(candidate({ core: { temperature } }));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as ConfigError).message).toContain("core.temperature");
    }
  });

  it("rejects non-positive or non-integer maxTokens", () => {
    expect(() => validateConfig(candidate({ core: { maxTokens: 0 } }))).toThrow(/core\.maxTokens/);
    expect(() => validateConfig(candidate({ core: { maxTokens: -5 } }))).toThrow(ConfigError);
    expect(() => validateConfig(candidate({ core: { maxTokens: 1.5 } }))).toThrow(ConfigError);
  });

  it("rejects hard type errors with the offending path", () => {
    expect(() => validateConfig(candidate({ core: { debug: "yes" } }))).toThrow(/core\.debug/);
    expect(() =>
      validateConfig(candidate({ sessions: { maxSessions: "many" } })),
    ).toThrow(/sessions\.maxSessions/);
  });

  it("accepts known themes incl. custom, rejects others", () => {
    for (const theme of ["dark", "light", "dracula", "solarized", "monokai", "custom"]) {
      expect(validateConfig(candidate({ ui: { theme } })).ui.theme).toBe(theme);
    }
    expect(() => validateConfig(candidate({ ui: { theme: "hotdog-stand" } }))).toThrow(
      /ui\.theme/,
    );
  });

  it("restricts tool permissions to ask/always/never", () => {
    const ok = validateConfig(
      candidate({ tools: { perTool: { bash: { permission: "never" } } } }),
    );
    expect(ok.tools.perTool["bash"]?.permission).toBe("never");
    expect(() =>
      validateConfig(candidate({ tools: { perTool: { bash: { permission: "maybe" } } } })),
    ).toThrow(/tools\.perTool\.bash\.permission/);
  });

  it("keeps tool-specific extra keys (open per-tool config)", () => {
    const config = validateConfig(
      candidate({ tools: { perTool: { task: { maxConcurrent: 3, customLimit: 7 } } } }),
    );
    expect(config.tools.perTool["task"]).toEqual({ maxConcurrent: 3, customLimit: 7 });
  });

  it("validates versioning strategy and quality bounds", () => {
    expect(() =>
      validateConfig(candidate({ versioning: { strategy: "vibes" } })),
    ).toThrow(/versioning\.strategy/);
    expect(() =>
      validateConfig(candidate({ versioning: { quality: { minCoverage: 150 } } })),
    ).toThrow(/versioning\.quality\.minCoverage/);
  });

  it("enforces MCP transport requirements", () => {
    expect(() =>
      validateConfig(candidate({ mcpServers: [{ name: "x", transport: "http" }] })),
    ).toThrow(/mcpServers\.0\.url/);
    expect(() =>
      validateConfig(candidate({ mcpServers: [{ name: "x", transport: "stdio" }] })),
    ).toThrow(/mcpServers\.0\.command/);
    const ok = validateConfig(
      candidate({
        mcpServers: [
          { name: "a", transport: "http", url: "http://localhost:1" },
          { name: "b", transport: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
        ],
      }),
    );
    expect(ok.mcpServers).toHaveLength(2);
  });

  it("rejects completely invalid input types", () => {
    for (const bad of [null, undefined, 42, "config", [], () => undefined]) {
      expect(() => validateConfig(bad)).toThrow(ConfigError);
    }
  });

  it("collects multiple errors in one ConfigError", () => {
    let caught: unknown;
    try {
      validateConfig(candidate({ core: { temperature: 5, maxTokens: -1 } }));
    } catch (err) {
      caught = err;
    }
    const details = (caught as ConfigError).details as { errors: string[] };
    expect(details.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("checkConfig", () => {
  it("returns valid for good config", () => {
    expect(checkConfig(candidate())).toEqual({ valid: true, errors: [] });
  });

  it("returns dotted-path errors instead of throwing", () => {
    const result = checkConfig(candidate({ core: { temperature: 7 } }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("core.temperature:"))).toBe(true);
  });
});
