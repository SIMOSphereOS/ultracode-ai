import { describe, expect, it, vi } from "vitest";
import type { LogSink } from "./logger.js";
import { ConsoleLogger, NoopLogger } from "./logger.js";

function makeSink(): LogSink & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("ConsoleLogger", () => {
  it("filters below the configured level", () => {
    const sink = makeSink();
    const log = new ConsoleLogger({ level: "warn", sink });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith("w", undefined);
    expect(sink.error).toHaveBeenCalledWith("e", undefined);
  });

  it("defaults to info level", () => {
    const sink = makeSink();
    const log = new ConsoleLogger({ sink });
    log.debug("d");
    log.info("i");
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).toHaveBeenCalledOnce();
  });

  it("passes meta through", () => {
    const sink = makeSink();
    const log = new ConsoleLogger({ level: "debug", sink });
    log.info("hello", { user: 1 });
    expect(sink.info).toHaveBeenCalledWith("hello", { user: 1 });
  });

  it("suppresses everything in silent mode", () => {
    const sink = makeSink();
    const log = new ConsoleLogger({ level: "debug", silent: true, sink });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.error).not.toHaveBeenCalled();
  });

  it("setLevel and setSilent mutate behaviour at runtime", () => {
    const sink = makeSink();
    const log = new ConsoleLogger({ level: "error", sink });
    log.info("i1");
    expect(sink.info).not.toHaveBeenCalled();
    log.setLevel("debug");
    log.info("i2");
    expect(sink.info).toHaveBeenCalledOnce();
    log.setSilent(true);
    log.info("i3");
    expect(sink.info).toHaveBeenCalledOnce();
  });

  it("defaults to the global console sink", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = new ConsoleLogger({ level: "debug" });
    log.error("boom", { x: 1 });
    expect(spy).toHaveBeenCalledWith("boom", { x: 1 });
    spy.mockRestore();
  });
});

describe("NoopLogger", () => {
  it("never throws and produces no output", () => {
    const log = new NoopLogger();
    expect(() => {
      log.debug("d", { a: 1 });
      log.info("i");
      log.warn("w");
      log.error("e");
    }).not.toThrow();
  });
});
