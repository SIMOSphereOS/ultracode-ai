/**
 * CLI execution context.
 *
 * Everything the commands need from the outside world (streams, environment,
 * facade construction, git probing) is bundled in a {@link CliContext} and
 * passed down explicitly. Production code uses {@link createDefaultContext};
 * tests inject fakes, which keeps every command fully unit-testable, offline
 * and cross-platform.
 */

import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import type { UltraCode, UltraCodeCreateOptions } from "ultracode-core";
import { loadCore } from "./core-loader.js";

/** Instance type of the UltraCode facade. */
export type UltraCodeFacade = UltraCode;

/** Minimal writable stream surface used by the CLI. */
export interface CliWriter {
  write(s: string): unknown;
  isTTY?: boolean;
}

/** Minimal readable stream surface used by the CLI (stdin). */
export interface CliReader {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  removeListener(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  resume?(): unknown;
  pause?(): unknown;
}

/** Dependency bundle handed to every CLI command. */
export interface CliContext {
  /** Working directory commands resolve project paths against. */
  cwd: string;
  /** Environment snapshot (API-key presence checks etc.). */
  env: NodeJS.ProcessEnv;
  /** Home directory used to expand `~`-prefixed shared constants. */
  homedir: string;
  /** Node.js runtime version (`process.versions.node`). */
  nodeVersion: string;
  /** Standard output. */
  stdout: CliWriter;
  /** Standard error. */
  stderr: CliWriter;
  /** Standard input. */
  stdin: CliReader;
  /** Construct the UltraCode facade (lazily imports `ultracode-core`). */
  createFacade(options?: UltraCodeCreateOptions): Promise<UltraCodeFacade>;
  /** Probe `git --version`; resolves `null` when git is unavailable. */
  gitVersion(): Promise<string | null>;
}

/**
 * Probe for a working `git` binary by spawning `git --version`.
 * Never rejects: missing binaries and spawn failures resolve to `null`.
 */
export function defaultGitVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    child.once("error", () => {
      resolve(null);
    });
    child.stdout?.on("data", (d: Buffer) => {
      out += String(d);
    });
    child.once("close", (code) => {
      resolve(code === 0 && out.trim() !== "" ? out.trim() : null);
    });
  });
}

/**
 * Build the production {@link CliContext} from the real process streams and
 * the dynamically imported `ultracode-core` facade.
 */
export function createDefaultContext(): CliContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    homedir: os.homedir(),
    nodeVersion: process.versions.node,
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    createFacade: async (options?: UltraCodeCreateOptions) => {
      const core = await loadCore();
      return core.UltraCode.create({ cwd: process.cwd(), ...options });
    },
    gitVersion: defaultGitVersion,
  };
}

/** Dispose a facade, swallowing secondary errors (never masks the original). */
export async function safeDispose(facade: UltraCodeFacade): Promise<void> {
  try {
    await facade.dispose();
  } catch {
    // Disposal failures must never shadow the primary command outcome.
  }
}
