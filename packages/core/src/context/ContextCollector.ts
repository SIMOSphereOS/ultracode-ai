/**
 * Context collection — gathers project information from independent sources:
 *
 * (a) bounded file tree, (b) git branch + status, (c) project metadata from
 * `package.json`, (d) OS/runtime info, (e) recently modified files.
 *
 * Every source is individually fault-tolerant: a failing source logs a
 * warning and is omitted; `collect` itself never rejects.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { serializeError } from "@ultracode/shared";
import type { Logger } from "@ultracode/shared";

/** One titled block of collected context, ready for ranking/compression. */
export interface ContextSection {
  /** Stable source id (`"project"`, `"git"`, `"recent-files"`, `"file-tree"`, `"system"`). */
  id: string;
  /** Markdown section heading text. */
  title: string;
  /** Plain-text body of the section. */
  content: string;
  /** Default ordering priority — lower comes first when relevance ties. */
  priority: number;
}

/** Result of one git invocation. */
export interface GitRunResult {
  /** `true` when the command exited with code 0. */
  ok: boolean;
  /** Captured stdout. */
  stdout: string;
}

/** Runs a git command; injectable for deterministic tests. */
export type GitRunner = (args: string[], cwd: string) => Promise<GitRunResult>;

/** Options for {@link ContextCollector}. */
export interface ContextCollectorOptions {
  /** Maximum directory depth for the file tree (root entries are depth 0). Default `3`. */
  maxDepth?: number;
  /** Maximum number of tree entries before truncation. Default `200`. */
  maxEntries?: number;
  /** Directory/file names to ignore entirely. Default includes `node_modules`, `.git`, `dist`. */
  ignore?: string[];
  /** How many recently modified files to report. Default `10`. */
  recentFilesLimit?: number;
  /** Git executable name. Default `"git"`. */
  gitCommand?: string;
  /** Replacement git runner (tests). Default spawns {@link ContextCollectorOptions.gitCommand}. */
  gitRunner?: GitRunner;
}

/** Default ignore list for the file-tree walk. */
export const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
] as const;

/** Cap on captured git stdout, to bound memory on huge repos. */
const MAX_GIT_OUTPUT_CHARS = 64_000;

/** Spawn-based git runner (argument array, no shell — injection-safe). */
function makeSpawnGitRunner(command: string): GitRunner {
  return (args, cwd) =>
    new Promise<GitRunResult>((resolve) => {
      let stdout = "";
      let child;
      try {
        child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        resolve({ ok: false, stdout: "" });
        return;
      }
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (stdout.length < MAX_GIT_OUTPUT_CHARS) stdout += chunk;
      });
      child.on("error", () => resolve({ ok: false, stdout: "" }));
      child.on("close", (code) => resolve({ ok: code === 0, stdout }));
    });
}

interface WalkResult {
  lines: string[];
  files: Array<{ rel: string; mtimeMs: number }>;
  truncated: boolean;
}

/**
 * Gathers {@link ContextSection}s from a working directory. Construct once
 * and reuse; the collector holds no per-call state.
 */
export class ContextCollector {
  private readonly logger: Logger;
  private readonly maxDepth: number;
  private readonly maxEntries: number;
  private readonly ignore: Set<string>;
  private readonly recentFilesLimit: number;
  private readonly runGit: GitRunner;

  constructor(logger: Logger, options: ContextCollectorOptions = {}) {
    this.logger = logger;
    this.maxDepth = Math.max(1, Math.floor(options.maxDepth ?? 3));
    this.maxEntries = Math.max(0, Math.floor(options.maxEntries ?? 200));
    this.ignore = new Set(options.ignore ?? [...DEFAULT_IGNORE]);
    this.recentFilesLimit = Math.max(0, Math.floor(options.recentFilesLimit ?? 10));
    this.runGit = options.gitRunner ?? makeSpawnGitRunner(options.gitCommand ?? "git");
  }

  /**
   * Collect all available context sections for `cwd`. Never rejects; failed
   * sources are logged as warnings and omitted from the result.
   */
  async collect(cwd: string): Promise<ContextSection[]> {
    const sections: ContextSection[] = [];

    const project = await this.trysource("project", () => this.collectProject(cwd));
    if (project) sections.push(project);

    const git = await this.trysource("git", () => this.collectGit(cwd));
    if (git) sections.push(git);

    const walk = await this.trysource("file-tree", () => this.walk(cwd));
    if (walk) {
      const recent = this.recentFilesSection(walk);
      if (recent) sections.push(recent);
      sections.push(this.fileTreeSection(walk));
    }

    const system = await this.trysource("system", () => this.collectSystem(cwd));
    if (system) sections.push(system);

    return sections;
  }

