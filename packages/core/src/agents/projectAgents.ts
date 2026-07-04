/**
 * Project-local agents loader.
 *
 * In addition to the built-in agents and any config-declared agents served by
 * {@link AgentManager}, a repository may ship its own agents under
 * `<cwd>/.ultracode/agents/<name>.md`. The layout is **flat**: one markdown
 * file per agent. Those files use a **lightweight** frontmatter — typically only
 * `name` and `description` — and their markdown body is the agent's system
 * prompt. Feeding them through the product's fully-specified skill parser would
 * be inappropriate, so this loader reuses the lenient frontmatter splitter and
 * maps each file to an {@link AgentDefinition} of type `"custom"` whose
 * {@link AgentDefinition.systemPrompt} is the markdown body.
 *
 * The loader is total and fail-safe: a missing directory yields `[]` (not an
 * error), and any corrupt/unreadable/nameless file is skipped and logged rather
 * than aborting the whole load. This mirrors the tolerance of the project-local
 * skills loader so that a bad on-disk file can never break the agent at runtime.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentDefinition, Logger } from "ultracode-shared";
import { NoopLogger, serializeError } from "ultracode-shared";

import { splitDocument } from "../authoring/frontmatter.js";

/** Directory (relative to a project root) that holds project-local agents. */
const PROJECT_AGENTS_SUBPATH = path.join(".ultracode", "agents");

/** Options for {@link loadProjectAgents}. */
export interface LoadProjectAgentsOptions {
  /** Logger for skip/failure warnings (defaults to a no-op). */
  logger?: Logger;
}

/**
 * Load every well-formed agent from `<cwd>/.ultracode/agents/*.md`.
 *
 * Each markdown file is mapped to an {@link AgentDefinition} with `type:
 * "custom"`, its `name`/`description` taken from the lightweight frontmatter and
 * its {@link AgentDefinition.systemPrompt} set to the markdown body. A missing
 * agents directory yields `[]`. Corrupt, unreadable or name-less files are
 * skipped and logged; the load never throws. Results are sorted by agent name
 * for determinism.
 *
 * @param cwd - The project root (usually `process.cwd()`).
 * @param opts - Optional logger.
 */
export async function loadProjectAgents(
  cwd: string,
  opts: LoadProjectAgentsOptions = {},
): Promise<AgentDefinition[]> {
  const logger = opts.logger ?? new NoopLogger();
  const root = path.join(cwd, PROJECT_AGENTS_SUBPATH);

  let fileNames: string[];
  try {
    // Infer the `Dirent[]` element type from the call itself; annotating the
    // result via `ReturnType<typeof fs.readdir>` resolves the wrong overload.
    const entries = await fs.readdir(root, { withFileTypes: true });
    fileNames = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
  } catch (err) {
    // A missing agents directory is the normal case — quietly yield nothing.
    if (isEnoent(err)) return [];
    // Any other failure (permissions, I/O) is non-fatal: warn and yield nothing
    // so a broken project store can never break the agent at runtime.
    logger.warn("agents.project-agent.readdir-failed", {
      root,
      error: serializeError(err),
    });
    return [];
  }

  const agents: AgentDefinition[] = [];
  for (const fileName of fileNames) {
    const agent = await loadOne(root, fileName, logger);
    if (agent !== null) agents.push(agent);
  }

  // Deterministic order regardless of the underlying readdir ordering.
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

/**
 * Load and map a single `<root>/<fileName>`, or `null` when it is unreadable,
 * has no frontmatter, or declares no `name`.
 */
async function loadOne(
  root: string,
  fileName: string,
  logger: Logger,
): Promise<AgentDefinition | null> {
  const file = path.join(root, fileName);

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    logger.warn("agents.project-agent.read-failed", {
      file,
      error: serializeError(err),
    });
    return null;
  }

  // Lenient split: reuse the frontmatter splitter (which does NOT enforce the
  // product's required fields) and extract only the fields we care about.
  const split = splitDocument(raw);
  if (split === null) {
    logger.warn("agents.project-agent.corrupt", { file });
    return null;
  }
  const { bag, body } = split;

  const name = scalar(bag["name"]);
  if (name === undefined || name === "") {
    logger.warn("agents.project-agent.no-name", { file });
    return null;
  }

  return {
    name,
    description: scalar(bag["description"]) ?? "",
    type: "custom",
    systemPrompt: body,
  };
}

/**
 * Coerce a raw frontmatter value to a scalar string. A list value collapses to
 * its first element (matching the frontmatter splitter's tolerance).
 */
function scalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** `true` for a Node `ENOENT` (file/dir not found) error. */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
