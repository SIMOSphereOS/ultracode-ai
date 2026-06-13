import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { suppressSqliteExperimentalWarning } from "./index.js";

/**
 * A minimal stand-in for `process` exposing only the warning-listener surface
 * the suppressor touches. Importing `./index.js` does not run the CLI because
 * the auto-run is guarded by an `isMainModule()` check.
 */
function makeProc(): NodeJS.Process & EventEmitter {
  const emitter = new EventEmitter();
  // `emitWarning` is what Node uses internally; here we just route through emit.
  return emitter as unknown as NodeJS.Process & EventEmitter;
}

function sqliteWarning(): Error {
  const w = new Error(
    "SQLite is an experimental feature and might change at any time",
  );
  w.name = "ExperimentalWarning";
  return w;
}

describe("suppressSqliteExperimentalWarning", () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("swallows the node:sqlite ExperimentalWarning", () => {
    const proc = makeProc();
    const seen = vi.fn();
    proc.on("warning", seen);

    dispose = suppressSqliteExperimentalWarning(proc);
    proc.emit("warning", sqliteWarning());

    expect(seen).not.toHaveBeenCalled();
  });

  it("passes through unrelated ExperimentalWarnings", () => {
    const proc = makeProc();
    const seen = vi.fn();
    proc.on("warning", seen);

    dispose = suppressSqliteExperimentalWarning(proc);
    const other = new Error("VM Modules is an experimental feature");
    other.name = "ExperimentalWarning";
    proc.emit("warning", other);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toBe(other);
  });

  it("passes through non-experimental warnings", () => {
    const proc = makeProc();
    const seen = vi.fn();
    proc.on("warning", seen);

    dispose = suppressSqliteExperimentalWarning(proc);
    const deprecation = new Error("SQLite-ish but a DeprecationWarning");
    deprecation.name = "DeprecationWarning";
    proc.emit("warning", deprecation);

    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("restores the original listeners when disposed", () => {
    const proc = makeProc();
    const seen = vi.fn();
    proc.on("warning", seen);

    suppressSqliteExperimentalWarning(proc)();
    proc.emit("warning", sqliteWarning());

    // After disposal the original listener is back and sees the warning again.
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
