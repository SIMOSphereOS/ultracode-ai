import { describe, expect, it, vi } from "vitest";
import { reportOptimization, TOKENS_OPTIMIZED_EVENT, toTokensOptimizedEvent } from "./events.js";
import type { OptimizeResult } from "./TokenOptimizer.js";

const result: OptimizeResult = {
  payload: { system: "x", tools: [], messages: [] },
  before: { system: 10, tools: 0, messages: 0, context: 0, total: 10 },
  after: { system: 6, tools: 0, messages: 0, context: 0, total: 6 },
  reductionPct: 40,
  perStage: [{ stage: "system-minify", saved: 4 }],
};

describe("toTokensOptimizedEvent", () => {
  it("maps an optimize result onto the core-local event", () => {
    const event = toTokensOptimizedEvent(result);
    expect(event.type).toBe(TOKENS_OPTIMIZED_EVENT);
    expect(event.before).toBe(10);
    expect(event.after).toBe(6);
    expect(event.reductionPct).toBe(40);
    expect(event.perStage).toEqual([{ stage: "system-minify", saved: 4 }]);
  });
});

describe("reportOptimization", () => {
  it("emits the event onto a bus and logs", () => {
    const emit = vi.fn();
    const info = vi.fn();
    const events = { emit } as unknown as Parameters<typeof reportOptimization>[1];
    const logger = { info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    reportOptimization(result, events, logger);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: TOKENS_OPTIMIZED_EVENT }));
    expect(info).toHaveBeenCalledOnce();
  });

  it("never throws when the bus handler throws", () => {
    const events = {
      emit: () => {
        throw new Error("boom");
      },
    } as unknown as Parameters<typeof reportOptimization>[1];
    expect(() => reportOptimization(result, events, undefined)).not.toThrow();
  });

  it("works with no bus and no logger", () => {
    expect(() => reportOptimization(result, undefined, undefined)).not.toThrow();
  });
});
