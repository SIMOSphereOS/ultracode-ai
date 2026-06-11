/**
 * `core/memory` — session persistence.
 *
 * Public surface:
 * - {@link createSessionStore} — factory selecting the best available backend
 *   (SQLite → JSON files → in-memory).
 * - {@link SqliteSessionStore}, {@link JsonSessionStore},
 *   {@link InMemorySessionStore} — the concrete `ISessionStore` backends.
 * - {@link MetadataCache} — generic TTL/LRU cache for project metadata.
 * - {@link resolveHome} — `~` expansion helper.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { serializeError } from "@ultracode/shared";
import type { ISessionStore, Logger, UltraCodeConfig } from "@ultracode/shared";

import { InMemorySessionStore } from "./InMemorySessionStore.js";
import { JsonSessionStore } from "./JsonSessionStore.js";
import { SqliteSessionStore } from "./SqliteSessionStore.js";
import type { SqliteLoader } from "./SqliteSessionStore.js";
import { resolveHome } from "./paths.js";

export { InMemorySessionStore } from "./InMemorySessionStore.js";
export { JsonSessionStore } from "./JsonSessionStore.js";
export { SqliteSessionStore, defaultSqliteLoader } from "./SqliteSessionStore.js";
export type {
  SqliteLoader,
  SqliteModuleLike,
  SqliteDatabaseLike,
  SqliteStatementLike,
} from "./SqliteSessionStore.js";
export { MetadataCache } from "./MetadataCache.js";
export type { MetadataCacheOptions } from "./MetadataCache.js";
export { resolveHome } from "./paths.js";

/** File name of the SQLite database inside the session directory. */
export const SESSION_DB_FILENAME = "sessions.db";

/**
 * Test-only hooks for {@link createSessionStore}. Production callers use the
 * two-argument form.
 */
export interface CreateSessionStoreInternals {
  /** Override the `node:sqlite` loader (e.g. to simulate an older Node). */
  sqliteLoader?: SqliteLoader;
}

/**
 * Create the best available {@link ISessionStore} for the given config.
 *
 * Selection logic:
 * 1. `sessions.enablePersistence === false` → {@link InMemorySessionStore}.
 * 2. Otherwise the session directory (`sessions.saveDir`, `~` expanded) is
 *    created and a {@link SqliteSessionStore} is opened at
 *    `<saveDir>/sessions.db`.
 * 3. If `node:sqlite` is unavailable or the database cannot be opened, a
 *    warning is logged and a {@link JsonSessionStore} in the same directory
 *    is used instead.
 * 4. If even the directory cannot be created, a warning is logged and the
 *    in-memory store is returned — the factory never throws for degraded
 *    environments.
 *
 * @param config - Resolved UltraCode configuration.
 * @param logger - Logger for fallback warnings.
 * @param internals - Test-only dependency overrides.
 */
export async function createSessionStore(
  config: UltraCodeConfig,
  logger: Logger,
  internals: CreateSessionStoreInternals = {},
): Promise<ISessionStore> {
  const sessions = config.sessions;
  if (!sessions.enablePersistence) {
    logger.debug("Session persistence disabled; using in-memory store");
    return new InMemorySessionStore();
  }

  const dir = resolveHome(sessions.saveDir);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    logger.warn("Session directory is not writable; falling back to in-memory store", {
      dir,
      error: serializeError(err),
    });
    return new InMemorySessionStore();
  }

  const dbPath = path.join(dir, SESSION_DB_FILENAME);
  try {
    return await SqliteSessionStore.open(dbPath, logger, internals.sqliteLoader);
  } catch (err) {
    logger.warn("node:sqlite unavailable; falling back to JSON session store", {
      dbPath,
      error: serializeError(err),
    });
    return new JsonSessionStore(dir, logger);
  }
}
