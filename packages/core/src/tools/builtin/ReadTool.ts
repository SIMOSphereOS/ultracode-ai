/**
 * `read` — read a text file (optionally a line window via offset/limit).
 *
 * Category: file • Default permission: ask (architecture tool table).
 * Rejects binary files (NUL-byte heuristic) and files above the size limit.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { ToolError, ToolPermissionDeniedError } from "ultracode-shared";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { isBinaryFile, splitLines } from "./fsUtils.js";

/** Default maximum readable file size in bytes (10 MiB). */
export const DEFAULT_MAX_READ_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  /** Path of the file to read (relative to cwd or absolute inside sandbox). */
  file_path: z.string().min(1),
  /** 1-based first line to return. */
  offset: z.number().int().min(1).optional(),
  /** Maximum number of lines to return. */
  limit: z.number().int().min(1).optional(),
});

/** Successful output of the `read` tool. */
export interface ReadToolOutput {
  /** Fully resolved absolute path that was read. */
  filePath: string;
  /** Selected file content (lines joined with `\n`). */
  content: string;
  /** Total number of lines in the file. */
  totalLines: number;
  /** 1-based offset that was applied. */
  offset: number;
  /** Number of lines returned. */
  lineCount: number;
}

/** Construction options for {@link ReadTool}. */
export interface ReadToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
  /** Maximum file size in bytes. Default {@link DEFAULT_MAX_READ_BYTES}. */
  maxFileBytes?: number;
  /**
   * File extensions (e.g. `[".env", ".pem"]`), exact dotfile/basenames
   * (`"id_rsa"`, `".npmrc"`) or path-suffix segments (`".git/config"`) whose
   * contents must never be returned to the model (read exfiltration guard).
   * Case-insensitive. Matching files are refused with a permission-denied error.
   */
  readDeny?: readonly string[];
}

/** Reads text files with offset/limit, binary detection and a size limit. */
export class ReadTool extends BaseTool<typeof schema, ReadToolOutput> {
  readonly definition: ToolDefinition = {
    name: "read",
    description: "Read a text file, optionally a line window via offset/limit",
    category: "file",
    parameters: {
      type: "object",
      required: ["file_path"],
      properties: {
        file_path: { type: "string", description: "Path of the file to read" },
        offset: { type: "integer", description: "1-based first line to return" },
        limit: { type: "integer", description: "Maximum number of lines to return" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  private readonly maxFileBytes: number;
  private readonly readDeny: string[];

  constructor(options: ReadToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.maxFileBytes =
      typeof options.maxFileBytes === "number" && options.maxFileBytes > 0
        ? options.maxFileBytes
        : DEFAULT_MAX_READ_BYTES;
    this.readDeny = (options.readDeny ?? []).map((e) => e.toLowerCase());
  }

  /**
   * Whether reading `target` is denied by the read-deny list. Mirrors
   * {@link WriteFileTool}'s protected-extension matching: an entry matches the
   * file extension, the exact basename (dotfiles included), or — for entries
   * containing a separator (e.g. `.git/config`) — a path suffix.
   */
  private isDenied(target: string): boolean {
    if (this.readDeny.length === 0) return false;
    const normalized = target.replace(/\\/g, "/").toLowerCase();
    const base = path.basename(normalized);
    const ext = path.extname(base); // "" for dotfiles like ".env"
    return this.readDeny.some((entry) => {
      if (entry.includes("/")) return normalized === entry || normalized.endsWith(`/${entry}`);
      return entry === ext || entry === base;
    });
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<ReadToolOutput>> {
    this.throwIfAborted(ctx);
    if (this.isDenied(args.file_path)) {
      throw new ToolPermissionDeniedError(
        `Reading "${args.file_path}" is blocked by read_deny`,
        {
          toolName: this.definition.name,
          details: { path: args.file_path, readDeny: this.readDeny },
        },
      );
    }

    const resolved = await this.guard.resolve(ctx.cwd, args.file_path, this.definition.name);

    // Re-check on the fully resolved path: catches symlinks/relative forms whose
    // basename only reveals the denied name after resolution.
    if (this.isDenied(resolved)) {
      throw new ToolPermissionDeniedError(
        `Reading "${args.file_path}" is blocked by read_deny`,
        {
          toolName: this.definition.name,
          details: { path: resolved, readDeny: this.readDeny },
        },
      );
    }

    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      throw new ToolError(`File not found: "${args.file_path}"`, {
        toolName: this.definition.name,
        details: { path: resolved },
      });
    }
    if (stat.isDirectory()) {
      throw new ToolError(`"${args.file_path}" is a directory, not a file`, {
        toolName: this.definition.name,
      });
    }
    if (stat.size > this.maxFileBytes) {
      throw new ToolError(
        `File "${args.file_path}" is too large (${stat.size} bytes > limit ${this.maxFileBytes})`,
        { toolName: this.definition.name, details: { size: stat.size, limit: this.maxFileBytes } },
      );
    }
    if (await isBinaryFile(resolved)) {
      throw new ToolError(`File "${args.file_path}" appears to be binary`, {
        toolName: this.definition.name,
      });
    }

    const content = await fs.readFile(resolved, "utf8");
    const lines = splitLines(content);
    const offset = args.offset ?? 1;
    const start = offset - 1;
    const end = args.limit !== undefined ? start + args.limit : undefined;
    const selected = start >= lines.length ? [] : lines.slice(start, end);

    return {
      output: {
        filePath: resolved,
        content: selected.join("\n"),
        totalLines: lines.length,
        offset,
        lineCount: selected.length,
      },
    };
  }
}
