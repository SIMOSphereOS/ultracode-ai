import { describe, expect, it, vi } from "vitest";
import type { ToolExecutedEvent, UltraCodeEvent } from "../types/events.js";
import { EventBus } from "./EventBus.js";

const toolEvent: ToolExecutedEvent = {
  type: "tool.executed",
  toolName: "read",
  ok: true,
  durationMs: 5,
};

describe("EventBus", () => {
  it("delivers events to subscribers of the matching type", () => {
    const bus = new EventBus();
    const seen: UltraCodeEvent[] = [];
    bus.on("tool.executed", (e) => seen.push(e));
    bus.emit(toolEvent);
    expect(seen).toEqual([toolEvent]);
  });

  it("does not deliver to non-matching types", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("agent.switched", handler);
    bus.emit(toolEvent);
    expect(handler).not.toHaveBeenCalled();
  });

  it("narrows the event type for the handler", () => {
    const bus = new EventBus();
    bus.on("tool.executed", (e) => {
      // type-level: e is ToolExecutedEvent, so toolName is accessible
      expect(e.toolName).toBe("read");
    });
    bus.emit(toolEvent);
  });

  it("supports multiple handlers for one type", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("tool.executed", a);
    bus.on("tool.executed", b);
    bus.emit(toolEvent);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("emit on a type with no subscribers is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.emit(toolEvent)).not.toThrow();
  });

  describe("unsubscribe", () => {
    it("stops delivery after unsubscribe", () => {
      const bus = new EventBus();
      const handler = vi.fn();
      const off = bus.on("tool.executed", handler);
      bus.emit(toolEvent);
      off();
      bus.emit(toolEvent);
      expect(handler).toHaveBeenCalledOnce();
      expect(bus.listenerCount("tool.executed")).toBe(0);
    });

    it("is idempotent", () => {
      const bus = new EventBus();
      const handler = vi.fn();
      const off = bus.on("tool.executed", handler);
      off();
      expect(() => {
        off();
        off();
      }).not.toThrow();
      expect(bus.listenerCount("tool.executed")).toBe(0);
    });
  });

  describe("handler isolation", () => {
    it("a throwing handler does not prevent siblings from running", () => {
      const onHandlerError = vi.fn();
      const bus = new EventBus({ onHandlerError });
      const after = vi.fn();
      bus.on("tool.executed", () => {
        throw new Error("boom");
      });
      bus.on("tool.executed", after);
      bus.emit(toolEvent);
      expect(after).toHaveBeenCalledOnce();
      expect(onHandlerError).toHaveBeenCalledOnce();
      expect(onHandlerError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(onHandlerError.mock.calls[0]?.[1]).toEqual(toolEvent);
    });

    it("a throwing error reporter does not break dispatch", () => {
      const bus = new EventBus({
        onHandlerError: () => {
          throw new Error("reporter exploded");
        },
      });
      const after = vi.fn();
      bus.on("tool.executed", () => {
        throw new Error("boom");
      });
      bus.on("tool.executed", after);
      expect(() => bus.emit(toolEvent)).not.toThrow();
      expect(after).toHaveBeenCalledOnce();
    });

    it("defaults to console.error when no reporter is supplied", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const bus = new EventBus();
      bus.on("tool.executed", () => {
        throw new Error("boom");
      });
      bus.emit(toolEvent);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("mutation during emit", () => {
    it("unsubscribe during emit does not disturb the current dispatch", () => {
      const bus = new EventBus();
      const order: string[] = [];
      let offB: (() => void) | undefined;
      const a = (): void => {
        order.push("a");
        offB?.(); // remove b mid-dispatch
      };
      const b = (): void => {
        order.push("b");
      };
      bus.on("tool.executed", a);
      offB = bus.on("tool.executed", b);
      bus.emit(toolEvent);
      // b was already in the snapshot, so it still runs this round
      expect(order).toEqual(["a", "b"]);
      // but is gone next round
      order.length = 0;
      bus.emit(toolEvent);
      expect(order).toEqual(["a"]);
    });

    it("subscribe during emit does not invoke the new handler this round", () => {
      const bus = new EventBus();
      const late = vi.fn();
      bus.on("tool.executed", () => {
        bus.on("tool.executed", late);
      });
      bus.emit(toolEvent);
      expect(late).not.toHaveBeenCalled();
      bus.emit(toolEvent);
      expect(late).toHaveBeenCalledOnce();
    });
  });

  describe("removeAll", () => {
    it("clears a single type", () => {
      const bus = new EventBus();
      bus.on("tool.executed", vi.fn());
      bus.on("agent.switched", vi.fn());
      bus.removeAll("tool.executed");
      expect(bus.listenerCount("tool.executed")).toBe(0);
      expect(bus.listenerCount("agent.switched")).toBe(1);
    });

    it("clears everything when called without a type", () => {
      const bus = new EventBus();
      bus.on("tool.executed", vi.fn());
      bus.on("agent.switched", vi.fn());
      bus.removeAll();
      expect(bus.listenerCount("tool.executed")).toBe(0);
      expect(bus.listenerCount("agent.switched")).toBe(0);
    });
  });
});
