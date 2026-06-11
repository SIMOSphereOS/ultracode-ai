/**
 * Indirection module for loading `@ultracode/core`.
 *
 * The CLI never imports `@ultracode/core` statically: the import happens
 * lazily inside {@link loadCore}. This keeps startup fast for non-interactive
 * commands and — crucially — lets tests replace the whole core package by
 * mocking *this local module* (`vi.mock("./core-loader.js", ...)`), which works
 * even while `@ultracode/core` is not built yet.
 */

import type { UltraCode } from "@ultracode/core";

/** Shape of the dynamically imported `@ultracode/core` module. */
export interface CoreModule {
  /** The UltraCode facade class. */
  UltraCode: typeof UltraCode;
}

/**
 * Dynamically import `@ultracode/core`.
 *
 * @returns the core module, exposing the {@link CoreModule.UltraCode} facade.
 */
export async function loadCore(): Promise<CoreModule> {
  // The `@vite-ignore` hint stops Vitest's (Vite's) import analysis from
  // eagerly resolving the not-yet-built core package at transform time.
  // Node's runtime behaviour is unaffected.
  const specifier = "@ultracode/core";
  return (await import(/* @vite-ignore */ specifier)) as CoreModule;
}
