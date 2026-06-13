/**
 * `bash` — run a shell command.
 *
 * Category: system • Default permission: ask (architecture tool table).
 *
 * Cross-platform shell selection:
 * - win32: `cmd.exe /d /s /c <command>`
 * - other: `/bin/sh -c <command>`
 *
 * Timeout / abort kills the **whole process tree**:
 * - win32: `taskkill /pid <pid> /T /F`
 * - other: negative PID (`detached: true` creates a process group)
 *
 * The exit code is part of the *output* — a non-zero exit is still `ok: true`.
 */

import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { promises as fs } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import { MAX_TOOL_OUTPUT_CHARS, ToolError, ToolTimeoutError, truncate } from "@ultracode/shared";
import type { ToolContext, ToolDefinition } from "@ultracode/shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { sanitizeEnv } from "../sanitizeEnv.js";

const schema = z.object({
  /** Shell command line to execute. */
  command: z.string().min(1),
  /** Working directory (inside the sandbox). Defaults to cwd. */
  cwd: z.string().optional(),
  /** Command timeout in seconds (kills the process tree). */
  timeout: z.number().positive().max(3600).optional(),
});

/** Successful output of the `bash` tool. */
export interface BashToolOutput {
  /** Captured standard output (capped). */
  stdout: string;
  /** Captured standard error (capped). */
  stderr: string;
  /** Process exit code (`null` when killed by a signal). */
  exitCode: number | null;
  /** Terminating signal name, when killed by a signal. */
  signal: string | null;
  /** The executed command line. */
  command: string;
}

/** Construction options for {@link BashTool}. */
export interface BashToolOptions {
  /** Extra allow-listed directories the `cwd` argument may point into. */
  allowedDirs?: readonly string[];
  /**
   * Additional exact environment-variable names (case-insensitive) to strip
   * from the child environment, on top of the built-in credential patterns.
   * Production wiring feeds the configured provider API-key variable names
   * (`config.providers.apiKeys` and their `ULTRACODE_`-prefixed aliases).
   */
  secretEnvKeys?: readonly string[];
  /**
   * Process-group kill primitive (test seam). Defaults to {@link process.kill}.
   * Injected only by tests to exercise the `child.kill('SIGKILL')` fallback
   * when the POSIX `process.kill(-pid, …)` group-kill throws. Production never
   * sets this, so the real behaviour is unchanged.
   */
  processKill?: (pid: number, signal: NodeJS.Signals) => void;
  /**
   * Child-process spawn primitive (test seam). Defaults to the Node
   * `child_process.spawn`. Injected only by tests to simulate a spawn `error`
   * event (e.g. the shell binary missing). Production never sets this.
   */
  spawnFn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
}

