import { describe, expect, it } from "vitest";

import type { ContextSection } from "./ContextCollector.js";
import { CONTEXT_HEADER, ContextCompressor, cutAtWordBoundary } from "./ContextCompressor.js";

function section(id: string, content: string, priority: number, title = id): ContextSection {
  return { id, title, content, priority };
}

describe("ContextCompressor.estimateTokens", () => {
  const compressor = new ContextCompressor();

  it("estimates chars/4, rounded up", () => {
    expect(compressor.estimateTokens("")).toBe(0);
    expect(compressor.estimateTokens("abcd")).toBe(1);
    expect(compressor.estimateTokens("abcde")).toBe(2);
    expect(compressor.estimateTokens("x".repeat(400))).toBe(100);
  });

  it("counts UTF-16 code units (surrogate pairs are 2 chars)", () => {
    expect(compressor.estimateTokens("🦄🦄")).toBe(1); // 4 code units
  });
});

describe("ContextCompressor.rank", () => {
  const compressor = new ContextCompressor();

  it("puts sections mentioning prompt file names first", () => {
    const a = section("a", "general info, nothing specific", 10);
    const b = section("b", "src/engine/ContextEngine.ts was changed recently", 40);
    const ranked = compressor.rank([a, b], "please fix ContextEngine.ts");
    expect(ranked[0]?.id).toBe("b");
  });

  it("matches path segments of path-like prompt tokens", () => {
    const a = section("a", "nothing", 10);
    const b = section("b", "app.ts\nutil.ts", 40);
    const ranked = compressor.rank([a, b], "look at src/feature/app.ts");
    expect(ranked[0]?.id).toBe("b");
  });

  it("falls back to collector priority on equal scores", () => {
    const low = section("low", "shared words none", 50);
    const high = section("high", "shared words none", 10);
    const ranked = compressor.rank([low, high], "unrelated prompt");
    expect(ranked.map((s) => s.id)).toEqual(["high", "low"]);
  });

  it("is case-insensitive and does not mutate its input", () => {
    const sections = [section("a", "README.MD content", 20), section("b", "other", 10)];
    const snapshot = [...sections];
    const ranked = compressor.rank(sections, "open readme.md");
    expect(ranked[0]?.id).toBe("a");
    expect(sections).toEqual(snapshot);
  });

  it("handles a huge (1 MB) prompt without blowing up", () => {
    const prompt = `${"filler ".repeat(150_000)} target.ts`;
    expect(prompt.length).toBeGreaterThan(1_000_000);
    const a = section("a", "contains target.ts here", 20);
    const ranked = compressor.rank([a, section("b", "nope", 10)], prompt);
    // Terms are capped; ranking must still terminate quickly and stay valid.
    expect(ranked).toHaveLength(2);
  });
});

