/**
 * `write_file` — create or overwrite a file (atomically, `mkdir -p`).
 *
 * Category: file • Default permission: ask (architecture tool table).
 * Respects `protected_extensions` from the configuration: matching targets
 * are refused with a permission-denied error.
 */

import path from "node:path";
import { z } from "zod";
import { ToolPermissionDeniedError } from "@ultracode/shared";
import type { ToolContext, ToolDefinition } from "@ultracode/shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { writeFileAtomic } from "./fsUtils.js";

const schema = z.object({
  /** Target path (relative to cwd or absolute inside sandbox). */
  path: z.string().min(1),
  /** Full file content to write. */
  content: z.string(),
});

/** Successful output of the `write_file` tool. */
export interface WriteFileToolOutput {
  /** Fully resolved absolute path that was written. */
  path: string;
  /** UTF-8 byte length of the written content. */
  bytesWritten: number;
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

  constructor(options: WriteFileToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.protectedExtensions = (options.protectedExtensions ?? []).map((e) =>
      e.toLowerCase(),
    );
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

    return {
      output: {
        path: resolved,
        bytesWritten: Buffer.byteLength(args.content, "utf8"),
      },
    };
  }
}
