import type { ChatMessage } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { HeuristicTokenCounter } from "./TokenCounter.js";

const counter = new HeuristicTokenCounter();

describe("HeuristicTokenCounter.count", () => {
  it("returns 0 for empty input", () => {
    expect(counter.count("")).toBe(0);
  });

  it("returns at least 1 for any non-empty input", () => {
    expect(counter.count("a")).toBeGreaterThanOrEqual(1);
    expect(counter.count(" ")).toBeGreaterThanOrEqual(1);
    expect(counter.count("\n\n\n")).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic (equal input → equal output)", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    expect(counter.count(text)).toBe(counter.count(text));
  });

  it("is monotonic: a prefix never costs more than the whole", () => {
    const whole = "alpha beta gamma delta epsilon zeta eta theta";
    const prefix = whole.slice(0, 20);
    expect(counter.count(prefix)).toBeLessThanOrEqual(counter.count(whole));
  });

  it("estimates English prose within a sane band", () => {
    // ~9 words / ~44 chars → roughly 9-15 tokens.
    const text = "The quick brown fox jumps over the lazy dog.";
    const n = counter.count(text);
    expect(n).toBeGreaterThan(6);
    expect(n).toBeLessThan(20);
  });

  it("does not count whitespace runs as many tokens", () => {
    const sparse = counter.count("a" + " ".repeat(500) + "b");
    const dense = counter.count("a".repeat(500));
    expect(sparse).toBeLessThan(dense);
  });

  it("charges CJK codepoints more than their Latin equivalent", () => {
    const cjk = counter.count("漢字漢字漢字漢字漢字");
    const latin = counter.count("aaaaaaaaaa");
    expect(cjk).toBeGreaterThan(latin);
  });

  it("handles emoji / astral codepoints without splitting surrogate pairs", () => {
    const emoji = "👍🏽🎉🚀😀";
    expect(() => counter.count(emoji)).not.toThrow();
    expect(Number.isFinite(counter.count(emoji))).toBe(true);
    expect(counter.count(emoji)).toBeGreaterThanOrEqual(1);
  });

  it("handles a lone surrogate without throwing", () => {
    const lone = "\uD83D"; // high surrogate with no pair
    expect(() => counter.count(lone)).not.toThrow();
    expect(Number.isFinite(counter.count(lone))).toBe(true);
  });

  it("is robust and finite on a >=1MB input", () => {
    const big = "lorem ipsum dolor ".repeat(60_000); // ~1.1 MB
    expect(big.length).toBeGreaterThan(1_000_000);
    const n = counter.count(big);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it("treats non-string input defensively", () => {
    expect(counter.count(undefined as unknown as string)).toBe(0);
  });
});

describe("HeuristicTokenCounter.countMessages", () => {
  it("returns 0 for an empty list", () => {
    expect(counter.countMessages([])).toBe(0);
  });

  it("adds per-message overhead over raw content", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const viaMessages = counter.countMessages(messages);
    const viaContent = counter.count("hello") + counter.count("world");
    expect(viaMessages).toBeGreaterThan(viaContent);
  });

  it("charges extra for tool-call envelopes", () => {
    const plain: ChatMessage[] = [{ role: "assistant", content: "ok" }];
    const withCall: ChatMessage[] = [
      {
        role: "assistant",
        content: "ok",
        toolCalls: [{ id: "t1", name: "read", arguments: { path: "x" } }],
      },
    ];
    expect(counter.countMessages(withCall)).toBeGreaterThan(counter.countMessages(plain));
  });

  it("is defensive against non-array input", () => {
    expect(counter.countMessages(undefined as unknown as ChatMessage[])).toBe(0);
  });
});
