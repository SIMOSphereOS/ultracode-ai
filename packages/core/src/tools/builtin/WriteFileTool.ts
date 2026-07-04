/**
 * `write_file` — create or overwrite a file (atomically, `mkdir -p`).
 *
 * Category: file • Default permission: ask (architecture tool table).
 * Respects `protected_extensions` from the configuration: matching targets
 * are refused with a permission-denied error.
 */

import path from "node:path";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { ToolPermissionDeniedError } from "ultracode-shared";
import { z } from "zod";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { splitLines, writeFileAtomic } from "./fsUtils.js";

const schema = z.object({
  /** Target path (relative to cwd or absolute inside sandbox). */
  path: z.string().min(1),
  /** Full file content to write. */
  content: z.string(),
});

/**
 * Line count above which a write attaches a **non-blocking** split advisory to
 * its result. Kept in sync with the repository file-size gate
 * `scripts/check-file-size.sh` (WARN at 800 lines, hard fail at 1000): a write
 * that would land in that gate's WARN band gets an early, in-band heads-up so
 * the model can refactor before CI complains. Overridable per instance via
 * {@link WriteFileToolOptions.advisoryLineThreshold}.
 */
export const WRITE_ADVISORY_LINE_THRESHOLD = 800;

/**
 * Build the bilingual (DE/EN) split advisory for a file that exceeds the line
 * threshold. Purely a hint — the write always succeeds regardless.
 */
function buildLineAdvisory(lineCount: number, threshold: number): string {
  return (
    `⚠ Datei hat ${lineCount} Zeilen (> ${threshold}) — erwäge Aufteilung ` +
    `(Extract Class/Module). / ` +
    `File has ${lineCount} lines (> ${threshold}) — consider splitting ` +
    `(Extract Class/Module).`
  );
}

/** Successful output of the `write_file` tool. */
export interface WriteFileToolOutput {
  /** Fully resolved absolute path that was written. */
  path: string;
  /** UTF-8 byte length of the written content. */
  bytesWritten: number;
  /**
   * Non-blocking, bilingual heads-up attached when the written content exceeds
   * {@link WRITE_ADVISORY_LINE_THRESHOLD} lines (see the repo file-size gate
   * `scripts/check-file-size.sh`). Absent otherwise. The write itself always
   * succeeds — this is advisory only, never an error or an abort.
   */
  advisory?: string;
}

/** Construction options for {@link WriteFileTool}. */
export interface WriteFileToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
  /**
   * Extensions (e.g. `[".env", ".toml"]`) or exact dotfile names (`".env"`)
   * that must never be (over)written. Case-insensitive.
   */
  protectedExtensions?: readonly string[];
  /**
   * Line count above which a split advisory is attached to the result.
   * Default {@link WRITE_ADVISORY_LINE_THRESHOLD}. The write is never blocked by
   * this — it only adds a hint. Non-positive values fall back to the default.
   */
  advisoryLineThreshold?: number;
}

/** Writes files atomically (tmp + rename) with protected-extension checks. */
export class WriteFileTool extends BaseTool<typeof schema, WriteFileToolOutput> {
  readonly definition: ToolDefinition = {
    name: "write_file",
    description: "Create or overwrite a file with the given content",
    category: "file",
    parameters: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string", description: "Target file path" },
        content: { type: "string", description: "Full file content" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  private readonly protectedExtensions: string[];
  private readonly advisoryLineThreshold: number;

  constructor(options: WriteFileToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.protectedExtensions = (options.protectedExtensions ?? []).map((e) => e.toLowerCase());
    this.advisoryLineThreshold =
      typeof options.advisoryLineThreshold === "number" && options.advisoryLineThreshold > 0
        ? options.advisoryLineThreshold
        : WRITE_ADVISORY_LINE_THRESHOLD;
  }

  /**
   * Whether `target` matches a protected extension, exact dotfile/basename, or
   * — for entries containing a separator (e.g. `.git/config`) — a path suffix.
   */
  private isProtected(target: string): boolean {
    if (this.protectedExtensions.length === 0) return false;
    const normalized = target.replace(/\\/g, "/").toLowerCase();
    const base = path.basename(normalized);
    const ext = path.extname(base); // "" for dotfiles like ".env"
    return this.protectedExtensions.some((p) => {
      if (p.includes("/")) return normalized === p || normalized.endsWith(`/${p}`);
      return p === ext || p === base;
    });
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<WriteFileToolOutput>> {
    this.throwIfAborted(ctx);
    if (this.isProtected(args.path)) {
      throw new ToolPermissionDeniedError(
        `Writing to "${args.path}" is blocked by protected_extensions`,
        {
          toolName: this.definition.name,
          details: { path: args.path, protectedExtensions: this.protectedExtensions },
        },
      );
    }

    const resolved = await this.guard.resolve(ctx.cwd, args.path, this.definition.name);
    await writeFileAtomic(resolved, args.content);

    // The write has already succeeded above; the advisory below is a pure,
    // non-blocking heads-up and never affects the write outcome.
    const output: WriteFileToolOutput = {
      path: resolved,
      bytesWritten: Buffer.byteLength(args.content, "utf8"),
    };
    const lineCount = splitLines(args.content).length;
    if (lineCount > this.advisoryLineThreshold) {
      output.advisory = buildLineAdvisory(lineCount, this.advisoryLineThreshold);
    }

    return { output };
  }
}
