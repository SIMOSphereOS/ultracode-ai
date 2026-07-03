import { describe, expect, it } from "vitest";
import {
  flattenLeaves,
  formatTable,
  getAtPath,
  MAX_CELL_WIDTH,
  maskSecret,
  paint,
  parseCliValue,
  redactConfig,
} from "./text.js";

describe("parseCliValue", () => {
  it("parses booleans and null", () => {
    expect(parseCliValue("true")).toBe(true);
    expect(parseCliValue(" false ")).toBe(false);
    expect(parseCliValue("null")).toBeNull();
  });

  it("parses integers and floats (including negatives)", () => {
    expect(parseCliValue("42")).toBe(42);
    expect(parseCliValue("-3.5")).toBe(-3.5);
    expect(parseCliValue("007")).toBe(7);
  });

  it("keeps number-like garbage as strings", () => {
    expect(parseCliValue("12abc")).toBe("12abc");
    expect(parseCliValue("1.2.3")).toBe("1.2.3");
  });

  it("parses JSON arrays/objects/quoted strings", () => {
    expect(parseCliValue("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseCliValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseCliValue('"hello"')).toBe("hello");
  });

  it("falls back to the raw string for broken JSON", () => {
    expect(parseCliValue("{broken")).toBe("{broken");
    expect(parseCliValue("[1,2")).toBe("[1,2");
  });

  it("returns empty string unchanged", () => {
    expect(parseCliValue("")).toBe("");
  });

  it("handles a >= 1 MB string quickly and losslessly", () => {
    const huge = "x".repeat(1_500_000);
    expect(parseCliValue(huge)).toBe(huge);
  });

  it("keeps unicode/emoji strings intact", () => {
    expect(parseCliValue("héllo 🌍\u{1F600}")).toBe("héllo 🌍\u{1F600}");
  });
});

describe("getAtPath", () => {
  const obj = { core: { activeModel: "m", nested: { deep: 1 } }, arr: [1, 2] };

  it("reads nested values", () => {
    expect(getAtPath(obj, "core.activeModel")).toBe("m");
    expect(getAtPath(obj, "core.nested.deep")).toBe(1);
  });

  it("returns undefined for unknown paths", () => {
    expect(getAtPath(obj, "core.missing")).toBeUndefined();
    expect(getAtPath(obj, "core.activeModel.x")).toBeUndefined();
  });

  it("returns undefined for the empty path and non-objects", () => {
    expect(getAtPath(obj, "")).toBeUndefined();
    expect(getAtPath(null, "a")).toBeUndefined();
    expect(getAtPath(42, "a")).toBeUndefined();
  });

  it("indexes into arrays via numeric segments", () => {
    expect(getAtPath(obj, "arr.1")).toBe(2);
  });
});

describe("flattenLeaves", () => {
  it("flattens nested objects, treating arrays as leaves", () => {
    expect(flattenLeaves({ a: { b: 1 }, c: [1, 2], d: "x" })).toEqual([
      ["a.b", 1],
      ["c", [1, 2]],
      ["d", "x"],
    ]);
  });

  it("handles the empty object", () => {
    expect(flattenLeaves({})).toEqual([]);
  });
});

describe("maskSecret", () => {
  it("marks empty values", () => {
    expect(maskSecret("")).toBe("(empty)");
  });

  it("fully masks short secrets", () => {
    expect(maskSecret("abc123")).toBe("***");
  });

  it("keeps only the first three characters of longer secrets", () => {
    expect(maskSecret("sk-1234567890")).toBe("sk-***");
  });

  it("never splits surrogate pairs", () => {
    const masked = maskSecret("🔑🔑🔑🔑🔑🔑🔑🔑");
    expect(masked).toBe("🔑🔑🔑***");
    // no lone surrogates
    expect(
      masked
        .split("")
        .some((c) => /[\uD800-\uDBFF]/.test(c) && masked[masked.indexOf(c) + 1] === "*"),
    ).toBe(false);
  });
});

describe("redactConfig", () => {
  it("masks values whose key looks secret", () => {
    const cfg = {
      providers: { apiKey: "super-secret-value", mistral_api_key: "sk-abcdef123", timeout: 60 },
      auth: { password: "hunter2-long", token: "tok-123456789" },
      ui: { theme: "dark" },
    };
    const redacted = redactConfig(cfg);
    const json = JSON.stringify(redacted);
    expect(json).not.toContain("super-secret-value");
    expect(json).not.toContain("sk-abcdef123");
    expect(json).not.toContain("hunter2-long");
    expect(json).not.toContain("tok-123456789");
    expect(redacted.ui.theme).toBe("dark");
    expect(redacted.providers.timeout).toBe(60);
  });

  it("does not mutate its input", () => {
    const cfg = { apiKey: "secret-value-1" };
    redactConfig(cfg);
    expect(cfg.apiKey).toBe("secret-value-1");
  });

  it("recurses into arrays", () => {
    const cfg = { servers: [{ apiKeyEnv: "MY_KEY_VAR_NAME" }, { name: "x" }] };
    const r = redactConfig(cfg);
    expect(JSON.stringify(r)).not.toContain("MY_KEY_VAR_NAME");
    expect(r.servers[1]).toEqual({ name: "x" });
  });

  it("passes through primitives and weird types", () => {
    expect(redactConfig(42)).toBe(42);
    expect(redactConfig(null)).toBeNull();
    expect(redactConfig("plain")).toBe("plain");
  });
});

describe("formatTable", () => {
  it("renders header, separator and rows", () => {
    const t = formatTable(["Name", "Desc"], [["read", "reads a file"]]);
    const lines = t.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^Name\s+Desc$/);
    expect(lines[1]).toMatch(/^-+\s+-+$/);
    expect(lines[2]).toMatch(/^read\s+reads a file$/);
  });

  it("renders with zero rows", () => {
    const t = formatTable(["A", "B"], []);
    expect(t.trimEnd().split("\n")).toHaveLength(2);
  });

  it("renders 100 rows", () => {
    const rows = Array.from({ length: 100 }, (_, i) => [`tool${i}`, `desc ${i}`]);
    const t = formatTable(["Name", "Desc"], rows);
    expect(t.trimEnd().split("\n")).toHaveLength(102);
    expect(t).toContain("tool0");
    expect(t).toContain("tool99");
  });

  it("flattens newlines and truncates huge cells", () => {
    const t = formatTable(["A"], [["line1\r\nline2"], ["y".repeat(2_000_000)]]);
    expect(t).toContain("line1 line2");
    for (const line of t.split("\n")) {
      expect(Array.from(line).length).toBeLessThanOrEqual(MAX_CELL_WIDTH + 5);
    }
  });

  it("tolerates missing cells and non-string input", () => {
    const t = formatTable(["A", "B"], [["only-a"]]);
    expect(t).toContain("only-a");
  });

  it("handles emoji cells without crashing", () => {
    const t = formatTable(["Name"], [["🚀🔥"], ["plain"]]);
    expect(t).toContain("🚀🔥");
  });
});

describe("paint", () => {
  it("adds ANSI codes only when enabled", () => {
    expect(paint("x", "31", true)).toBe("\u001B[31mx\u001B[0m");
    expect(paint("x", "31", false)).toBe("x");
  });
});
