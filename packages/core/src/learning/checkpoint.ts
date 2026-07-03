/**
 * Per-source crawl checkpoint store with `node:sqlite` → JSON fallback.
 *
 * State lets a learn run resume after a hard-stop (runtime cap, abort, crash):
 * processed-URL markers, per-page conditional-GET validators, and the running
 * usage totals. Mirroring the memory module, `node:sqlite` is loaded via a
 * dynamic import; when it is unavailable the store transparently degrades to an
 * atomically-written JSON file in the same directory.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";

import { LearnError } from "./errors.js";
import { sanitizeId, stateDir, stateFile } from "./paths.js";
import type { PageValidators } from "./types.js";

/** Persisted checkpoint for one source's in-progress (or completed) run. */
export interface Checkpoint {
  /** Source id. */
  sourceId: string;
  /** ISO-8601 timestamp of the last checkpoint write. */
  updatedAt: string;
  /** Normalised URLs already processed in this run. */
  processed: string[];
  /** Per-URL conditional-GET validators carried across runs. */
  validators: Record<string, PageValidators>;
  /** Running token/cost accounting. */
  usage: { tokensIn: number; tokensOut: number; actualUsd: number };
}

/** Structural subset of `node:sqlite` used here. */
interface DbLike {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...p: unknown[]): unknown;
    run(...p: unknown[]): { changes: number | bigint };
  };
  close(): void;
}
interface SqliteModuleLike {
  DatabaseSync: new (loc: string) => DbLike;
}

/** Injectable loader for `node:sqlite` (tests simulate unavailability). */
export type SqliteLoader = () => Promise<SqliteModuleLike>;

/** Default loader: dynamic import of the (experimental) builtin. */
export const defaultSqliteLoader: SqliteLoader = async () =>
  (await import("node:sqlite")) as unknown as SqliteModuleLike;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS checkpoint (
  source_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
`;

/**
 * Create the best available checkpoint store: SQLite when `node:sqlite` loads,
 * otherwise a JSON-file store. Never throws for a missing builtin.
 *
 * @param sourceId - Source id (sanitised into the file name).
 * @param homeDir - Home directory override.
 * @param logger - Diagnostics logger.
 * @param loader - Injectable sqlite loader (tests force the fallback).
 */
export async function createCheckpointStore(
  sourceId: string,
  homeDir: string,
  logger: Logger = new NoopLogger(),
  loader: SqliteLoader = defaultSqliteLoader,
): Promise<CheckpointStore> {
  const dir = stateDir(homeDir);
  await mkdir(dir, { recursive: true }).catch(() => undefined);
  const dbPath = stateFile(sourceId, "db", homeDir);
  try {
    const mod = await loader();
    if (typeof mod?.DatabaseSync !== "function") throw new TypeError("no DatabaseSync");
    const db = new mod.DatabaseSync(dbPath);
    db.exec(SCHEMA);
    logger.debug("learning: using sqlite checkpoint store", { dbPath });
    return new SqliteCheckpointStore(sourceId, db);
  } catch (err) {
    logger.warn("learning: node:sqlite unavailable, using JSON checkpoint store", {
      error: String((err as Error)?.message ?? err),
    });
    return new JsonCheckpointStore(sourceId, stateFile(sourceId, "json", homeDir), dir);
  }
}

/** Common interface implemented by both checkpoint backends. */
export interface CheckpointStore {
  /** Load the persisted checkpoint, or `null` when none exists. */
  load(): Promise<Checkpoint | null>;
  /** Persist `cp` (atomic for JSON, single-statement for SQLite). */
  save(cp: Checkpoint): Promise<void>;
  /** Remove the checkpoint (run finished cleanly). */
  clear(): Promise<void>;
  /** Release any underlying handle. */
  close(): void;
}

/** SQLite-backed checkpoint store. */
class SqliteCheckpointStore implements CheckpointStore {
  constructor(
    private readonly sourceId: string,
    private readonly db: DbLike,
  ) {}

  async load(): Promise<Checkpoint | null> {
    try {
      const row = this.db
        .prepare("SELECT data FROM checkpoint WHERE source_id = ?")
        .get(this.sourceId) as { data: string } | undefined;
      if (!row) return null;
      return parseCheckpoint(row.data, this.sourceId);
    } catch (err) {
      throw new LearnError("Failed to load checkpoint", {
        cause: err,
        details: { sourceId: this.sourceId },
      });
    }
  }

  async save(cp: Checkpoint): Promise<void> {
    try {
      this.db
        .prepare(
          "INSERT INTO checkpoint (source_id, data) VALUES (?, ?) ON CONFLICT(source_id) DO UPDATE SET data = excluded.data",
        )
        .run(this.sourceId, JSON.stringify(cp));
    } catch (err) {
      throw new LearnError("Failed to save checkpoint", {
        cause: err,
        details: { sourceId: this.sourceId },
      });
    }
  }

  async clear(): Promise<void> {
    try {
      this.db.prepare("DELETE FROM checkpoint WHERE source_id = ?").run(this.sourceId);
    } catch {
      /* best-effort */
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* best-effort */
    }
  }
}

/** JSON-file checkpoint store (atomic writes). */
class JsonCheckpointStore implements CheckpointStore {
  constructor(
    private readonly sourceId: string,
    private readonly file: string,
    private readonly dir: string,
  ) {}

  async load(): Promise<Checkpoint | null> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw new LearnError("Failed to read checkpoint file", {
        cause: err,
        details: { file: this.file },
      });
    }
    return parseCheckpoint(raw, this.sourceId);
  }

  async save(cp: Checkpoint): Promise<void> {
    const tmp = path.join(this.dir, `.${sanitizeId(this.sourceId)}.json.${randomUUID()}.tmp`);
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(tmp, JSON.stringify(cp), "utf8");
      await rename(tmp, this.file);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw new LearnError("Failed to write checkpoint file", {
        cause: err,
        details: { file: this.file },
      });
    }
  }

  async clear(): Promise<void> {
    await unlink(this.file).catch(() => undefined);
  }

  close(): void {
    /* nothing to release */
  }
}

/** Parse + validate a JSON checkpoint payload, mapping corruption to LearnError. */
function parseCheckpoint(raw: string, sourceId: string): Checkpoint {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LearnError("Checkpoint payload is corrupt", { cause: err, details: { sourceId } });
  }
  const p = (parsed ?? {}) as Partial<Checkpoint>;
  return {
    sourceId,
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date(0).toISOString(),
    processed: Array.isArray(p.processed)
      ? p.processed.filter((x): x is string => typeof x === "string")
      : [],
    validators:
      p.validators && typeof p.validators === "object"
        ? (p.validators as Record<string, PageValidators>)
        : {},
    usage: {
      tokensIn: numeric(p.usage?.tokensIn),
      tokensOut: numeric(p.usage?.tokensOut),
      actualUsd: numeric(p.usage?.actualUsd),
    },
  };
}

/** Coerce to a finite, non-negative number (else 0). */
function numeric(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}
