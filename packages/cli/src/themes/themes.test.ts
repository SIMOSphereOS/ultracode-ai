import { describe, expect, it } from "vitest";
import { dark, dracula, light, ThemeManager } from "./index.js";

describe("ThemeManager", () => {
  it("registers the three built-in themes", () => {
    expect(new ThemeManager().list()).toEqual(["dark", "light", "dracula"]);
  });

  it("resolves themes case-insensitively and with whitespace", () => {
    const m = new ThemeManager();
    expect(m.get("DRACULA")).toBe(dracula);
    expect(m.get("  Light ")).toBe(light);
    expect(m.has(" DARK ")).toBe(true);
  });

  it("falls back to dark for unknown, empty or missing names", () => {
    const m = new ThemeManager();
    expect(m.get("solarized")).toBe(dark);
    expect(m.get("")).toBe(dark);
    expect(m.get(undefined)).toBe(dark);
    expect(m.get("💥")).toBe(dark);
  });

  it("accepts extra themes which may override built-ins", () => {
    const custom = { ...dark, name: "custom", primary: "#123456" };
    const darkOverride = { ...light, name: "dark" };
    const m = new ThemeManager([custom, darkOverride]);
    expect(m.get("custom").primary).toBe("#123456");
    expect(m.get("dark")).toBe(darkOverride);
  });

  it("every theme provides the full token set", () => {
    for (const t of [dark, light, dracula]) {
      for (const key of [
        "primary",
        "secondary",
        "accent",
        "text",
        "dim",
        "success",
        "warning",
        "error",
        "user",
        "assistant",
        "tool",
      ] as const) {
        expect(t[key], `${t.name}.${key}`).toBeTruthy();
      }
    }
  });
});
