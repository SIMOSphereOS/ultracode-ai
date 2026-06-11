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
import { runCli } from "./program.js";

process.exitCode = await runCli(process.argv);