  /* ----------------------------------------------------------------------
   * Sources
   * -------------------------------------------------------------------- */

  private async trysource<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Context source "${name}" failed; omitting it`, {
        source: name,
        error: serializeError(err),
      });
      return null;
    }
  }

  /** (c) Project metadata from `package.json` (omitted when absent). */
  private async collectProject(cwd: string): Promise<ContextSection | null> {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(cwd, "package.json"), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null; // normal: not a Node project
      throw err;
    }
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const lines: string[] = [];
    const name = typeof pkg["name"] === "string" ? pkg["name"] : "(unnamed)";
    const version = typeof pkg["version"] === "string" ? pkg["version"] : "?";
    lines.push(`Name: ${name}`, `Version: ${version}`);
    const scripts = pkg["scripts"];
    if (typeof scripts === "object" && scripts !== null && !Array.isArray(scripts)) {
      const names = Object.keys(scripts);
      if (names.length > 0) lines.push(`Scripts: ${names.join(", ")}`);
    }
    return { id: "project", title: "Project", content: lines.join("\n"), priority: 10 };
  }

  /** (b) Git branch + porcelain status; omitted gracefully without git/repo. */
  private async collectGit(cwd: string): Promise<ContextSection | null> {
    const branch = await this.runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (!branch.ok) return null; // no git binary or not a repository
    const lines = [`Branch: ${branch.stdout.trim()}`];
    const status = await this.runGit(["status", "--porcelain"], cwd);
    if (status.ok) {
      const entries = status.stdout.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (entries.length === 0) {
        lines.push("Status: clean");
      } else {
        lines.push(`Status: ${entries.length} changed file(s)`, ...entries.slice(0, 50));
      }
    }
    return { id: "git", title: "Git", content: lines.join("\n"), priority: 20 };
  }

  /** (a)+(e) Bounded file-tree walk, also recording file mtimes. */
  private async walk(root: string): Promise<WalkResult> {
    const lines: string[] = [];
    const files: Array<{ rel: string; mtimeMs: number }> = [];
    let entries = 0;
    let truncated = false;

    const visit = async (dir: string, depth: number): Promise<void> => {
      if (truncated || depth >= this.maxDepth) return;
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable subdirectory: skip silently
      }
      const visible = dirents
        .filter((d) => !this.ignore.has(d.name))
        .sort((a, b) => {
          const dirDiff = Number(b.isDirectory()) - Number(a.isDirectory());
          if (dirDiff !== 0) return dirDiff;
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
      for (const d of visible) {
        if (entries >= this.maxEntries) {
          truncated = true;
          return;
        }
        entries++;
        const indent = "  ".repeat(depth);
        const full = path.join(dir, d.name);
        if (d.isDirectory()) {
          lines.push(`${indent}${d.name}/`);
          await visit(full, depth + 1);
        } else if (d.isFile()) {
          lines.push(`${indent}${d.name}`);
          try {
            const st = await fs.stat(full);
            files.push({ rel: path.relative(root, full).split(path.sep).join("/"), mtimeMs: st.mtimeMs });
          } catch {
            // stat raced with a deletion: tree line is enough
          }
        }
      }
    };

    await visit(root, 0);
    return { lines, files, truncated };
  }

  private fileTreeSection(walk: WalkResult): ContextSection {
    let content = walk.lines.length === 0 ? "(empty)" : walk.lines.join("\n");
    if (walk.truncated) content += "\n… (truncated)";
    return { id: "file-tree", title: "File Tree", content, priority: 40 };
  }

  /** (e) Most recently modified files, newest first. */
  private recentFilesSection(walk: WalkResult): ContextSection | null {
    if (walk.files.length === 0 || this.recentFilesLimit === 0) return null;
    const recent = [...walk.files]
      .sort((a, b) => b.mtimeMs - a.mtimeMs || (a.rel < b.rel ? -1 : 1))
      .slice(0, this.recentFilesLimit)
      .map((f) => f.rel);
    return {
      id: "recent-files",
      title: "Recently Modified Files",
      content: recent.join("\n"),
      priority: 30,
    };
  }

  /** (d) OS/runtime information. */
  private async collectSystem(cwd: string): Promise<ContextSection> {
    const content = [
      `Platform: ${os.platform()} ${os.release()} (${os.arch()})`,
      `Node: ${process.version}`,
      `Working directory: ${cwd}`,
    ].join("\n");
    return { id: "system", title: "System", content, priority: 50 };
  }
}
