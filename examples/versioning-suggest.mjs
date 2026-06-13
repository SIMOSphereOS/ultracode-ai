#!/usr/bin/env node
/**
 * Minimal, self-contained example: ask UltraCode's AI versioning system for the
 * next SemVer version of the *current* repository.
 *
 * It exercises a real public API — `createVersioningSystem(...).suggest()` from
 * `@ultracode/core` — entirely offline: the only external process is the local
 * `git` binary that the change analyser shells out to. No network, no LLM, no
 * API key required (the provider is optional; without it the recommender uses
 * its deterministic conventional-commit heuristics).
 *
 * Run from the repo root after a build (`pnpm -r build`):
 *
 *   node examples/versioning-suggest.mjs
 *   node examples/versioning-suggest.mjs <git-range>   # e.g. v1.2.0..HEAD
 *
 * Expected output (shape; numbers vary with history):
 *
 *   UltraCode versioning suggestion
 *   ───────────────────────────────
 *   current   1.3.0
 *   suggested 1.4.0
 *   bump      minor   (confidence 90%)
 *   reasons:
 *     - 3 feature commit(s) since the base version
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

// Import the built core package. When `@ultracode/core` is installed as a
// dependency this is simply `import { createVersioningSystem } from
// "@ultracode/core"`; inside this monorepo (no workspace install required) we
// load the package's compiled entry point by relative path so the example runs
// straight from a fresh checkout after `pnpm -r build`.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const coreEntry = path.join(repoRoot, "packages", "core", "dist", "index.js");

let createVersioningSystem;
try {
  ({ createVersioningSystem } = await import(coreEntry));
} catch (err) {
  process.stderr.write(
    `Could not load @ultracode/core from ${coreEntry}.\n` +
      `Build the workspace first:  pnpm -r build\n` +
      `(${err?.message ?? err})\n`,
  );
  process.exit(1);
}

/** A silent logger — keeps the example free of extra dependencies. */
const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

async function main() {
  // Default to the repository root so the example works no matter the caller's
  // current working directory.
  const cwd = repoRoot;

  // Optional positional arg: a git revision range to analyse (default: last
  // tag → HEAD, resolved internally by the system).
  const range = process.argv[2];

  const versioning = createVersioningSystem({ cwd, logger });

  const suggestion = await versioning.suggest(range);

  const pct = Math.round((suggestion.confidence ?? 0) * 100);
  const lines = [
    "UltraCode versioning suggestion",
    "───────────────────────────────",
    `current   ${suggestion.currentVersion}`,
    `suggested ${suggestion.suggestedVersion}`,
    `bump      ${suggestion.bump}   (confidence ${pct}%)`,
    "reasons:",
    ...suggestion.reasons.map((r) => `  - ${r}`),
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

main().catch((err) => {
  process.stderr.write(`versioning-suggest failed: ${err?.message ?? err}\n`);
  process.exitCode = 1;
});
