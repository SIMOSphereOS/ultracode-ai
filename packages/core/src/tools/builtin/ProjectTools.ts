/**
 * `project_status` / `dependencies` — project manifest inspection.
 *
 * Category: project • Default permission: always (architecture tool table).
 * Detects `package.json`, `pyproject.toml` and `Cargo.toml`, summarising
 * name, version, scripts and dependencies. TOML parsing via `smol-toml`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ToolContext, ToolDefinition } from "ultracode-shared";
import { ToolError } from "ultracode-shared";
import { z } from "zod";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";
import { PathGuard } from "../PathGuard.js";

/** Manifest kinds recognised by the project tools. */
export type ManifestKind = "node" | "python" | "rust";

/** One dependency entry. */
export interface DependencyEntry {
  /** Package name. */
  name: string;
  /** Version specifier as written in the manifest. */
  version: string;
  /** `true` for dev-dependencies. */
  dev: boolean;
  /** Manifest file the dependency came from. */
  source: string;
}

/** Summary of a single manifest. */
export interface ManifestSummary {
  /** Ecosystem of the manifest. */
  kind: ManifestKind;
  /** Manifest file name (e.g. `"package.json"`). */
  file: string;
  /** Project name, when declared. */
  name: string | null;
  /** Project version, when declared. */
  version: string | null;
  /** Declared scripts (node only). */
  scripts: Record<string, string>;
  /** Number of runtime dependencies. */
  dependencyCount: number;
  /** Number of dev dependencies. */
  devDependencyCount: number;
}

interface ParsedManifest {
  summary: ManifestSummary;
  dependencies: DependencyEntry[];
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(asRecord(v))) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Parse one manifest file into a summary + dependency list. */
function parseManifest(file: string, kind: ManifestKind, raw: string): ParsedManifest {
  const deps: DependencyEntry[] = [];
  const push = (name: string, version: string, dev: boolean): void => {
    deps.push({ name, version, dev, source: file });
  };

  if (kind === "node") {
    let data: Record<string, unknown>;
    try {
      data = asRecord(JSON.parse(raw));
    } catch (err) {
      throw new ToolError(`Invalid JSON in ${file}: ${(err as Error).message}`, {
        toolName: "project_status",
        cause: err,
      });
    }
    for (const [n, v] of Object.entries(stringMap(data["dependencies"]))) push(n, v, false);
    for (const [n, v] of Object.entries(stringMap(data["devDependencies"]))) push(n, v, true);
    return {
      summary: {
        kind,
        file,
        name: typeof data["name"] === "string" ? data["name"] : null,
        version: typeof data["version"] === "string" ? data["version"] : null,
        scripts: stringMap(data["scripts"]),
        dependencyCount: deps.filter((d) => !d.dev).length,
        devDependencyCount: deps.filter((d) => d.dev).length,
      },
      dependencies: deps,
    };
  }

  let data: Record<string, unknown>;
  try {
    data = asRecord(parseToml(raw));
  } catch (err) {
    throw new ToolError(`Invalid TOML in ${file}: ${(err as Error).message}`, {
      toolName: "project_status",
      cause: err,
    });
  }

  if (kind === "python") {
    const project = asRecord(data["project"]);
    const poetry = asRecord(asRecord(asRecord(data["tool"])["poetry"]));
    const depList = project["dependencies"];
    if (Array.isArray(depList)) {
      for (const entry of depList) {
        if (typeof entry === "string") {
          const m = /^([A-Za-z0-9._-]+)\s*(.*)$/.exec(entry.trim());
          push(m?.[1] ?? entry, m?.[2] ?? "", false);
        }
      }
    }
    for (const [n, v] of Object.entries(asRecord(poetry["dependencies"]))) {
      if (n.toLowerCase() === "python") continue;
      push(n, typeof v === "string" ? v : JSON.stringify(v), false);
    }
    const name =
      typeof project["name"] === "string"
        ? project["name"]
        : typeof poetry["name"] === "string"
          ? poetry["name"]
          : null;
    const version =
      typeof project["version"] === "string"
        ? project["version"]
        : typeof poetry["version"] === "string"
          ? poetry["version"]
          : null;
    return {
      summary: {
        kind,
        file,
        name,
        version,
        scripts: {},
        dependencyCount: deps.filter((d) => !d.dev).length,
        devDependencyCount: deps.filter((d) => d.dev).length,
      },
      dependencies: deps,
    };
  }

  // rust
  const pkg = asRecord(data["package"]);
  const depTable = asRecord(data["dependencies"]);
  const devDepTable = asRecord(data["dev-dependencies"]);
  const versionOf = (v: unknown): string => {
    if (typeof v === "string") return v;
    const rec = asRecord(v);
    return typeof rec["version"] === "string" ? rec["version"] : JSON.stringify(v);
  };
  for (const [n, v] of Object.entries(depTable)) push(n, versionOf(v), false);
  for (const [n, v] of Object.entries(devDepTable)) push(n, versionOf(v), true);
  return {
    summary: {
      kind,
      file,
      name: typeof pkg["name"] === "string" ? pkg["name"] : null,
      version: typeof pkg["version"] === "string" ? pkg["version"] : null,
      scripts: {},
      dependencyCount: deps.filter((d) => !d.dev).length,
      devDependencyCount: deps.filter((d) => d.dev).length,
    },
    dependencies: deps,
  };
}

