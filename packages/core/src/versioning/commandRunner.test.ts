/**
 * XPLAT-001: the default command runner must launch executables through
 * `cmd.exe /d /s /c …` on Windows (so `.cmd`/`.bat` shims like npm/pnpm/vitest
 * resolve) and spawn directly without a shell on every other platform.
 *
 * `node:child_process` is mocked so the win32 branch is exercised
 * deterministically without actually running on Windows.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

/** A minimal fake child process that closes with exit code 0 on next tick. */
function fakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: () => void };
    stderr: EventEmitter & { setEncoding: () => void };
  };
  const mkStream = (): EventEmitter & { setEncoding: () => void } => {
    const s = new EventEmitter() as EventEmitter & { setEncoding: () => void };
    s.setEncoding = (): void => undefined;
    return s;
  };
  child.stdout = mkStream();
  child.stderr = mkStream();
  setImmediate(() => child.emit("close", 0));
  return child;
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => fakeChild());
});

afterEach(() => {
  vi.resetModules();
});

describe("createDefaultCommandRunner", () => {
  it("runs through cmd.exe on win32", async () => {
    const { createDefaultCommandRunner } = await import("./QualityGateSystem.js");
    const runner = createDefaultCommandRunner("win32");
    const result = await runner("pnpm", ["test"], { cwd: "/repo" });

    expect(result.exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], { cwd: string }];
    expect(cmd).toBe("cmd.exe");
    expect(args).toEqual(["/d", "/s", "/c", "pnpm", "test"]);
    expect(opts.cwd).toBe("/repo");
  });

  it("spawns directly without a shell on non-win32", async () => {
    const { createDefaultCommandRunner } = await import("./QualityGateSystem.js");
    const runner = createDefaultCommandRunner("linux");
    await runner("pnpm", ["test"], { cwd: "/repo" });

    const [cmd, args, opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { cwd: string; shell?: boolean },
    ];
    expect(cmd).toBe("pnpm");
    expect(args).toEqual(["test"]);
    expect(opts.shell).toBe(false);
  });
});
