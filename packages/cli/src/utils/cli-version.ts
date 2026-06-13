/**
 * Robust resolution of the CLI's own version for `--version`.
 *
 * Reads the package's `package.json` via `createRequire` (works from both
 * `src/` during tests and `dist/` after the build) and falls back to the
 * shared protocol {@link VERSION} constant if the file cannot be found.
 */

import { createRequire } from "node:module";
import { VERSION } from "ultracode-shared";

interface PackageJsonLike {
  name?: unknown;
  version?: unknown;
}

/**
 * Resolve the version of the `ultracode` CLI package.
 *
 * @returns the `version` field of the nearest matching `package.json`,
 *   or the shared `VERSION` constant as a last resort.
 */
export function getCliVersion(): string {
  const require = createRequire(import.meta.url);
  // From src/utils or dist/utils the package root is two levels up; keep one
  // level as well in case the file is ever flattened.
  for (const rel of ["../../package.json", "../package.json"]) {
    try {
      const pkg = require(rel) as PackageJsonLike;
      if (pkg.name === "ultracode-ai" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // try next candidate
    }
  }
  return VERSION;
}
