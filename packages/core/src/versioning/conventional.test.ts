import { describe, expect, it } from "vitest";
import { hasBreakingFooter, parseConventionalSubject } from "./conventional.js";

describe("parseConventionalSubject", () => {
  it("parses type, scope and description", () => {
    expect(parseConventionalSubject("feat(api): add endpoint")).toEqual({
      type: "feat",
      scope: "api",
      description: "add endpoint",
      breakingMarker: false,
    });
  });

  it("parses the breaking marker (!)", () => {
    const parsed = parseConventionalSubject("feat(core)!: drop node 16");
    expect(parsed.breakingMarker).toBe(true);
    expect(parsed.type).toBe("feat");
    expect(parsed.scope).toBe("core");
  });

  it("parses scopeless subjects and lower-cases the type", () => {
    const parsed = parseConventionalSubject("Fix: typo");
    expect(parsed.type).toBe("fix");
    expect(parsed.scope).toBeNull();
  });

  it("is tolerant with non-conventional subjects", () => {
    const parsed = parseConventionalSubject("just a random message");
    expect(parsed.type).toBeNull();
    expect(parsed.scope).toBeNull();
    expect(parsed.description).toBe("just a random message");
  });

  it("handles unicode/emoji subjects", () => {
    const parsed = parseConventionalSubject("feat: ✨ Grüße aus Aschaffenburg 🚀");
    expect(parsed.type).toBe("feat");
    expect(parsed.description).toBe("✨ Grüße aus Aschaffenburg 🚀");
  });

  it("treats an empty scope as null", () => {
    expect(parseConventionalSubject("feat(): empty scope").scope).toBeNull();
  });

  it("handles empty and huge inputs without throwing", () => {
    expect(parseConventionalSubject("").type).toBeNull();
    const huge = `feat: ${"x".repeat(1_048_576)}`;
    expect(parseConventionalSubject(huge).type).toBe("feat");
  });
});

describe("hasBreakingFooter", () => {
  it("detects BREAKING CHANGE and BREAKING-CHANGE footers", () => {
    expect(hasBreakingFooter("BREAKING CHANGE: api removed")).toBe(true);
    expect(hasBreakingFooter("some body\r\nBREAKING-CHANGE: gone")).toBe(true);
  });

  it("does not match plain bodies", () => {
    expect(hasBreakingFooter("this change is not breaking anything")).toBe(false);
    expect(hasBreakingFooter("")).toBe(false);
  });
});
