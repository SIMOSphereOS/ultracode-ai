/**
 * Filesystem-backed registry for skills.
 *
 * Skills live as markdown-with-frontmatter files under
 * `~/.ultracode/skills/<catalog>/<name>.md` (the `~` is expanded via
 * {@link resolveHome}). Writes are atomic (temp file + rename). Corrupt files
 * are tolerated on read paths: a warning is logged and the file is skipped —
 * never a crash.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NoopLogger, serializeError } from "@ultracode/shared";
import type { Logger } from "@ultracode/shared";

import { resolveHome } from "../config/paths.js";
import { SAFE_SEGMENT, SKILLS_ROOT } from "./defaults.js";
import { AuthoringError } from "./errors.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import type { Skill, SkillFrontmatter } from "./types.js";

/**
 * Loads, lists and persists {@link Skill}s as markdown files. The single source
 * of truth for skill persistence; the authoring layer writes only through it.
 */
export class SkillRegistry {
  private readonly root: string;
  private readonly logger: Logger;

  /**
   * @param homeDir - Home-directory override (defaults to `os.homedir()`).
   * @param logger - Logger for corrupt-file warnings (defaults to a no-op).
   */
  constructor(homeDir: string = os.homedir(), logger: Logger = new NoopLogger()) {
    this.root = resolveHome(SKILLS_ROOT, homeDir);
    this.logger = logger;
  }

  /** Absolute path to the file backing `<catalog>/<name>`. */
  private fileFor(catalog: string, name: string): string {
    if (!SAFE_SEGMENT.test(catalog) || !SAFE_SEGMENT.test(name)) {
      throw new AuthoringError(
        `Unsafe skill identifier: ${JSON.stringify({ catalog, name })}`,
        { details: { catalog, name } },
      );
    }
    return path.join(this.root, catalog, `${name}.md`);
  }

  /**
   * Load every well-formed skill from disk. Corrupt/unreadable files are
   * logged and skipped. Result order is unspecified.
   */
  public async load(): Promise<Skill[]> {
    const out: Skill[] = [];
    let catalogs: string[];
    try {
      catalogs = await this.listDirs(this.root);
    } catch (err) {
      // A missing root is normal on first run.
      if (isEnoent(err)) return out;
      throw new AuthoringError("Failed to enumerate skills root", {
        cause: err,
        details: { root: this.root },
      });
    }

    for (const catalog of catalogs) {
      const dir = path.join(this.root, catalog);
      let files: string[];
      try {
        files = await fs.readdir(dir);
      } catch (err) {
        this.logger.warn("authoring.skill.readdir-failed", {
          dir,
          error: serializeError(err),
        });
        continue;
      }
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const full = path.join(dir, file);
        let raw: string;
        try {
          raw = await fs.readFile(full, "utf8");
        } catch (err) {
          this.logger.warn("authoring.skill.read-failed", {
            file: full,
            error: serializeError(err),
          });
          continue;
        }
        const skill = parseFrontmatter(raw);
        if (skill === null) {
          this.logger.warn("authoring.skill.corrupt", { file: full });
          continue;
        }
        out.push(skill);
      }
    }
    return out;
  }

  /**
   * Fetch a single skill by name (searching every catalog). Returns `null`
   * when no well-formed skill with that name exists.
   *
   * @param name - Skill name.
   */
  public async get(name: string): Promise<Skill | null> {
    if (typeof name !== "string" || name.length === 0) return null;
    const all = await this.load();
    return all.find((s) => s.name === name) ?? null;
  }

  /**
   * Persist a skill atomically, creating its catalog directory as needed.
   *
   * @param skill - The skill to write.
   * @throws {AuthoringError} on an unsafe identifier or a filesystem failure.
   */
  public async save(skill: Skill): Promise<void> {
    const file = this.fileFor(skill.catalog, skill.name);
    const data = serializeFrontmatter(skill);
    const dir = path.dirname(file);
    const tmp = path.join(dir, `.${path.basename(file)}.${randomSuffix()}.tmp`);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tmp, data, "utf8");
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw new AuthoringError(`Failed to write skill file: ${file}`, {
        cause: err,
        details: { file },
      });
    }
  }

  /**
   * List frontmatter (no bodies) for all skills, optionally filtered by
   * catalog. Corrupt files are skipped.
   *
   * @param catalog - Optional catalog filter.
   */
  public async list(catalog?: string): Promise<SkillFrontmatter[]> {
    const all = await this.load();
    const filtered = catalog === undefined ? all : all.filter((s) => s.catalog === catalog);
    return filtered.map(({ body: _body, ...fm }) => fm);
  }

  /** List immediate sub-directory names of `dir`. */
  private async listDirs(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }
}

/** `true` for a Node `ENOENT` (file/dir not found) error. */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/** Random suffix for atomic temp files (avoids a crypto import dance). */
function randomSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
