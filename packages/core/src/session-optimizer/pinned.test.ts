import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@ultracode/shared";
import { extractPinnedFacts, extractPinnedFromText } from "./pinned.js";

describe("extractPinnedFromText", () => {
  it("returns [] for empty / non-string input", () => {
    expect(extractPinnedFromText("")).toEqual([]);
    expect(extractPinnedFromText(undefined as unknown as string)).toEqual([]);
  });

  it("extracts file paths (POSIX, Windows, bare)", () => {
    const facts = extractPinnedFromText(
      "edit src/core/UltraCode.ts and C:\\proj\\main.rs plus config.toml",
    );
    expect(facts).toContain("src/core/UltraCode.ts");
    expect(facts.some((f) => f.includes("main.rs"))).toBe(true);
    expect(facts).toContain("config.toml");
  });

  it("extracts version numbers", () => {
    const facts = extractPinnedFromText("we are on v1.2.0 and bumping to 2.0.0-rc.1");
    expect(facts).toContain("v1.2.0");
    expect(facts).toContain("2.0.0-rc.1");
  });

  it("extracts decisions", () => {
    const facts = extractPinnedFromText("We decided to use PostgreSQL for storage.");
    expect(facts.some((f) => /decided to use PostgreSQL/i.test(f))).toBe(true);
  });

  it("extracts TODO / open tasks", () => {
    const facts = extractPinnedFromText("TODO wire the cache and FIXME the race");
    expect(facts.some((f) => /TODO/.test(f))).toBe(true);
    expect(facts.some((f) => /FIXME/.test(f))).toBe(true);
  });

  it("extracts code symbols but not bare prose words", () => {
    const facts = extractPinnedFromText("call createSessionOptimizer() and SkillRegistry.load");
    expect(facts).toContain("createSessionOptimizer()");
    expect(facts.some((f) => f.includes("SkillRegistry.load"))).toBe(true);
    // plain lower-case prose is not a symbol
    expect(extractPinnedFromText("the quick brown fox jumps")).toEqual([]);
  });

  it("is deterministic and de-duplicated", () => {
    const text = "use config.toml; use config.toml again";
    const a = extractPinnedFromText(text);
    const b = extractPinnedFromText(text);
    expect(a).toEqual(b);
    expect(a.filter((f) => f === "config.toml")).toHaveLength(1);
  });

  it("tolerates unicode without throwing", () => {
    expect(() => extractPinnedFromText("日本語 ✅ café.md decided to use Ω")).not.toThrow();
    expect(extractPinnedFromText("café.md")).toContain("café.md");
  });
});

describe("extractPinnedFacts (across messages)", () => {
  const msg = (content: string): ChatMessage => ({ role: "user", content });

  it("preserves existing facts and merges new ones", () => {
    const existing = ["legacy.fact"];
    const facts = extractPinnedFacts([msg("touch src/a.ts")], existing);
    expect(facts[0]).toBe("legacy.fact");
    expect(facts).toContain("src/a.ts");
  });

  it("keeps pinned facts stable across repeated passes (idempotent merge)", () => {
    const messages = [msg("use Postgres in db.ts"), msg("use Postgres in db.ts")];
    const first = extractPinnedFacts(messages, []);
    const second = extractPinnedFacts(messages, first);
    expect(second).toEqual(first);
  });

  it("handles empty / non-array input", () => {
    expect(extractPinnedFacts([], [])).toEqual([]);
    expect(extractPinnedFacts(undefined as unknown as ChatMessage[], ["x"])).toEqual(["x"]);
  });
});
