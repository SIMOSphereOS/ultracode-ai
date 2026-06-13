import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionError } from "@ultracode/shared";
import type { ChatMessage, LogMeta, Logger } from "@ultracode/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  SqliteSessionStore,
  type SqliteDatabaseLike,
  type SqliteModuleLike,
  type SqliteStatementLike,
} from "./SqliteSessionStore.js";

// node:sqlite exists only on Node >= 22.5; on older supported runtimes the
// concurrency test that needs a real on-disk database is skipped.
const SQLITE_AVAILABLE: boolean = await (async () => {
  try {
    const mod = (await import("node:sqlite")) as { DatabaseSync?: unknown };
    return typeof mod.DatabaseSync === "function";
  } catch {
    return false;
  }
})();

function silentLogger(): Logger {
  const noop = (_m: string, _meta?: LogMeta): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

describe("SqliteSessionStore (open pragmas)", () => {
  it("enables WAL and busy_timeout right after opening the database", async () => {
    const execCalls: string[] = [];
    const fakeStmt: SqliteStatementLike = {
      get: () => undefined,
      all: () => [],
      run: () => ({ changes: 0 }),
    };
    const fakeDb: SqliteDatabaseLike = {
      exec: (sql) => {
        execCalls.push(sql);
      },
      prepare: () => fakeStmt,
      close: () => undefined,
    };
    const loader = async (): Promise<SqliteModuleLike> => ({
      DatabaseSync: class {
        constructor(_location: string) {
          return fakeDb as unknown as InstanceType<SqliteModuleLike["DatabaseSync"]>;
        }
      } as unknown as SqliteModuleLike["DatabaseSync"],
    });

    const store = await SqliteSessionStore.open(":memory:", silentLogger(), loader);
    store.close();

    const pragmaExec = execCalls.find((sql) => sql.includes("PRAGMA"));
    expect(pragmaExec).toBeDefined();
    expect(pragmaExec).toContain("journal_mode=WAL");
    expect(pragmaExec).toContain("busy_timeout=5000");
    // PRAGMAs must run before the schema is created.
    const pragmaIndex = execCalls.findIndex((sql) => sql.includes("PRAGMA"));
    const schemaIndex = execCalls.findIndex((sql) => sql.includes("CREATE TABLE"));
    expect(pragmaIndex).toBeLessThan(schemaIndex);
  });
});

describe("SqliteSessionStore.appendMessages (transaction)", () => {
  it("wraps the read-modify-write in BEGIN IMMEDIATE/COMMIT", async () => {
    if (!SQLITE_AVAILABLE) return;
    const execCalls: string[] = [];
    const mod = (await import("node:sqlite")) as unknown as SqliteModuleLike;
    // Wrap a real in-memory node:sqlite database, recording exec() calls so the
    // transaction boundaries around appendMessages are observable.
    const loader = async (): Promise<SqliteModuleLike> => ({
      DatabaseSync: function (this: unknown, location: string): SqliteDatabaseLike {
        const inner = new mod.DatabaseSync(location);
        const wrapped: SqliteDatabaseLike = {
          exec: (sql) => {
            execCalls.push(sql);
            inner.exec(sql);
          },
          prepare: (sql) => inner.prepare(sql),
          close: () => inner.close(),
        };
        return wrapped;
      } as unknown as SqliteModuleLike["DatabaseSync"],
    });

    const store = await SqliteSessionStore.open(":memory:", silentLogger(), loader);
    const meta = await store.create("default");
    await store.appendMessages(meta.id, [{ role: "user", content: "hi" }]);
    store.close();

    expect(execCalls).toContain("BEGIN IMMEDIATE");
    expect(execCalls).toContain("COMMIT");
    // BEGIN must precede COMMIT.
    expect(execCalls.indexOf("BEGIN IMMEDIATE")).toBeLessThan(execCalls.indexOf("COMMIT"));
  });

  it("rolls back when the read-modify-write fails", async () => {
    const execCalls: string[] = [];
    const fakeStmt: SqliteStatementLike = {
      // Returning undefined makes appendMessages throw an "unknown session"
      // SessionError after BEGIN IMMEDIATE but before COMMIT.
      get: () => undefined,
      all: () => [],
      run: () => ({ changes: 0 }),
    };
    const fakeDb: SqliteDatabaseLike = {
      exec: (sql) => {
        execCalls.push(sql);
      },
      prepare: () => fakeStmt,
      close: () => undefined,
    };
    const loader = async (): Promise<SqliteModuleLike> => ({
      DatabaseSync: class {
        constructor(_location: string) {
          return fakeDb as unknown as InstanceType<SqliteModuleLike["DatabaseSync"]>;
        }
      } as unknown as SqliteModuleLike["DatabaseSync"],
    });

    const store = await SqliteSessionStore.open(":memory:", silentLogger(), loader);
    await expect(store.appendMessages("missing", [{ role: "user", content: "x" }])).rejects.toBeInstanceOf(
      SessionError,
    );
    store.close();

    expect(execCalls).toContain("BEGIN IMMEDIATE");
    expect(execCalls).toContain("ROLLBACK");
    expect(execCalls).not.toContain("COMMIT");
  });
});

describe.skipIf(!SQLITE_AVAILABLE)("SqliteSessionStore concurrency (two instances, same db file)", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    dir = undefined;
  });

  it("does not lose messages when two store instances append concurrently", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-sqlite-concurrency-"));
    const dbPath = path.join(dir, "sessions.db");

    // Two independent store instances point at the same database file, mirroring
    // two UltraCode terminals open in the same project.
    const a = await SqliteSessionStore.open(dbPath, silentLogger());
    const b = await SqliteSessionStore.open(dbPath, silentLogger());

    const meta = await a.create("default", "shared");

    const total = 50;
    const ops: Array<Promise<void>> = [];
    for (let i = 0; i < total; i++) {
      const store = i % 2 === 0 ? a : b;
      const msg: ChatMessage = { role: "user", content: `m${i}` };
      ops.push(store.appendMessages(meta.id, [msg]));
    }
    await Promise.all(ops);

    const record = await a.get(meta.id);
    a.close();
    b.close();

    expect(record).not.toBeNull();
    // Every concurrent append must survive — no lost updates from the race.
    expect(record?.messageCount).toBe(total);
    const contents = new Set((record?.messages ?? []).map((m) => m.content));
    for (let i = 0; i < total; i++) {
      expect(contents.has(`m${i}`)).toBe(true);
    }
  });
});
