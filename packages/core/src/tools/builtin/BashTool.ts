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
import { promises as fs } from "node:fs";
import { z } from "zod";
import { MAX_TOOL_OUTPUT_CHARS, ToolError, ToolTimeoutError } from "@ultracode/shared";
import type { ToolContext, ToolDefinition } from "@ultracode/shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";

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

  constructor(options: BashToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
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
    const child = isWin
      ? spawn("cmd.exe", ["/d", "/s", "/c", args.command], {
          cwd,
          windowsVerbatimArguments: true,
          windowsHide: true,
        })
      : spawn("/bin/sh", ["-c", args.command], { cwd, detached: true });

    let stdout = "";
    let stderr = "";
    let outputCapped = false;
    const append = (target: "out" | "err", chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const current = target === "out" ? stdout : stderr;
      if (current.length >= MAX_TOOL_OUTPUT_CHARS) {
        outputCapped = true;
        return;
      }
      const next = current + text;
      const capped =
        next.length > MAX_TOOL_OUTPUT_CHARS ? next.slice(0, MAX_TOOL_OUTPUT_CHARS) : next;
      if (capped.length < next.length) outputCapped = true;
      if (target === "out") stdout = capped;
      else stderr = capped;
    };
    child.stdout?.on("data", (c: Buffer) => append("out", c));
    child.stderr?.on("data", (c: Buffer) => append("err", c));

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
          process.kill(-pid, "SIGKILL"); // whole process group
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
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
