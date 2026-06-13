#!/usr/bin/env node
/**
 * UltraCode CLI entry point.
 *
 * All argument parsing, command dispatch and error handling lives in
 * {@link runCli}; this file only forwards `process.argv` and propagates the
 * resulting exit code via `process.exitCode` (never `process.exit`, so
 * pending stdout writes are flushed).
 */

import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCli } from "./program.js";

/**
 * Silence the single `node:sqlite` `ExperimentalWarning` so the CLI's
 * first-run output stays clean.
 *
 * Persistent sessions dynamically import `node:sqlite` (still flagged
 * experimental), which makes Node emit a noisy multi-line warning to stderr on
 * first use. We register a `warning` listener *before* anything loads the module
 * and re-emit every warning except that one — so all other warnings (including
 * unrelated `ExperimentalWarning`s) reach the user unchanged. The guard is
 * idempotent and returns a disposer for tests.
 */
export function suppressSqliteExperimentalWarning(proc: NodeJS.Process = process): () => void {
  const isSqliteExperimental = (warning: Error): boolean =>
    warning.name === "ExperimentalWarning" && /\bSQLite\b/i.test(warning.message);

  // Capture the default printer once, then take over emission ourselves.
  const previous = proc.listeners("warning") as ((warning: Error) => void)[];
  for (const listener of previous) proc.removeListener("warning", listener);

  const filter = (warning: Error): void => {
    if (isSqliteExperimental(warning)) return;
    for (const listener of previous) listener.call(proc, warning);
  };
  proc.on("warning", filter);

  return () => {
    proc.removeListener("warning", filter);
    for (const listener of previous) proc.on("warning", listener);
  };
}

/** True when this module is the process entry point (not imported by a test). */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  suppressSqliteExperimentalWarning();
  process.exitCode = await runCli(process.argv);
}
