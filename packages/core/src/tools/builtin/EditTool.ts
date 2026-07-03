/**
 * `edit` — exact-string replacement in a file.
 *
 * Category: file • Default permission: ask (architecture tool table).
 * `old_string` must exist and (without `replace_all`) be unique.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { ToolError, ToolPermissionDeniedError } from "ultracode-shared";
import { z } from "zod";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { isBinaryFile, writeFileAtomic } from "./fsUtils.js";

const schema = z.object({
  /** Path of the file to edit. */
  file_path: z.string().min(1),
  /** Exact text to replace (must exist; must be unique unless replace_all). */
  old_string: z.string().min(1),
  /** Replacement text. */
  new_string: z.string(),
  /** Replace every occurrence instead of requiring uniqueness. */
  replace_all: z.boolean().optional().default(false),
});

/** Successful output of the `edit` tool. */
export interface EditToolOutput {
  /** Fully resolved absolute path that was edited. */
  filePath: string;
  /** Number of replacements performed. */
  replacements: number;
}

/** Construction options for {@link EditTool}. */
export interface EditToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
  /**
   * Extensions (e.g. `[".env", ".toml"]`), exact dotfile/basenames (`".env"`,
   * `"id_rsa"`) or path-suffix entries (`".git/config"`) that must never be
   * edited. Case-insensitive. Mirrors {@link WriteFileTool}'s guard so the edit
   * tool cannot clobber sensitive local files the write tool already protects.
   */
  protectedExtensions?: readonly string[];
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Exact string replacement with existence and uniqueness guarantees. */
export class EditTool extends BaseTool<typeof schema, EditToolOutput> {
  readonly definition: ToolDefinition = {
    name: "edit",
    description: "Replace an exact string in a file (must be unique unless replace_all)",
    category: "file",
    parameters: {
      type: "object",
      required: ["file_path", "old_string", "new_string"],
      properties: {
        file_path: { type: "string", description: "Path of the file to edit" },
        old_string: { type: "string", description: "Exact text to replace" },
        new_string: { type: "string", description: "Replacement text" },
        replace_all: { type: "boolean", description: "Replace all occurrences" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  private readonly protectedExtensions: string[];

  constructor(options: EditToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.protectedExtensions = (options.protectedExtensions ?? []).map((e) => e.toLowerCase());
  }

  /**
   * Whether `target` matches a protected extension, exact dotfile/basename, or
   * — for entries containing a separator (e.g. `.git/config`) — a path suffix.
   * Mirrors {@link WriteFileTool.isProtected}.
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
  ): Promise<ToolRunOutcome<EditToolOutput>> {
    this.throwIfAborted(ctx);
    const name = this.definition.name;
    if (args.old_string === args.new_string) {
      throw new ToolError("old_string and new_string are identical — nothing to do", {
        toolName: name,
      });
    }

    const resolved = await this.guard.resolve(ctx.cwd, args.file_path, name);
    // Protected-file guard (mirrors WriteFileTool): refuse to clobber sensitive
    // local files. Re-check the resolved path so path-suffix entries such as
    // `.git/config` match regardless of how the caller spelled the input.
    if (this.isProtected(args.file_path) || this.isProtected(resolved)) {
      throw new ToolPermissionDeniedError(
        `Editing "${args.file_path}" is blocked by protected_extensions`,
        {
          toolName: name,
          details: { path: args.file_path, protectedExtensions: this.protectedExtensions },
        },
      );
    }

    let content: string;
    try {
      content = await fs.readFile(resolved, "utf8");
    } catch {
      throw new ToolError(`File not found: "${args.file_path}"`, { toolName: name });
    }
    if (await isBinaryFile(resolved)) {
      throw new ToolError(`File "${args.file_path}" appears to be binary`, { toolName: name });
    }

    const occurrences = countOccurrences(content, args.old_string);
    if (occurrences === 0) {
      throw new ToolError(`old_string not found in "${args.file_path}"`, { toolName: name });
    }
    if (occurrences > 1 && !args.replace_all) {
      throw new ToolError(
        `old_string occurs ${occurrences} times in "${args.file_path}" — ` +
          "it must be unique, or pass replace_all: true",
        { toolName: name, details: { occurrences } },
      );
    }

    let updated: string;
    let replacements: number;
    if (args.replace_all) {
      updated = content.split(args.old_string).join(args.new_string);
      replacements = occurrences;
    } else {
      const index = content.indexOf(args.old_string);
      updated =
        content.slice(0, index) + args.new_string + content.slice(index + args.old_string.length);
      replacements = 1;
    }

    // Atomic write via temporary sibling + rename.
    await writeFileAtomic(resolved, updated);

    return { output: { filePath: resolved, replacements } };
  }
}
