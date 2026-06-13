/**
 * Tests for the interactive Ink UI bootstrap.
 *
 * `ink`'s `render` is stubbed (no real TTY/React reconciler) so the test runs
 * offline and deterministically, mirroring the Ink-testing approach used in
 * `app.test.tsx`. We assert the bootstrap wires the injected `createFacade` into
 * the rendered {@link App}, disables Ink's own Ctrl+C exit, blocks until the UI
 * exits, and always disposes the facade.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "ultracode-shared";

/* ------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* ------------------------------------------------------------------------- */

/** Captured arguments + a release handle for the stubbed `render`. */
const renderState: {
  element?: { props: Record<string, unknown> };
  options?: { exitOnCtrlC?: boolean };
  release?: () => void;
  waitUntilExit: ReturnType<typeof vi.fn>;
} = {
  waitUntilExit: vi.fn(),
};

vi.mock("ink", () => ({
  // The App tree (App.tsx + children) imports these primitives; the `App` is
  // never actually rendered here (render is stubbed), but providing them keeps
  // module evaluation safe.
  Box: () => null,
  Text: () => null,
  useApp: () => ({ exit: vi.fn() }),
  useInput: () => {},
  render: vi.fn((element: { props: Record<string, unknown> }, options?: { exitOnCtrlC?: boolean }) => {
    renderState.element = element;
    renderState.options = options;
    return {
      waitUntilExit: renderState.waitUntilExit,
      unmount: vi.fn(),
      clear: vi.fn(),
      rerender: vi.fn(),
    };
  }),
}));

// Import after the mock is registered.
import { render as inkRender } from "ink";
import { startInteractive } from "./start.js";
import type { CliContext, UltraCodeFacade } from "../context.js";

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* ------------------------------------------------------------------------- */

function makeFacade(): UltraCodeFacade {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    dispose: vi.fn(async () => {}),
  } as unknown as UltraCodeFacade;
}

function makeCtx(facade: UltraCodeFacade, over: Partial<CliContext> = {}): CliContext {
  return {
    cwd: "/work/dir",
    env: {},
    homedir: "/home/user",
    nodeVersion: "22.13.0",
    stdout: { write: () => true, isTTY: true },
    stderr: { write: () => true, isTTY: true },
    stdin: { isTTY: true, on: () => {}, removeListener: () => {} },
    createFacade: vi.fn(async () => facade),
    gitVersion: vi.fn(async () => "git version 2.43.0"),
    ...over,
  } as CliContext;
}

afterEach(() => {
  vi.clearAllMocks();
  renderState.element = undefined;
  renderState.options = undefined;
});

/* ------------------------------------------------------------------------- */
/* Tests                                                                      */
/* ------------------------------------------------------------------------- */

describe("startInteractive", () => {
  it("creates the facade for the context cwd and renders the App wired to it", async () => {
    const facade = makeFacade();
    const ctx = makeCtx(facade);
    renderState.waitUntilExit.mockResolvedValue(undefined);

    await expect(startInteractive(ctx)).resolves.toBeUndefined();

    // Facade built against the context working directory.
    expect(ctx.createFacade).toHaveBeenCalledWith({ cwd: "/work/dir" });

    // Rendered exactly once, with Ink's own Ctrl+C handling disabled.
    expect(inkRender).toHaveBeenCalledTimes(1);
    expect(renderState.options).toEqual({ exitOnCtrlC: false });

    // The App element carries the facade and the configured initial theme.
    expect(renderState.element?.props.facade).toBe(facade);
    expect(renderState.element?.props.initialTheme).toBe(facade.config.ui.theme);

    // Blocks until the UI exits, then disposes the facade.
    expect(renderState.waitUntilExit).toHaveBeenCalledTimes(1);
    expect(facade.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the facade even when the UI exit rejects (and swallows dispose errors)", async () => {
    const facade = makeFacade();
    (facade.dispose as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("dispose boom"));
    const ctx = makeCtx(facade);
    renderState.waitUntilExit.mockRejectedValue(new Error("ink crashed"));

    // The primary error propagates; the dispose failure is swallowed by safeDispose.
    await expect(startInteractive(ctx)).rejects.toThrow("ink crashed");
    expect(facade.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not render when facade creation throws, and surfaces the error", async () => {
    const ctx = makeCtx(makeFacade(), {
      createFacade: vi.fn(async () => {
        throw new Error("config exploded");
      }),
    });

    await expect(startInteractive(ctx)).rejects.toThrow("config exploded");
    expect(inkRender).not.toHaveBeenCalled();
  });
});
