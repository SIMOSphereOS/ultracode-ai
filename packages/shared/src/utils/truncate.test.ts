import { describe, expect, it } from "vitest";
import { truncate } from "./truncate.js";

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("returns empty string unchanged", () => {
    expect(truncate("", 10)).toBe("");
    expect(truncate("", 0)).toBe("");
  });

  it("returns empty for max <= 0", () => {
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -5)).toBe("");
  });

  it("truncates with ellipsis included in the budget", () => {
    const out = truncate("abcdefgh", 5);
    expect(Array.from(out).length).toBe(5);
    expect(out).toBe("abcd…");
  });

  it("uses a custom suffix", () => {
    const out = truncate("abcdefgh", 6, { suffix: "..." });
    expect(out).toBe("abc...");
    expect(out.length).toBe(6);
  });

  it("truncates the suffix itself if it does not fit", () => {
    expect(truncate("abcdef", 2, { suffix: "..." })).toBe("..");
    expect(Array.from(truncate("abcdef", 1)).length).toBe(1);
  });

  it("never splits a surrogate pair / emoji", () => {
    // 5 emoji, each is a surrogate pair (length 2 in UTF-16 units)
    const emoji = "😀😁😂🤣😃";
    expect(emoji.length).toBe(10); // UTF-16 units
    expect(Array.from(emoji).length).toBe(5); // code points
    const out = truncate(emoji, 3); // keep 2 + suffix
    const points = Array.from(out);
    expect(points.length).toBe(3);
    expect(points[0]).toBe("😀");
    expect(points[1]).toBe("😁");
    expect(points[2]).toBe("…");
    // ensure no lone surrogate leaked
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("handles a 1,000,000-character string", () => {
    const big = "x".repeat(1_000_000);
    const out = truncate(big, 100);
    expect(Array.from(out).length).toBe(100);
    expect(out.endsWith("…")).toBe(true);
  });

  it("fast-path: huge string under the unit-length bound is returned as-is", () => {
    const big = "y".repeat(50_000);
    expect(truncate(big, 50_000)).toBe(big);
    expect(truncate(big, 60_000)).toBe(big);
  });
});
