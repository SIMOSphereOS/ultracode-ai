/**
 * `delete_file` — delete a single file (never directories).
 *
 * Category: file • Default permission: ask (architecture tool table).
 */

import { promises as fs } from "node:fs";
import { z } from "zod";
import { ToolError } from "@ultracode/shared";
import type { ToolContext, ToolDefinition } from "@ultracode/shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";

const schema = z.object({
  /** Path of the file to delete. */
  path: z.string().min(1),
});

/** Successful output of the `delete_file` tool. */
export interface DeleteFileToolOutput {
  /** Fully resolved absolute path that was deleted. */
  path: string;
  /** Always `true` on success. */
  deleted: boolean;
}

/** Construction options for {@link DeleteFileTool}. */
export interface DeleteFileToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
}

/** Deletes a single file inside the sandbox. */
export class DeleteFileTool extends BaseTool<typeof schema, DeleteFileToolOutput> {
  readonly definition: ToolDefinition = {
    name: "delete_file",
    description: "Delete a single file",
    category: "file",
    parameters: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Path of the file to delete" },
      },
    },
    permission: "ask",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;

  constructor(options: DeleteFileToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<DeleteFileToolOutput>> {
    this.throwIfAborted(ctx);
    const name = this.definition.name;
    const resolved = await this.guard.resolve(ctx.cwd, args.path, name);

    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      throw new ToolError(`File not found: "${args.path}"`, { toolName: name });
    }
    if (stat.isDirectory()) {
      throw new ToolError(`"${args.path}" is a directory — delete_file only deletes files`, {
        toolName: name,
      });
    }

    await fs.unlink(resolved);
    return { output: { path: resolved, deleted: true } };
  }
}
