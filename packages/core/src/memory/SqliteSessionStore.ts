/**
 * SQLite-backed {@link ISessionStore} on top of `node:sqlite`.
 *
 * `node:sqlite` is experimental and unavailable on older Node versions, so it
 * is loaded via a dynamic import inside {@link SqliteSessionStore.open}. When
 * the import (or opening the database) fails, the caller — typically
 * `createSessionStore` — falls back to the JSON store.
 */

import { SessionError, generateId } from "@ultracode/shared";
import type { ChatMessage, ISessionStore, Logger, SessionMeta, SessionRecord } from "@ultracode/shared";

import {
  DEFAULT_SESSION_TITLE,
  applyListLimit,
  nowIso,
  selectPruneVictims,
} from "./sessionInternals.js";

/** Structural subset of `node:sqlite`'s prepared statement. */
export interface SqliteStatementLike {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint };
}

/** Structural subset of `node:sqlite`'s `DatabaseSync`. */
export interface SqliteDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatementLike;
  close(): void;
}

/** Structural subset of the `node:sqlite` module. */
export interface SqliteModuleLike {
  DatabaseSync: new (location: string) => SqliteDatabaseLike;
}

/** Loader for the sqlite module — injectable so tests can simulate failure. */
export type SqliteLoader = () => Promise<SqliteModuleLike>;

/** Default loader: dynamic import of the (possibly experimental) builtin. */
export const defaultSqliteLoader: SqliteLoader = async () =>
  (await import("node:sqlite")) as unknown as SqliteModuleLike;

/** Shape of a row in the `sessions` table. */
interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  agent_name: string;
  messages: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  messages TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions (updated_at);