/** Cross-platform shell command execution with process-tree kill. */
export class BashTool extends BaseTool<typeof schema, BashToolOutput> {
  readonly definition: ToolDefinition = {
    name: "bash",
    description: "Run a shell command (cmd.exe on Windows, /bin/sh elsewhere)",
    category: "system",
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string", description: "Shell command line" },
        cwd: { type: "string", description: "Working directory (default: cwd)" },
        timeout: { type: "number", description: "Timeout in seconds" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  /** Extra exact secret variable names (upper-cased) to strip from child env. */
  private readonly secretEnvKeys: ReadonlySet<string>;
  /** Process-group kill primitive (test seam); defaults to `process.kill`. */
  private readonly processKill: (pid: number, signal: NodeJS.Signals) => void;
  /** Child spawn primitive (test seam); defaults to `child_process.spawn`. */
  private readonly spawnFn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;

  constructor(options: BashToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.secretEnvKeys = new Set((options.secretEnvKeys ?? []).map((k) => k.toUpperCase()));
    this.processKill =
      options.processKill ?? ((pid, signal) => void process.kill(pid, signal));
    this.spawnFn =
      options.spawnFn ?? ((command, args, opts) => spawn(command, args as string[], opts));
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<BashToolOutput>> {
    this.throwIfAborted(ctx);
    const name = this.definition.name;
    const cwd = await this.guard.resolve(ctx.cwd, args.cwd ?? ".", name);
    const cwdStat = await fs.stat(cwd).catch(() => {
      throw new ToolError(`Working directory does not exist: "${args.cwd ?? "."}"`, {
        toolName: name,
      });
    });
    if (!cwdStat.isDirectory()) {
      throw new ToolError(`Working directory is not a directory: "${args.cwd ?? "."}"`, {
        toolName: name,
      });
    }

    const isWin = process.platform === "win32";
    // The child process feeds its stdout/stderr straight back to the model, so
    // it is a credential-exfiltration channel. Strip known secrets (API keys,
    // tokens, passwords, …) from the inherited environment before spawning —
    // this is the unavoidable choke point that holds even when an embedder
    // hands a non-sanitised `ctx.env` (or the engine defaults to `process.env`).
    const childEnv = sanitizeEnv(ctx.env, this.secretEnvKeys);
    const child = isWin
      ? // `cmd.exe /s /c` strips exactly one outer pair of quotes and runs the
        // rest verbatim. Wrapping the whole command line in that outer pair is
        // the only way embedded quotes (e.g. `"C:\…\node.exe" -e "…"`) survive;
        // without it cmd mangles the first/last quote. Pairs with
        // windowsVerbatimArguments so Node does not re-quote the argv.
        this.spawnFn("cmd.exe", ["/d", "/s", "/c", `"${args.command}"`], {
          cwd,
          env: childEnv,
          windowsVerbatimArguments: true,
          windowsHide: true,
        })
      : this.spawnFn("/bin/sh", ["-c", args.command], {
          cwd,
          env: childEnv,
          detached: true,
          windowsHide: true,
        });

    let stdout = "";
    let stderr = "";
    let outputCapped = false;
    // One UTF-8 decoder per stream: multibyte characters whose bytes straddle a
    // chunk boundary are buffered across `write()` calls instead of being
    // mangled into U+FFFD. Flushed once via `decoder.end()` after `close`.
    const outDecoder = new StringDecoder("utf8");
    const errDecoder = new StringDecoder("utf8");
    const append = (target: "out" | "err", text: string): void => {
      if (text.length === 0) return;
      const current = target === "out" ? stdout : stderr;
      if (current.length >= MAX_TOOL_OUTPUT_CHARS) {
        outputCapped = true;
        return;
      }
      const next = current + text;
      // Unicode-safe cap: `truncate` never splits a surrogate pair, unlike
      // `String.prototype.slice`.
      const capped =
        next.length > MAX_TOOL_OUTPUT_CHARS
          ? truncate(next, MAX_TOOL_OUTPUT_CHARS, { suffix: "" })
          : next;
      if (capped.length < next.length) outputCapped = true;
      if (target === "out") stdout = capped;
      else stderr = capped;
    };
    child.stdout?.on("data", (c: Buffer) => append("out", outDecoder.write(c)));
    child.stderr?.on("data", (c: Buffer) => append("err", errDecoder.write(c)));

    const killTree = (): void => {
      const pid = child.pid;
      if (pid === undefined) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
        return;
      }
      if (isWin) {
        try {
          spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
        } catch {
          /* best effort */
        }
      } else {
        try {
          this.processKill(-pid, "SIGKILL"); // whole process group
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
          // The group kill failed, so only the direct child was signalled.
          // Any detached grandchildren survive and keep the inherited
          // stdout/stderr pipes open — which would stall the awaited `close`
          // until they exit on their own. Detach the captured streams so the
          // timed-out/aborted command terminates promptly rather than hanging
          // on pipes held by an orphaned descendant.
          child.stdout?.destroy();
          child.stderr?.destroy();
        }
      }
    };

    let timedOut = false;
    let aborted = false;
    const timer =
      args.timeout !== undefined
        ? setTimeout(() => {
            timedOut = true;
            killTree();
          }, args.timeout * 1000)
        : undefined;

    const onAbort = (): void => {
      aborted = true;
      killTree();
    };
    ctx.signal?.addEventListener("abort", onAbort, { once: true });
    if (ctx.signal?.aborted) onAbort(); // raced between start and listener setup

    try {
      const outcome = await new Promise<{ code: number | null; signal: string | null }>(
        (resolve, reject) => {
          child.once("error", (err) =>
            reject(
              new ToolError(`Failed to start shell: ${err.message}`, {
                toolName: name,
                cause: err,
              }),
            ),
          );
          child.once("close", (code, sig) => resolve({ code, signal: sig }));
        },
      );

      // Flush any bytes the decoders were holding for an incomplete trailing
      // multibyte sequence.
      append("out", outDecoder.end());
      append("err", errDecoder.end());

      if (timedOut) {
        throw new ToolTimeoutError(
          `Command timed out after ${args.timeout}s and was killed`,
          { toolName: name, details: { command: args.command, stdout, stderr } },
        );
      }
      if (aborted) {
        throw new ToolError("Command aborted", {
          toolName: name,
          cause: ctx.signal?.reason,
          details: { command: args.command },
        });
      }

      return {
        output: {
          stdout,
          stderr,
          exitCode: outcome.code,
          signal: outcome.signal,
          command: args.command,
        },
        truncated: outputCapped,
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onAbort);
    }
  }
}