const MANIFEST_CANDIDATES: ReadonlyArray<{ file: string; kind: ManifestKind }> = [
  { file: "package.json", kind: "node" },
  { file: "pyproject.toml", kind: "python" },
  { file: "Cargo.toml", kind: "rust" },
];

/** Read and parse all recognised manifests inside `dir`. */
async function collectManifests(dir: string): Promise<ParsedManifest[]> {
  const out: ParsedManifest[] = [];
  for (const candidate of MANIFEST_CANDIDATES) {
    const full = path.join(dir, candidate.file);
    let raw: string;
    try {
      raw = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    out.push(parseManifest(candidate.file, candidate.kind, raw));
  }
  return out;
}

/** Construction options for the project tools. */
export interface ProjectToolOptions {
  /** Extra allow-listed directories (besides `ctx.cwd`). */
  allowedDirs?: readonly string[];
}

const projectSchema = z.object({
  /** Directory containing the manifest(s). Defaults to cwd. */
  path: z.string().optional(),
});

/** Successful output of the `project_status` tool. */
export interface ProjectStatusOutput {
  /** One summary per detected manifest (may be empty). */
  projects: ManifestSummary[];
  /** `true` when at least one manifest was found. */
  detected: boolean;
}

/** Summarises detected project manifests (name, version, scripts, deps). */
export class ProjectStatusTool extends BaseTool<typeof projectSchema, ProjectStatusOutput> {
  readonly definition: ToolDefinition = {
    name: "project_status",
    description: "Summarise the project's manifests (package.json, pyproject.toml, Cargo.toml)",
    category: "project",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project directory (default: cwd)" },
      },
    },
    permission: "always",
  };
  protected readonly schema = projectSchema;
  private readonly guard: PathGuard;

  constructor(options: ProjectToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
  }

  protected async run(
    args: z.output<typeof projectSchema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<ProjectStatusOutput>> {
    this.throwIfAborted(ctx);
    const dir = await this.guard.resolve(ctx.cwd, args.path ?? ".", this.definition.name);
    const manifests = await collectManifests(dir);
    return {
      output: {
        projects: manifests.map((m) => m.summary),
        detected: manifests.length > 0,
      },
    };
  }
}

const dependenciesSchema = z.object({
  /** Directory containing the manifest(s). Defaults to cwd. */
  path: z.string().optional(),
});

/** Successful output of the `dependencies` tool. */
export interface DependenciesOutput {
  /** Flat list of all declared dependencies. */
  dependencies: DependencyEntry[];
  /** Total count. */
  count: number;
}

/** Lists declared dependencies from the detected manifests. */
export class DependenciesTool extends BaseTool<typeof dependenciesSchema, DependenciesOutput> {
  readonly definition: ToolDefinition = {
    name: "dependencies",
    description: "List the project's declared dependencies",
    category: "project",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project directory (default: cwd)" },
      },
    },
    permission: "always",
  };
  protected readonly schema = dependenciesSchema;
  private readonly guard: PathGuard;

  constructor(options: ProjectToolOptions = {}) {
    super();
    this.guard = new PathGuard({ allowedDirs: options.allowedDirs });
  }

  protected async run(
    args: z.output<typeof dependenciesSchema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<DependenciesOutput>> {
    this.throwIfAborted(ctx);
    const dir = await this.guard.resolve(ctx.cwd, args.path ?? ".", this.definition.name);
    const manifests = await collectManifests(dir);
    const dependencies = manifests.flatMap((m) => m.dependencies);
    return { output: { dependencies, count: dependencies.length } };
  }
}
