import { describe, expect, it } from "vitest";
import { clamp } from "./math.js";

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to the lower and upper bounds", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles inclusive bounds", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("swaps inverted bounds", () => {
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(-1, 10, 0)).toBe(0);
    expect(clamp(11, 10, 0)).toBe(10);
  });

  it("returns the lower bound for NaN", () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
  });

  it("works with confidence-style 0..1 ranges", () => {
    expect(clamp(1.5, 0, 1)).toBe(1);
    expect(clamp(-0.2, 0, 1)).toBe(0);
    expect(clamp(0.42, 0, 1)).toBe(0.42);
  });

  it("handles Infinity", () => {
    expect(clamp(Number.POSITIVE_INFINITY, 0, 100)).toBe(100);
    expect(clamp(Number.NEGATIVE_INFINITY, 0, 100)).toBe(0);
  });
});
