/**
 * Theme registry for the interactive UI.
 *
 * Built-in themes: `dark` (default), `light`, `dracula`. The
 * {@link ThemeManager} always falls back to `dark` for unknown names, so the
 * UI can never end up without colour tokens.
 */

import type { Theme } from "./theme.js";
import { dark } from "./dark.js";
import { dracula } from "./dracula.js";
import { light } from "./light.js";

export type { Theme } from "./theme.js";
export { dark, light, dracula };

/** Name → theme lookup with a guaranteed `dark` fallback. */
export class ThemeManager {
  private readonly themes = new Map<string, Theme>();

  /**
   * @param extra - additional themes to register (e.g. a user `custom` theme);
   *   they may override the built-ins by name.
   */
  constructor(extra: ReadonlyArray<Theme> = []) {
    for (const t of [dark, light, dracula, ...extra]) {
      this.themes.set(t.name.toLowerCase(), t);
    }
  }

  /** All registered theme names (lowercase, registration order). */
  list(): string[] {
    return [...this.themes.keys()];
  }

  /** Whether `name` resolves to a registered theme (case-insensitive). */
  has(name: string): boolean {
    return this.themes.has(name.trim().toLowerCase());
  }

  /**
   * Resolve a theme by name (case-insensitive). Unknown, empty or missing
   * names fall back to the `dark` theme.
   */
  get(name?: string): Theme {
    if (typeof name === "string") {
      const found = this.themes.get(name.trim().toLowerCase());
      if (found) return found;
    }
    return dark;
  }
}
