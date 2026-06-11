import { describe, expect, it } from "vitest";
import { DoublePress } from "./ctrl-c.js";

describe("DoublePress", () => {
  it("requires two presses within the window", () => {
    const d = new DoublePress(1500);
    expect(d.press(1000)).toBe(false);
    expect(d.press(2000)).toBe(true);
  });

  it("rejects presses outside the window", () => {
    const d = new DoublePress(1500);
    expect(d.press(1000)).toBe(false);
    expect(d.press(3000)).toBe(false);
    expect(d.press(3100)).toBe(true);
  });

  it("the first press is never a double press", () => {
    expect(new DoublePress().press(0)).toBe(false);
  });
});
