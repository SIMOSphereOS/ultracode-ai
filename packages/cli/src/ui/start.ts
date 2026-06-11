/**
 * Bootstrap for the interactive Ink UI.
 *
 * Kept in its own module (and imported dynamically from `program.ts`) so that
 * non-interactive commands never pay the cost of loading Ink/React.
 */

import React from "react";
import { render } from "ink";
import type { CliContext } from "../context.js";
import { safeDispose } from "../context.js";
import { App } from "./App.js";

/**
 * Create the facade, render the {@link App} and block until the UI exits.
 * `exitOnCtrlC` is disabled — the App implements double-Ctrl+C itself.
 */
export async function startInteractive(ctx: CliContext): Promise<void> {
  const facade = await ctx.createFacade({ cwd: ctx.cwd });
  try {
    const instance = render(
      React.createElement(App, { facade, initialTheme: facade.config.ui.theme }),
      { exitOnCtrlC: false },
    );
    await instance.waitUntilExit();
  } finally {
    await safeDispose(facade);
  }
}
