/**
 * `glob` — find files by glob pattern.
 *
 * Category: search • Default permission: always (architecture tool table).
 * Uses the pure-JS matcher from `globMatch.ts` (supports `**`, `*`, `?`,
 * `{a,b}`) — no external binaries, Windows compatible.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { ToolError } from "ultracode-shared";
import { z } from "zod";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { compileGlob } from "./globMatch.js";
import { walkFiles } from "./walk.js";

/** Default cap on returned files. */
export const DEFAULT_MAX_GLOB_RESULTS = 10_000;

const schema = z.object({
  /** Glob pattern (`/`-separated): `**`, `*`, `?`, `{a,b}`. */
  pattern: z.string().min(1),
  /** Directory to search. Defaults to cwd. */
  path: z.string().optional(),
});

/** Successful output of the `glob` tool. */
export interface GlobToolOutput {
  /** Matching file paths relative to the search root (`/`-separated, sorted). */
  files: string[];
  /** Number of files returned. */
  count: number;
  /** `true` when the result cap stopped the search early. */
  limitReached: boolean;
}

/** Construction options for {@link GlobTool}. */
export interface GlobToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
  /** Cap on returned files. Default {@link DEFAULT_MAX_GLOB_RESULTS}. */
  maxResults?: number;
}

/** Pure-JS glob file finder. */
export class GlobTool extends BaseTool<typeof schema, GlobToolOutput> {
  readonly definition: ToolDefinition = {
    name: "glob",
    description: "Find files matching a glob pattern (**, *, ?, {a,b})",
    category: "search",
    parameters: {
      type: "object",
      required: ["pattern"],
      properties: {
        pattern: { type: "string", description: "Glob pattern, e.g. src/**/*.ts" },
        path: { type: "string", description: "Directory to search (default: cwd)" },
      },
    },
    permission: "always",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  private readonly maxResults: number;

  constructor(options: GlobToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.maxResults =
      typeof options.maxResults === "number" && options.maxResults >= 1
        ? Math.floor(options.maxResults)
        : DEFAULT_MAX_GLOB_RESULTS;
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<GlobToolOutput>> {
    this.throwIfAborted(ctx);
    const name = this.definition.name;
    const root = await this.guard.resolve(ctx.cwd, args.path ?? ".", name);

    const stat = await fs.stat(root).catch(() => {
      throw new ToolError(`Search path not found: "${args.path ?? "."}"`, { toolName: name });
    });
    if (!stat.isDirectory()) {
      throw new ToolError(`Search path is not a directory: "${args.path ?? "."}"`, {
        toolName: name,
      });
    }

    const matcher = compileGlob(args.pattern);
    const files: string[] = [];
    let limitReached = false;

    for await (const file of walkFiles(root, { signal: ctx.signal })) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (matcher(rel)) {
        files.push(rel);
        if (files.length >= this.maxResults) {
          limitReached = true;
          break;
        }
      }
    }
    files.sort();

    return {
      output: { files, count: files.length, limitReached },
      truncated: limitReached,
    };
  }
}
