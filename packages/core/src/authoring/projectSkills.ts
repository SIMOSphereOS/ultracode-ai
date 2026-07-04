/**
 * Project-local skills loader.
 *
 * In addition to the home-directory skill store (`~/.ultracode/skills`, served
 * by {@link SkillRegistry}), a repository may ship its own skills under
 * `<cwd>/.ultracode/skills/<name>/SKILL.md`. Those files use a **lightweight**
 * frontmatter — typically only `name` and `description` (optionally `triggers`)
 * — rather than the heavy, fully-specified frontmatter the product parser
 * ({@link parseFrontmatter}) requires. Feeding them through that parser would
 * yield `null` for every one (missing `version`/`catalog`/`status`/timestamps),
 * so this loader does its own lenient field extraction and fills the remaining
 * {@link Skill} fields with sensible project defaults.
 *
 * The loader is total and fail-safe: a missing directory yields `[]` (not an
 * error), and any corrupt/unreadable/nameless file is skipped and logged rather
 * than aborting the whole load. This mirrors the tolerance of
 * {@link SkillRegistry.load} so that a bad on-disk file can never break the
 * agent at runtime.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Logger } from "ultracode-shared";
import { NoopLogger, serializeError } from "ultracode-shared";

import { splitDocument } from "./frontmatter.js";
import type { Skill } from "./types.js";

/**
 * Directory (relative to a project root) that holds project-local skills.
 * Each immediate sub-directory is one skill, backed by a {@link SKILL_FILENAME}.
 */
const PROJECT_SKILLS_SUBPATH = path.join(".ultracode", "skills");

/** The single markdown file that backs each project skill directory. */
const SKILL_FILENAME = "SKILL.md";

/** Catalog assigned to every project-local skill. */
const PROJECT_CATALOG = "project";

/** Version used when a project skill declares none in its frontmatter. */
const DEFAULT_PROJECT_SKILL_VERSION = "0.0.0";

/** Options for {@link loadProjectSkills}. */
export interface LoadProjectSkillsOptions {
  /** Logger for skip/failure warnings (defaults to a no-op). */
  logger?: Logger;
}

/**
 * Load every well-formed skill from `<cwd>/.ultracode/skills/*​/SKILL.md`.
 *
 * Returns the skills mapped to the product {@link Skill} type with project
 * defaults (`catalog: "project"`, `status: "active"`, timestamps from the file
 * mtime, `version` from frontmatter or `"0.0.0"`). A missing skills directory
 * yields `[]`. Corrupt, unreadable or name-less files are skipped and logged;
 * the load never throws. Results are sorted by skill name for determinism.
 *
 * @param cwd - The project root (usually `process.cwd()`).
 * @param opts - Optional logger.
 */
export async function loadProjectSkills(
  cwd: string,
  opts: LoadProjectSkillsOptions = {},
): Promise<Skill[]> {
  const logger = opts.logger ?? new NoopLogger();
  const root = path.join(cwd, PROJECT_SKILLS_SUBPATH);

  let dirNames: string[];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    // A missing skills directory is the normal case — quietly yield nothing.
    if (isEnoent(err)) return [];
    // Any other failure (permissions, I/O) is non-fatal: warn and yield nothing
    // so a broken project store can never break the agent at runtime.
    logger.warn("authoring.project-skill.readdir-failed", {
      root,
      error: serializeError(err),
    });
    return [];
  }

  const skills: Skill[] = [];
  for (const dirName of dirNames) {
    const skill = await loadOne(root, dirName, logger);
    if (skill !== null) skills.push(skill);
  }

  // Deterministic order regardless of the underlying readdir ordering.
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Load and map a single `<root>/<dirName>/SKILL.md`, or `null` when it is
 * missing, unreadable, has no frontmatter, or declares no `name`.
 */
async function loadOne(root: string, dirName: string, logger: Logger): Promise<Skill | null> {
  const file = path.join(root, dirName, SKILL_FILENAME);

  let raw: string;
  let mtimeIso: string;
  try {
    const [contents, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
    raw = contents;
    mtimeIso = stat.mtime.toISOString();
  } catch (err) {
    // A skill directory without a readable SKILL.md is simply skipped. ENOENT
    // is expected (stray directory); anything else is warned for visibility.
    if (!isEnoent(err)) {
      logger.warn("authoring.project-skill.read-failed", {
        file,
        error: serializeError(err),
      });
    }
    return null;
  }

  // Lenient split: reuse the frontmatter splitter (which does NOT enforce the
  // product's required fields) and extract only the fields we care about.
  const split = splitDocument(raw);
  if (split === null) {
    logger.warn("authoring.project-skill.corrupt", { file });
    return null;
  }
  const { bag, body } = split;

  const name = scalar(bag["name"]);
  if (name === undefined || name === "") {
    logger.warn("authoring.project-skill.no-name", { file });
    return null;
  }

  return {
    name,
    description: scalar(bag["description"]) ?? "",
    version: scalar(bag["version"]) ?? DEFAULT_PROJECT_SKILL_VERSION,
    catalog: PROJECT_CATALOG,
    triggers: list(bag["triggers"]),
    sources: [],
    status: "active",
    createdAt: mtimeIso,
    updatedAt: mtimeIso,
    body,
  };
}

/**
 * Coerce a raw frontmatter value to a scalar string. A list value collapses to
 * its first element (matching the product parser's tolerance).
 */
function scalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Coerce a raw frontmatter value to a string list (empty scalar → `[]`). */
function list(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  return v === "" ? [] : [v];
}

/** `true` for a Node `ENOENT` (file/dir not found) error. */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
