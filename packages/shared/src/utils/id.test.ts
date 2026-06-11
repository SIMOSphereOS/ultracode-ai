import { describe, it, expect } from "vitest";
import { generateId } from "./id.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("generateId", () => {
  it("produces a bare UUID without a prefix", () => {
    const id = generateId();
    expect(id).toMatch(UUID_RE);
  });

  it("prefixes with '<prefix>_'", () => {
    const id = generateId("sess");
    expect(id.startsWith("sess_")).toBe(true);
    expect(id.slice("sess_".length)).toMatch(UUID_RE);
  });

  it("treats an empty prefix as no prefix", () => {
    expect(generateId("")).toMatch(UUID_RE);
  });

  it("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId("x")));
    expect(ids.size).toBe(1000);
  });
});
