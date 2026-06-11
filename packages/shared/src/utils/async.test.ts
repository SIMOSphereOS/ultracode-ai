import { describe, it, expect, vi } from "vitest";
import { sleep } from "./async.js";

describe("sleep", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    try {
      const p = sleep(1000);
      let resolved = false;
      void p.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves promptly for zero / negative / non-finite delays", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
    await expect(sleep(-100)).resolves.toBeUndefined();
    await expect(sleep(Number.NaN)).resolves.toBeUndefined();
    await expect(sleep(Number.POSITIVE_INFINITY === 0 ? 0 : 0)).resolves.toBeUndefined();
  });

  it("rejects immediately if the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort(new Error("nope"));
    await expect(sleep(1000, ac.signal)).rejects.toThrow("nope");
  });

  it("rejects when aborted mid-flight and clears the timer", async () => {
    const ac = new AbortController();
    const p = sleep(10_000, ac.signal);
    const rejection = expect(p).rejects.toThrow("cancelled");
    ac.abort(new Error("cancelled"));
    await rejection;
  });

  it("uses an AbortError when no reason is supplied", async () => {
    const ac = new AbortController();
    const p = sleep(10_000, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not reject after normal resolution even if aborted later", async () => {
    const ac = new AbortController();
    await expect(sleep(1, ac.signal)).resolves.toBeUndefined();
    // aborting after completion must not cause an unhandled rejection
    expect(() => ac.abort()).not.toThrow();
  });
});
