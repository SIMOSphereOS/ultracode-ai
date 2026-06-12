/**
 * {@link SourceLibrary} — the persisted catalogue of learnable doc sources.
 *
 * Sources live in `~/.ultracode/learning/sources.toml`, parsed/serialised with
 * `smol-toml` and written atomically (tmp + rename). On first access the file
 * is seeded with a set of **on-demand** sources (they never run automatically;
 * a learn run requires an explicit `approved: true`).
 */

import os from "node:os";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { NoopLogger } from "@ultracode/shared";
import type { Logger } from "@ultracode/shared";

import { LearnError } from "./errors.js";
import { learningDir, sourcesFile } from "./paths.js";
import type { LearnSource } from "./types.js";

/** The sources every fresh library is seeded with (on-demand only). */
export const SEED_SOURCES: LearnSource[] = [
  {
    id: "azure-docs",
    url: "https://learn.microsoft.com/de-de/azure/?product=popular",
    type: "web-docs",
    catalog: "azure",
    schedule: "on-demand",
    scope: "core-services",
    localeDefault: "de-de",
  },
  {
    id: "azure-training",
    url: "https://learn.microsoft.com/de-de/training/azure/",
    type: "web-docs",
    catalog: "azure-training",
    schedule: "on-demand",
    scope: "training-learning-paths",
    localeDefault: "de-de",
  },
  {
    id: "pytest-docs",
    url: "https://docs.pytest.org/en/stable/",
    type: "web-docs",
    catalog: "pytest",
    schedule: "on-demand",
    scope: "how-to-and-reference",
    localeDefault: "en",
  },
];

/** Persisted, in-order list of doc sources. */
export class SourceLibrary {
  private readonly file: string;
  private readonly dir: string;
  private readonly logger: Logger;

  /**
   * @param homeDir - Home directory override (defaults to `os.homedir()`).
   * @param logger - Logger for diagnostics (defaults to {@link NoopLogger}).
   */
  constructor(homeDir: string = os.homedir(), logger: Logger = new NoopLogger()) {
    this.file = sourcesFile(homeDir);
    this.dir = learningDir(homeDir);
    this.logger = logger;
  }

  /** List all sources (seeding the file on first access). Most-recent order preserved. */
  async list(): Promise<LearnSource[]> {
    const existing = await this.read();
    if (existing === null) {
      await this.writeAll(SEED_SOURCES);
      return SEED_SOURCES.map(clone);
    }
    return existing.map(clone);
  }

  /** Add or replace a source (by `id`), persisting atomically. */
  async add(source: LearnSource): Promise<void> {
    validateSource(source);
    const all = (await this.list()).filter((s) => s.id !== source.id);
    all.push(clone(source));
    await this.writeAll(all);
  }

  /** Remove a source by id; returns `true` when one was removed. */
  async remove(id: string): Promise<boolean> {
    const all = await this.list();
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) return false;
    await this.writeAll(next);
    return true;
  }

  /** Get a single source by id, or `null` when absent. */
  async get(id: string): Promise<LearnSource | null> {
    const all = await this.list();
    const found = all.find((s) => s.id === id);
    return found ? clone(found) : null;
  }

  /* --------------------------------------------------------------------- */

  /** Read + parse the TOML file, or `null` when it does not exist yet. */
  private async read(): Promise<LearnSource[] | null> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw new LearnError("Failed to read learning sources file", {
        cause: err,
        details: { file: this.file },
      });
    }
    let parsed: unknown;
    try {
      parsed = parseToml(raw);
    } catch (err) {
      throw new LearnError("learning sources.toml is corrupt", {
        cause: err,
        details: { file: this.file },
      });
    }
    const arr = (parsed as { source?: unknown })?.source;
    if (!Array.isArray(arr)) return [];
    return arr.map((entry, i) => coerceSource(entry, i));
  }

  /** Serialise + atomically write the full source list. */
  private async writeAll(sources: LearnSource[]): Promise<void> {
    const doc = { source: sources.map(toTomlEntry) };
    let text: string;
    try {
      text = stringifyToml(doc);
    } catch (err) {
      throw new LearnError("Failed to serialise learning sources", { cause: err });
    }
    const tmp = path.join(this.dir, `.sources.toml.${randomUUID()}.tmp`);
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(tmp, text, "utf8");
      await rename(tmp, this.file);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw new LearnError("Failed to write learning sources file", {
        cause: err,
        details: { file: this.file },
      });
    }
  }
}

/** Deep-ish clone of a source (defends against caller mutation). */
function clone(s: LearnSource): LearnSource {
  return { ...s, state: s.state ? { ...s.state } : undefined };
}

/** Validate the minimal required fields of a source before persisting. */
function validateSource(s: LearnSource): void {
  if (!s || typeof s.id !== "string" || s.id.length === 0) {
    throw new LearnError("Source id is required", { details: { source: s } });
  }
  if (typeof s.url !== "string" || s.url.length === 0) {
    throw new LearnError("Source url is required", { details: { id: s.id } });
  }
  if (typeof s.catalog !== "string" || s.catalog.length === 0) {
    throw new LearnError("Source catalog is required", { details: { id: s.id } });
  }
}

/** Coerce an untrusted TOML entry into a {@link LearnSource}. */
function coerceSource(entry: unknown, index: number): LearnSource {
  const e = (entry ?? {}) as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id : "";
  if (id.length === 0) {
    throw new LearnError(`Source entry #${index} is missing an id`, { details: { index } });
  }
  const src: LearnSource = {
    id,
    url: typeof e.url === "string" ? e.url : "",
    type: "web-docs",
    catalog: typeof e.catalog === "string" ? e.catalog : "default",
    schedule: typeof e.schedule === "string" ? e.schedule : "on-demand",
    localeDefault: typeof e.localeDefault === "string" ? e.localeDefault : "de-de",
  };
  if (typeof e.scope === "string") src.scope = e.scope;
  if (typeof e.lastProcessed === "string") src.lastProcessed = e.lastProcessed;
  if (e.state && typeof e.state === "object") src.state = e.state as Record<string, unknown>;
  return src;
}

/** Convert a source into a plain TOML-serialisable object (drops undefined). */
function toTomlEntry(s: LearnSource): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: s.id,
    url: s.url,
    type: s.type,
    catalog: s.catalog,
    schedule: s.schedule,
    localeDefault: s.localeDefault,
  };
  if (s.scope !== undefined) out.scope = s.scope;
  if (s.lastProcessed !== undefined) out.lastProcessed = s.lastProcessed;
  if (s.state !== undefined) out.state = s.state;
  return out;
}
