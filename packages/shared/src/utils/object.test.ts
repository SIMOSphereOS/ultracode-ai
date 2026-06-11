import { describe, it, expect } from "vitest";
import { deepMerge, isPlainObject } from "./object.js";

describe("isPlainObject", () => {
  it("accepts plain objects and null-prototype objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("rejects non-plain values", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject("s")).toBe(false);
    expect(isPlainObject(() => {})).toBe(false);
    class Foo {}
    expect(isPlainObject(new Foo())).toBe(false);
  });
});

describe("deepMerge", () => {
  it("merges nested objects key by key", () => {
    const base = { a: 1, nested: { x: 1, y: 2 } };
    const out = deepMerge(base, { nested: { y: 99, z: 3 } });
    expect(out).toEqual({ a: 1, nested: { x: 1, y: 99, z: 3 } });
  });

  it("does not mutate its inputs", () => {
    const base = { nested: { x: 1 } };
    const override = { nested: { y: 2 } };
    const out = deepMerge(base, override);
    expect(base).toEqual({ nested: { x: 1 } });
    expect(override).toEqual({ nested: { y: 2 } });
    expect(out).not.toBe(base);
    expect(out.nested).not.toBe(base.nested);
  });

  it("replaces arrays wholesale (no concat / element-merge)", () => {
    const out = deepMerge({ list: [1, 2, 3] }, { list: [9] });
    expect(out).toEqual({ list: [9] });
  });

  it("skips undefined override values (keeps base)", () => {
    const out = deepMerge({ a: 1, b: 2 }, { a: undefined, b: 5 });
    expect(out).toEqual({ a: 1, b: 5 });
  });

  it("allows null to overwrite", () => {
    const out = deepMerge({ a: 1 }, { a: null });
    expect(out).toEqual({ a: null });
  });

  it("handles undefined / non-object override by cloning base", () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
    const cloned = deepMerge({ a: 1 }, undefined);
    expect(cloned).toEqual({ a: 1 });
  });

  it("a non-object override replaces base entirely", () => {
    expect(deepMerge<unknown>({ a: 1 }, 42)).toBe(42);
    expect(deepMerge<unknown>({ a: 1 }, "x")).toBe("x");
    expect(deepMerge<unknown>({ a: 1 }, [1, 2])).toEqual([1, 2]);
  });

  it("a class instance / Date in override replaces wholesale", () => {
    const d = new Date();
    const out = deepMerge({ when: { old: true } } as Record<string, unknown>, { when: d });
    expect(out.when).toBe(d);
  });

  it("deeply nested merge", () => {
    const base = { l1: { l2: { l3: { keep: 1 } } } };
    const out = deepMerge(base, { l1: { l2: { l3: { add: 2 } } } });
    expect(out).toEqual({ l1: { l2: { l3: { keep: 1, add: 2 } } } });
  });

  describe("prototype pollution defence", () => {
    it("ignores __proto__ in override (JSON.parse vector)", () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}}') as unknown;
      const out = deepMerge<Record<string, unknown>>({ safe: 1 }, malicious);
      expect(out).toEqual({ safe: 1 });
      // global Object prototype is untouched
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("ignores constructor / prototype keys", () => {
      const malicious = JSON.parse(
        '{"constructor": {"prototype": {"polluted": true}}, "prototype": {"x": 1}}',
      ) as unknown;
      const out = deepMerge<Record<string, unknown>>({ a: 1 }, malicious);
      expect(out).toEqual({ a: 1 });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("does not pollute through a nested __proto__", () => {
      const malicious = JSON.parse('{"nested": {"__proto__": {"polluted": true}}}') as unknown;
      const out = deepMerge<Record<string, unknown>>({ nested: { ok: 1 } }, malicious);
      expect(out).toEqual({ nested: { ok: 1 } });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });
});
