/**
 * Cross-platform `clean` script.
 *
 * Removes every package's build output (`dist/`) and TypeScript incremental
 * build info (`*.tsbuildinfo`). Replaces the old `rm -rf` shell invocation,
 * which is not available on Windows. Uses only Node built-ins — no extra
 * dependency — and resolves paths via `node:path` so it works on Linux, macOS
 * and Windows alike.
 */

import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packagesDir = join(repoRoot, "packages");

/** Remove a path recursively and forcefully (no error if absent). */
function remove(target) {
  rmSync(target, { recursive: true, force: true });
}

if (existsSync(packagesDir)) {
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = join(packagesDir, entry.name);
    remove(join(pkgDir, "dist"));
    // Remove any *.tsbuildinfo files at the package root.
    for (const file of readdirSync(pkgDir, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith(".tsbuildinfo")) {
        remove(join(pkgDir, file.name));
      }
    }
  }
}
