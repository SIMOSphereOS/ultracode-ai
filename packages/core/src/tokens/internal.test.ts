import { describe, expect, it } from "vitest";
import {
  normalizeProseWhitespace,
  splitBlocks,
  splitCodeFences,
  truncateAtWord,
} from "./internal.js";

describe("splitCodeFences", () => {
  it("reconstructs the input exactly", () => {
    const text = "before\n```js\ncode  here\n```\nafter";
    const segments = splitCodeFences(text);
    expect(segments.map((s) => s.text).join("\n")).toBe(text);
  });

  it("marks fenced spans as code", () => {
    const segments = splitCodeFences("a\n```\nx\n```\nb");
    expect(segments.some((s) => s.kind === "code")).toBe(true);
  });

  it("treats an unterminated fence as code to end of string", () => {
    const segments = splitCodeFences("intro\n```\nno close here");
    const last = segments[segments.length - 1];
    expect(last?.kind).toBe("code");
  });
});

describe("splitBlocks", () => {
  it("splits prose on blank lines and keeps code atomic", () => {
    const blocks = splitBlocks("p1\n\np2\n\n```\nl1\n\nl2\n```");
    expect(blocks.some((b) => b.trim() === "p1")).toBe(true);
    expect(blocks.some((b) => b.trim() === "p2")).toBe(true);
    expect(blocks.some((b) => b.includes("l1\n\nl2"))).toBe(true);
  });
});

describe("truncateAtWord", () => {
  it("returns empty for non-positive max", () => {
    expect(truncateAtWord("hello", 0)).toBe("");
  });

  it("returns the whole string when short enough", () => {
    expect(truncateAtWord("hi", 10)).toBe("hi");
  });

  it("cuts at a word boundary", () => {
    expect(truncateAtWord("alpha beta gamma", 9)).toBe("alpha");
  });

  it("never splits a surrogate pair", () => {
    // "👍" is a surrogate pair; cutting at length 1 must not leave a lone half.
    const out = truncateAtWord("👍👍👍", 1);
    expect(out).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe("normalizeProseWhitespace", () => {
  it("collapses 3+ blanks to one and trims line ends", () => {
    expect(normalizeProseWhitespace("a  \n\n\n\nb")).toBe("a\n\nb");
  });
});
