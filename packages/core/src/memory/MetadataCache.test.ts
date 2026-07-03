import { describe, expect, it } from "vitest";

import { MetadataCache } from "./MetadataCache.js";

/** Manually advanced fake clock for deterministic TTL tests. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("MetadataCache", () => {
  it("stores and returns values (get/set/has)", () => {
    const cache = new MetadataCache<string, number>({ maxEntries: 10, ttlMs: 1000 });
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.has("a")).toBe(true);
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
    expect(cache.size).toBe(1);
  });

  it("overwrites existing keys and refreshes their TTL", () => {
    const clock = fakeClock();
    const cache = new MetadataCache<string, string>({
      maxEntries: 5,
      ttlMs: 100,
      clock: clock.now,
    });
    cache.set("k", "v1");
    clock.advance(90);
    cache.set("k", "v2"); // refreshes TTL
    clock.advance(90); // 180ms after first set, 90ms after second
    expect(cache.get("k")).toBe("v2");
  });

  it("expires entries exactly at the TTL boundary", () => {
    const clock = fakeClock(1_000);
    const cache = new MetadataCache<string, string>({ maxEntries: 5, ttlMs: 50, clock: clock.now });
    cache.set("k", "v");
    clock.advance(49);
    expect(cache.has("k")).toBe(true);
    expect(cache.get("k")).toBe("v");
    clock.advance(1); // now exactly at expiry
    expect(cache.has("k")).toBe(false);
    expect(cache.get("k")).toBeUndefined();
    // Lazy removal: the stale entry is gone after access.
    expect(cache.size).toBe(0);
  });

  it("never expires entries with ttlMs = Infinity", () => {
    const clock = fakeClock();
    const cache = new MetadataCache<string, string>({
      maxEntries: 2,
      ttlMs: Number.POSITIVE_INFINITY,
      clock: clock.now,
    });
    cache.set("k", "v");
    clock.advance(Number.MAX_SAFE_INTEGER);
    expect(cache.get("k")).toBe("v");
  });

  it("treats ttlMs <= 0 and NaN as immediately stale", () => {
    const clock = fakeClock(10);
    for (const ttl of [0, -100, Number.NaN]) {
      const cache = new MetadataCache<string, string>({
        maxEntries: 2,
        ttlMs: ttl,
        clock: clock.now,
      });
      cache.set("k", "v");
      expect(cache.get("k")).toBeUndefined();
      expect(cache.has("k")).toBe(false);
    }
  });

  it("evicts the least-recently-used entry when full", () => {
    const cache = new MetadataCache<string, number>({ maxEntries: 2, ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1); // refreshes "a" — "b" is now LRU
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("has() does not refresh LRU recency", () => {
    const cache = new MetadataCache<string, number>({ maxEntries: 2, ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.has("a")).toBe(true); // peek only
    cache.set("c", 3); // "a" is still the oldest → evicted
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });

  it("disables storage entirely for maxEntries <= 0 or NaN", () => {
    for (const max of [0, -5, Number.NaN]) {
      const cache = new MetadataCache<string, number>({ maxEntries: max, ttlMs: 1000 });
      cache.set("a", 1);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(0);
    }
  });

  it("floors fractional maxEntries", () => {
    const cache = new MetadataCache<string, number>({ maxEntries: 2.9, ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.size).toBe(2);
  });

  it("invalidate removes a single entry and reports existence", () => {
    const cache = new MetadataCache<string, number>({ maxEntries: 5, ttlMs: 1000 });
    cache.set("a", 1);
    expect(cache.invalidate("a")).toBe(true);
    expect(cache.invalidate("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
  });

  it("clear removes everything", () => {
    const cache = new MetadataCache<string, number>({ maxEntries: 5, ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("supports unicode/emoji keys and large (1 MB) values", () => {
    const cache = new MetadataCache<string, string>({ maxEntries: 3, ttlMs: 1000 });
    const big = "x".repeat(1_048_576);
    cache.set("🦄/ключ/键", big);
    expect(cache.get("🦄/ключ/键")).toBe(big);
    expect(cache.get("🦄/ключ/键")?.length).toBe(1_048_576);
  });

  it("supports object keys (generic K)", () => {
    const cache = new MetadataCache<object, string>({ maxEntries: 3, ttlMs: 1000 });
    const key = { project: "demo" };
    cache.set(key, "meta");
    expect(cache.get(key)).toBe("meta");
    expect(cache.get({ project: "demo" })).toBeUndefined(); // identity, not structural
  });
});
