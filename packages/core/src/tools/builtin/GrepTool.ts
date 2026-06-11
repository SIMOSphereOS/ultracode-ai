/**
 * `grep` — regex search across a directory tree.
 *
 * Category: search • Default permission: always (architecture tool table).
 * Pure-JS implementation (recursive walk; no ripgrep/grep binaries — Windows
 * compatible). Skips `node_modules`, `.git`, `dist`, `coverage` and binary
 * files; reports 1-based line numbers; caps results at `max_matches`.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { ToolError, truncate } from "@ultracode/shared";
import type { ToolContext, ToolDefinition } from "@ultracode/shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";
import { splitLines } from "./fsUtils.js";
import { walkFiles } from "./walk.js";

/** Default cap on returned matches when not configured. */
export const DEFAULT_MAX_MATCHES = 1000;
/** Files larger than this are skipped during search (bytes). */
const MAX_SEARCH_FILE_BYTES = 5 * 1024 * 1024;
/** Match line text is capped at this many code points. */
const MAX_LINE_CHARS = 500;

const schema = z.object({
  /** JavaScript regular expression source. */
  pattern: z.string().min(1),
  /** Directory (or single file) to search. Defaults to cwd. */
  path: z.string().optional(),
  /** Regex flags; only `i`, `m`, `s`, `u` are allowed. */
  flags: z
    .string()
    .regex(/^[imsu]*$/, "only the flags i, m, s and u are allowed")
    .optional(),
  /** Per-call cap on matches (cannot exceed the configured maximum). */
  max_matches: z.number().int().min(1).optional(),
});

/** A single grep match. */
export interface GrepMatch {
  /** File path relative to the search root (always `/`-separated). */
  file: string;
  /** 1-based line number. */
  line: number;
  /** Matching line text (truncated to {@link MAX_LINE_CHARS}). */
  text: string;
}

/** Successful output of the `grep` tool. */
export interface GrepToolOutput {
  /** All matches found (capped). */
  matches: GrepMatch[];
  /** Number of matches returned. */
  count: number;
  /** `true` when the match cap stopped the search early. */
  limitReached: boolean;
}

/** Construction options for {@link GrepTool}. */
export interface GrepToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
  /** Hard cap on matches (config `tools.grep.maxMatches`). Default 1000. */
  maxMatches?: number;
}

/** Pure-JS recursive regex search. */
export class GrepTool extends BaseTool<typeof schema, GrepToolOutput> {
  readonly definition: ToolDefinition = {
    name: "grep",
    description: "Search files for a regular expression (pure JS, recursive)",
    category: "search",
    parameters: {
      type: "object",
      required: ["pattern"],
      properties: {
        pattern: { type: "string", description: "Regular expression to search for" },
        path: { type: "string", description: "Directory or file to search (default: cwd)" },
        flags: { type: "string", description: "Regex flags (i, m, s, u)" },
        max_matches: { type: "integer", description: "Cap on returned matches" },
      },
    },
    permission: "always",
  };
  protected readonly schema = schema;

  private readonly guard: PathGuard;
  private readonly maxMatches: number;

  constructor(options: GrepToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
    this.maxMatches =
      typeof options.maxMatches === "number" && options.maxMatches >= 1
        ? Math.floor(options.maxMatches)
        : DEFAULT_MAX_MATCHES;
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<GrepToolOutput>> {
    this.throwIfAborted(ctx);
    const name = this.definition.name;
    const root = await this.guard.resolve(ctx.cwd, args.path ?? ".", name);

    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, args.flags ?? "");
    } catch (err) {
      throw new ToolError(`Invalid regular expression: ${(err as Error).message}`, {
        toolName: name,
        cause: err,
      });
    }

    const limit = Math.min(args.max_matches ?? this.maxMatches, this.maxMatches);
    const matches: GrepMatch[] = [];
    let limitReached = false;

    const rootStat = await fs.stat(root).catch(() => {
      throw new ToolError(`Search path not found: "${args.path ?? "."}"`, { toolName: name });
    });

    const files: AsyncIterable<string> | string[] = rootStat.isFile()
      ? [root]
      : walkFiles(root, { signal: ctx.signal });
    const base = rootStat.isFile() ? path.dirname(root) : root;

    for await (const file of files) {
      const searched = await this.searchFile(file, base, regex, matches, limit);
      if (searched === "limit") {
        limitReached = true;
        break;
      }
    }

    return {
      output: { matches, count: matches.length, limitReached },
      truncated: limitReached,
    };
  }

  /** Search one file; pushes matches; returns "limit" when the cap is hit. */
  private async searchFile(
    file: string,
    base: string,
    regex: RegExp,
    matches: GrepMatch[],
    limit: number,
  ): Promise<"ok" | "limit"> {
    let buf: Buffer;
    try {
      const stat = await fs.stat(file);
      if (stat.size > MAX_SEARCH_FILE_BYTES) return "ok";
      buf = await fs.readFile(file);
    } catch {
      return "ok"; // unreadable / vanished
    }
    // Binary heuristic: NUL byte in the first 8 KiB.
    if (buf.subarray(0, 8192).includes(0)) return "ok";

    const lines = splitLines(buf.toString("utf8"));
    const rel = path.relative(base, file).split(path.sep).join("/");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (regex.test(line)) {
        matches.push({ file: rel, line: i + 1, text: truncate(line, MAX_LINE_CHARS) });
        if (matches.length >= limit) return "limit";
      }
    }
    return "ok";
  }
}