describe("ContextCompressor.compress", () => {
  const compressor = new ContextCompressor();

  it("returns '' for zero, negative or NaN budgets", () => {
    const sections = [section("a", "content", 10)];
    expect(compressor.compress(sections, { prompt: "p", maxTokens: 0 })).toBe("");
    expect(compressor.compress(sections, { prompt: "p", maxTokens: -10 })).toBe("");
    expect(compressor.compress(sections, { prompt: "p", maxTokens: Number.NaN })).toBe("");
  });

  it("returns '' for empty or whitespace-only sections", () => {
    expect(compressor.compress([], { prompt: "p", maxTokens: 1000 })).toBe("");
    expect(
      compressor.compress([section("a", "   \n\t ", 10)], { prompt: "p", maxTokens: 1000 }),
    ).toBe("");
  });

  it("includes all sections under a huge budget, with markdown headings", () => {
    const sections = [
      section("project", "Name: demo", 10, "Project"),
      section("git", "Branch: main", 20, "Git"),
      section("tree", "src/\n  app.ts", 40, "File Tree"),
    ];
    const out = compressor.compress(sections, { prompt: "hi", maxTokens: 1_000_000 });
    expect(out.startsWith(CONTEXT_HEADER)).toBe(true);
    expect(out).toContain("## Project");
    expect(out).toContain("## Git");
    expect(out).toContain("## File Tree");
    expect(out).toContain("Branch: main");
  });

  it("renders prompt-relevant sections before others", () => {
    const sections = [
      section("a", "completely unrelated", 10, "Alpha"),
      section("b", "mentions special-file.ts explicitly", 40, "Beta"),
    ];
    const out = compressor.compress(sections, {
      prompt: "edit special-file.ts",
      maxTokens: 10_000,
    });
    expect(out.indexOf("## Beta")).toBeLessThan(out.indexOf("## Alpha"));
  });

  it("drops whole sections that do not fit, keeping smaller lower-ranked ones", () => {
    const big = section("big", "word ".repeat(2000), 10, "Big"); // ~2500 tokens
    const small = section("small", "tiny content", 20, "Small");
    const out = compressor.compress([big, small], { prompt: "", maxTokens: 60 });
    expect(out).toContain("## Small");
    expect(out).not.toContain("## Big");
    expect(compressor.estimateTokens(out)).toBeLessThanOrEqual(60);
  });

  it("stays within the token budget", () => {
    const sections = [
      section("a", "alpha ".repeat(100), 10),
      section("b", "bravo ".repeat(100), 20),
      section("c", "charlie ".repeat(100), 30),
    ];
    for (const budget of [10, 50, 120, 100_000]) {
      const out = compressor.compress(sections, { prompt: "", maxTokens: budget });
      expect(compressor.estimateTokens(out)).toBeLessThanOrEqual(budget);
    }
  });

  it("truncates the top section at a word boundary when nothing fits whole", () => {
    const vocabulary = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const content = Array.from({ length: 500 }, (_, i) => vocabulary[i % vocabulary.length]).join(
      " ",
    );
    const out = compressor.compress([section("only", content, 10, "Only")], {
      prompt: "",
      maxTokens: 30,
    });
    expect(out).toContain("## Only");
    expect(out).toContain("… (truncated)");
    expect(compressor.estimateTokens(out)).toBeLessThanOrEqual(30);
    // Every word in the truncated body must be a complete vocabulary word.
    const body = out
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("…"))
      .join(" ");
    for (const word of body.split(/\s+/).filter(Boolean)) {
      expect(vocabulary).toContain(word);
    }
  });

  it("returns '' when the only section is one giant unbreakable word", () => {
    const out = compressor.compress([section("a", "x".repeat(10_000), 10)], {
      prompt: "",
      maxTokens: 20,
    });
    expect(out).toBe("");
  });

  it("compresses a 1 MB section quickly and within budget", () => {
    const content = "lorem ipsum dolor sit amet ".repeat(40_000); // > 1 MB
    expect(content.length).toBeGreaterThan(1_000_000);
    const started = Date.now();
    const out = compressor.compress([section("big", content, 10, "Big")], {
      prompt: "",
      maxTokens: 50,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(compressor.estimateTokens(out)).toBeLessThanOrEqual(50);
    expect(out).toContain("… (truncated)");
  });

  it("never produces lone surrogates when truncating emoji-heavy content", () => {
    const content = Array.from({ length: 2000 }, () => "🦄🚀😀").join(" ");
    const out = compressor.compress([section("emoji", content, 10, "Emoji")], {
      prompt: "",
      maxTokens: 25,
    });
    // No lone surrogates: every high surrogate is followed by a low one and vice versa.
    const loneSurrogate =
      /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
    expect(loneSurrogate.test(out)).toBe(false);
  });

  it("returns '' when the budget cannot even hold the header", () => {
    const out = compressor.compress([section("a", "hello world", 10)], {
      prompt: "",
      maxTokens: 2, // header alone is ~5 tokens
    });
    expect(out).toBe("");
  });
});

describe("cutAtWordBoundary", () => {
  it("returns trimmed input when it already fits", () => {
    expect(cutAtWordBoundary("hello world  ", 100)).toBe("hello world");
  });

  it("cuts at the last whitespace within the limit", () => {
    expect(cutAtWordBoundary("alpha bravo charlie", 13)).toBe("alpha bravo");
  });

  it("returns '' for non-positive budgets or unbreakable text", () => {
    expect(cutAtWordBoundary("hello", 0)).toBe("");
    expect(cutAtWordBoundary("hello", -3)).toBe("");
    expect(cutAtWordBoundary("supercalifragilistic", 5)).toBe("");
  });
});
