import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors.js";
import { deepMerge, isPlainObject, MAX_MERGE_DEPTH } from "./object.js";

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

  describe("cycle and depth protection (EXT-003)", () => {
    it("throws a controlled ValidationError on a circular override (not RangeError)", () => {
      const override: Record<string, unknown> = { a: 1 };
      override.self = override; // direct cycle
      expect(() => deepMerge<Record<string, unknown>>({ base: 1 }, override)).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError on a circular base", () => {
      const base: Record<string, unknown> = { a: 1 };
      base.self = base;
      expect(() => deepMerge<Record<string, unknown>>(base, { b: 2 })).toThrow(ValidationError);
    });

    it("throws ValidationError on a circular array reference", () => {
      const arr: unknown[] = [1, 2];
      arr.push(arr);
      expect(() => deepMerge<Record<string, unknown>>({}, { list: arr })).toThrow(ValidationError);
    });

    it("throws a controlled ValidationError on pathologically deep nesting (not stack crash)", () => {
      // Build a 1000-level-deep override object.
      let deep: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 1000; i += 1) deep = { child: deep };
      expect(() => deepMerge<Record<string, unknown>>({}, deep)).toThrow(ValidationError);
      expect(() => deepMerge<Record<string, unknown>>({}, deep)).toThrow(/maximum nesting depth/);
    });

    it("merges normally within the depth limit", () => {
      // Nest just under the limit so it succeeds.
      let deep: Record<string, unknown> = { leaf: 1 };
      for (let i = 0; i < MAX_MERGE_DEPTH - 5; i += 1) deep = { child: deep };
      const out = deepMerge<Record<string, unknown>>({ keep: 1 }, deep);
      expect(out.keep).toBe(1);
      expect(out.child).toBeDefined();
    });

    it("leaves ordinary merges unchanged", () => {
      const out = deepMerge({ a: 1, nested: { x: 1 } }, { nested: { y: 2 } });
      expect(out).toEqual({ a: 1, nested: { x: 1, y: 2 } });
    });
  });
});