`;

/**
 * Synchronous-SQLite session store. All `ISessionStore` methods are async per
 * contract but execute atomically within a single call. Hard failures reject
 * with {@link SessionError}.
 */
export class SqliteSessionStore implements ISessionStore {
  private readonly db: SqliteDatabaseLike;
  // Logger kept for parity with the other stores and future diagnostics.
  private readonly logger: Logger;
  private closed = false;

  private constructor(db: SqliteDatabaseLike, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Open (or create) the database at `dbPath` and initialise the schema.
   *
   * @param dbPath - Database file path (`":memory:"` is also valid).
   * @param logger - Logger for diagnostics.
   * @param loader - Module loader; tests inject a failing one to simulate an
   *   unavailable `node:sqlite`.
   * @throws SessionError when the module cannot be loaded or the database
   *   cannot be opened.
   */
  static async open(
    dbPath: string,
    logger: Logger,
    loader: SqliteLoader = defaultSqliteLoader,
  ): Promise<SqliteSessionStore> {
    let mod: SqliteModuleLike;
    try {
      mod = await loader();
      if (typeof mod?.DatabaseSync !== "function") {
        throw new TypeError("node:sqlite did not expose DatabaseSync");
      }
    } catch (err) {
      throw new SessionError("node:sqlite is not available", {
        cause: err,
        details: { dbPath },
      });
    }
    try {
      const db = new mod.DatabaseSync(dbPath);
      db.exec(SCHEMA);
      logger.debug("Opened sqlite session store", { dbPath });
      return new SqliteSessionStore(db, logger);
    } catch (err) {
      throw new SessionError(`Failed to open sqlite session database at "${dbPath}"`, {
        cause: err,
        details: { dbPath },
      });
    }
  }

  /** Close the underlying database handle (idempotent). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.close();
    } catch {
      // Closing is best-effort.
    }
  }

  /** Create a new, empty session and return its header. */
  async create(agentName: string, title?: string): Promise<SessionMeta> {
    return this.guard("create session", () => {
      const ts = nowIso();
      const meta: SessionMeta = {
        id: generateId("session"),
        title: title ?? DEFAULT_SESSION_TITLE,
        createdAt: ts,
        updatedAt: ts,
        agentName,
        messageCount: 0,
      };
      this.db
        .prepare(
          "INSERT INTO sessions (id, title, created_at, updated_at, agent_name, message_count, messages) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(meta.id, meta.title, meta.createdAt, meta.updatedAt, meta.agentName, 0, "[]");
      return meta;
    });
  }

  /** Load a full session by id, or `null` if absent. */
  async get(id: string): Promise<SessionRecord | null> {
    return this.guard("load session", () => {
      const row = this.db
        .prepare("SELECT id, title, created_at, updated_at, agent_name, messages FROM sessions WHERE id = ?")
        .get(id) as SessionRow | undefined;
      if (!row) return null;
      const messages = this.parseMessages(row);
      return {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        agentName: row.agent_name,
        messageCount: messages.length,
        messages,
      };
    });
  }

  /** Append messages, bumping `updatedAt` and `messageCount`. */
  async appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
    await this.guard("append messages", () => {
      const row = this.db
        .prepare("SELECT id, title, created_at, updated_at, agent_name, messages FROM sessions WHERE id = ?")
        .get(id) as SessionRow | undefined;
      if (!row) {
        throw new SessionError(`Cannot append messages: unknown session "${id}"`, {
          details: { id },
        });
      }
      const messages = this.parseMessages(row).concat(msgs);
      this.db
        .prepare("UPDATE sessions SET messages = ?, message_count = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(messages), messages.length, nowIso(), id);
    });
  }

  /** List session headers, most-recent first. */
  async list(limit?: number): Promise<SessionMeta[]> {
    return this.guard("list sessions", () => {
      const rows = this.db
        .prepare(
          "SELECT id, title, created_at, updated_at, agent_name, message_count FROM sessions ORDER BY updated_at DESC, created_at DESC, id ASC",
        )
        .all() as Array<Omit<SessionRow, "messages"> & { message_count: number | bigint }>;
      const metas: SessionMeta[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        agentName: row.agent_name,
        messageCount: Number(row.message_count),
      }));
      return applyListLimit(metas, limit);
    });
  }

  /** Delete a session; `true` if it existed. */
  async delete(id: string): Promise<boolean> {
    return this.guard("delete session", () => {
      const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      return Number(result.changes) > 0;
    });
  }

  /** Retain only the `maxSessions` most-recent sessions; returns the count removed. */
  async prune(maxSessions: number): Promise<number> {
    return this.guard("prune sessions", () => {
      const rows = this.db
        .prepare("SELECT id, title, created_at, updated_at, agent_name, message_count FROM sessions")
        .all() as Array<Omit<SessionRow, "messages"> & { message_count: number | bigint }>;
      const metas: SessionMeta[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        agentName: row.agent_name,
        messageCount: Number(row.message_count),
      }));
      const victims = selectPruneVictims(metas, maxSessions);
      const del = this.db.prepare("DELETE FROM sessions WHERE id = ?");
      let removed = 0;
      for (const id of victims) {
        if (Number(del.run(id).changes) > 0) removed++;
      }
      return removed;
    });
  }

  /* ----------------------------------------------------------------------
   * Internals
   * -------------------------------------------------------------------- */

  /** Run a synchronous db operation, mapping unexpected errors to SessionError. */
  private async guard<T>(op: string, fn: () => T): Promise<T> {
    try {
      return fn();
    } catch (err) {
      if (err instanceof SessionError) throw err;
      throw new SessionError(`Failed to ${op}`, { cause: err });
    }
  }

  private parseMessages(row: SessionRow): ChatMessage[] {
    try {
      const parsed: unknown = JSON.parse(row.messages);
      if (!Array.isArray(parsed)) throw new TypeError("messages column is not an array");
      return parsed as ChatMessage[];
    } catch (err) {
      throw new SessionError(`Session "${row.id}" has a corrupt message payload`, {
        cause: err,
        details: { id: row.id },
      });
    }
  }
}
