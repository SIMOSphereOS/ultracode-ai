import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_CONFIG } from "@ultracode/shared";
import type { LogMeta, Logger, UltraCodeConfig } from "@ultracode/shared";
import { afterEach, describe, expect, it } from "vitest";

import { InMemorySessionStore } from "./InMemorySessionStore.js";
import { JsonSessionStore } from "./JsonSessionStore.js";
import { SqliteSessionStore } from "./SqliteSessionStore.js";
import { SESSION_DB_FILENAME, createSessionStore } from "./index.js";

// node:sqlite exists only on Node >= 22.5; on older supported runtimes the
// factory deliberately falls back to JSON. Detect which backend the *default*
// path will pick so the assertions match the runtime instead of hard-failing
// on Node 20.
const SQLITE_AVAILABLE: boolean = await (async () => {
  try {
    const mod = (await import("node:sqlite")) as { DatabaseSync?: unknown };
    return typeof mod.DatabaseSync === "function";
  } catch {
    return false;
  }
})();

function configWith(saveDir: string, enablePersistence = true): UltraCodeConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.sessions.saveDir = saveDir;
  config.sessions.enablePersistence = enablePersistence;
  return config;
}

function spyLogger(): { logger: Logger; warns: string[] } {
  const warns: string[] = [];
  const noop = (): void => undefined;
  return {
    logger: {
      debug: noop,
      info: noop,
      warn: (m: string, _meta?: LogMeta) => {
        warns.push(m);
      },
      error: noop,
    },
    warns,
  };
}

describe("createSessionStore", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function tmp(): Promise<string> {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-factory-"));
    return dir;
  }

  it("returns an in-memory store when persistence is disabled", async () => {
    const store = await createSessionStore(configWith("/should/not/be/used", false), spyLogger().logger);
    expect(store).toBeInstanceOf(InMemorySessionStore);
  });

  it("opens the persistent store in the save dir by default", async () => {
    const base = await tmp();
    const saveDir = path.join(base, "sessions");
    const store = await createSessionStore(configWith(saveDir), spyLogger().logger);
    // SQLite when the runtime provides node:sqlite, JSON fallback otherwise —
    // both are valid persistent backends and both must round-trip.
    expect(store).toBeInstanceOf(SQLITE_AVAILABLE ? SqliteSessionStore : JsonSessionStore);
    const meta = await store.create("default", "via factory");
    expect((await store.get(meta.id))?.title).toBe("via factory");
    if (store instanceof SqliteSessionStore) store.close();
  });

  it("falls back to the JSON store when node:sqlite cannot be loaded", async () => {
    const base = await tmp();
    const { logger, warns } = spyLogger();
    const store = await createSessionStore(configWith(base), logger, {
      sqliteLoader: async () => {
        throw new Error("simulated: node:sqlite unavailable on this Node version");
      },
    });
    expect(store).toBeInstanceOf(JsonSessionStore);
    expect(warns.some((w) => w.includes("falling back to JSON"))).toBe(true);
    // The fallback store must be fully usable.
    const meta = await store.create("default");
    await store.appendMessages(meta.id, [{ role: "user", content: "fallback works" }]);
    expect((await store.get(meta.id))?.messageCount).toBe(1);
  });

  it("falls back to in-memory when the session directory cannot be created", async () => {
    const base = await tmp();
    const blocker = path.join(base, "blocker");
    await writeFile(blocker, "i am a file", "utf8");
    const { logger, warns } = spyLogger();
    // saveDir nested under a regular file → mkdir must fail on every platform.
    const store = await createSessionStore(configWith(path.join(blocker, "sessions")), logger);
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(warns.some((w) => w.includes("in-memory"))).toBe(true);
  });

  it.skipIf(!SQLITE_AVAILABLE)(
    "creates the database file inside the resolved save dir",
    async () => {
      const base = await tmp();
      const saveDir = path.join(base, "nested", "deeper");
      const store = await createSessionStore(configWith(saveDir), spyLogger().logger);
      expect(store).toBeInstanceOf(SqliteSessionStore);
      const { stat } = await import("node:fs/promises");
      const st = await stat(path.join(saveDir, SESSION_DB_FILENAME));
      expect(st.isFile()).toBe(true);
      (store as SqliteSessionStore).close();
    },
  );
});
