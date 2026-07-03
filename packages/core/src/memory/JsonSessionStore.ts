/**
 * JSON-file backed {@link ISessionStore}.
 *
 * One JSON file per session inside the configured session directory
 * (`SessionsConfig.saveDir`, `~` expanded via {@link resolveHome}). Writes are
 * atomic (write to a temp file, then rename). Corrupt files are tolerated on
 * read paths: a warning is logged and the file is skipped — never a crash.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChatMessage,
  ISessionStore,
  Logger,
  SessionMeta,
  SessionRecord,
} from "ultracode-shared";
import { generateId, SessionError, serializeError } from "ultracode-shared";

import { resolveHome } from "./paths.js";
import {
  applyListLimit,
  cloneMessages,
  compareMetaDesc,
  DEFAULT_SESSION_TITLE,
  isSessionRecordShape,
  nowIso,
  selectPruneVictims,
  toMeta,
} from "./sessionInternals.js";

/** Ids are used as file names — restrict to a safe, traversal-free charset. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * A lock held longer than this (judged by the lockfile's mtime) is treated as
 * stale — left behind by a crashed process — and forcibly reclaimed. Generous
 * so a slow-but-live writer is never stolen from.
 */
const STALE_LOCK_MS = 30_000;

/** Cancellable async pause. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `true` for fs errors carrying the given `code` (e.g. `"ENOENT"`). */
function hasFsCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === code;
}

/**
 * Windows-only transient lock errors. A file another process is deleting enters
 * a "delete pending" state in which `open(..,"wx")`/`stat` briefly return
 * `EPERM`/`EACCES`/`EBUSY`. These clear within milliseconds and must be retried,
 * otherwise concurrent appends spuriously fail. They are indistinguishable by
 * errno from a *durable* permission error, so retries are bounded by
 * {@link WIN_CONTENTION_BUDGET_MS}: a real durable failure surfaces as a
 * `SessionError` once the budget elapses. On POSIX a durable `EACCES` is a real
 * error and fails fast immediately (the fail-fast guarantee holds there).
 */
function isWindowsTransient(err: unknown): boolean {
  return (
    process.platform === "win32" &&
    (hasFsCode(err, "EPERM") || hasFsCode(err, "EACCES") || hasFsCode(err, "EBUSY"))
  );
}

/** Max time Windows delete-pending contention is retried before failing hard. */
const WIN_CONTENTION_BUDGET_MS = 2000;

/**
 * File-per-session JSON store. Usable standalone and as the fallback chosen
 * by `createSessionStore` when `node:sqlite` is unavailable.
 */
export class JsonSessionStore implements ISessionStore {
  /** Resolved session directory (after `~` expansion). */
  public readonly dir: string;
  private readonly logger: Logger;
  /** Serialises mutating operations to avoid read-modify-write races. */
  private queue: Promise<unknown> = Promise.resolve();
  private dirReady: Promise<void> | null = null;

  /**
   * @param dir - Session directory; a leading `~` is expanded to the home dir.
   * @param logger - Logger for warnings about corrupt or skipped files.
   */
  constructor(dir: string, logger: Logger) {
    this.dir = resolveHome(dir);
    this.logger = logger;
  }

  /** Create a new, empty session and return its header. */
  async create(agentName: string, title?: string): Promise<SessionMeta> {
    return this.withLock(async () => {
      const ts = nowIso();
      const record: SessionRecord = {
        id: generateId("session"),
        title: title ?? DEFAULT_SESSION_TITLE,
        createdAt: ts,
        updatedAt: ts,
        agentName,
        messageCount: 0,
        messages: [],
      };
      await this.writeRecord(record);
      return toMeta(record);
    });
  }

  /** Load a full session by id; `null` for unknown ids or corrupt files. */
  async get(id: string): Promise<SessionRecord | null> {
    if (!SAFE_ID.test(id)) return null;
    const file = this.fileFor(id);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      if (hasFsCode(err, "ENOENT")) return null;
      throw new SessionError(`Failed to read session "${id}"`, {
        cause: err,
        details: { id, file },
      });
    }
    const record = this.parseRecord(raw, file);
    return record ? structuredClone(record) : null;
  }

  /** Append messages, bumping `updatedAt` and `messageCount`. */
  async appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
    // In-process serialisation (`withLock`) only guards a single store
    // instance. A cross-instance/cross-process file lock around the
    // read-modify-write closes the lost-update race when several stores point
    // at the same session directory.
    await this.withLock(() =>
      this.withSessionLock(id, async () => {
        if (!SAFE_ID.test(id)) {
          throw new SessionError(`Cannot append messages: unknown session "${id}"`, {
            details: { id },
          });
        }
        const file = this.fileFor(id);
        let raw: string;
        try {
          raw = await fs.readFile(file, "utf8");
        } catch (err) {
          if (hasFsCode(err, "ENOENT")) {
            throw new SessionError(`Cannot append messages: unknown session "${id}"`, {
              details: { id },
            });
          }
          throw new SessionError(`Failed to read session "${id}"`, {
            cause: err,
            details: { id, file },
          });
        }
        const record = this.parseRecord(raw, file);
        if (!record) {
          throw new SessionError(`Cannot append messages: session file for "${id}" is corrupt`, {
            details: { id, file },
          });
        }
        record.messages = record.messages.concat(cloneMessages(msgs));
        record.messageCount = record.messages.length;
        record.updatedAt = nowIso();
        await this.writeRecord(record);
      }),
    );
  }

  /** List session headers, most-recent first; corrupt files are skipped. */
  async list(limit?: number): Promise<SessionMeta[]> {
    const records = await this.readAllRecords();
    const metas = records.map(toMeta).sort(compareMetaDesc);
    return applyListLimit(metas, limit);
  }

  /** Delete a session file; `true` if it existed. */
  async delete(id: string): Promise<boolean> {
    return this.withLock(() => this.deleteUnlocked(id));
  }

  /** Retain only the `maxSessions` most-recent sessions; returns the count removed. */
  async prune(maxSessions: number): Promise<number> {
    return this.withLock(async () => {
      const records = await this.readAllRecords();
      const victims = selectPruneVictims(records.map(toMeta), maxSessions);
      let removed = 0;
      for (const id of victims) {
        if (await this.deleteUnlocked(id)) removed++;
      }
      return removed;
    });
  }

  /* ----------------------------------------------------------------------
   * Internals
   * -------------------------------------------------------------------- */

  private fileFor(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private lockFileFor(id: string): string {
    return path.join(this.dir, `${id}.json.lock`);
  }

  /**
   * Run `fn` while holding an exclusive on-disk lock for `id`. The lock is a
   * file created with `O_EXCL` (`wx`); contenders retry with backoff. A lock
   * whose mtime is older than {@link STALE_LOCK_MS} is reclaimed (its owner
   * crashed). The lock is always released in `finally`.
   */
  private async withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (!SAFE_ID.test(id)) return fn(); // invalid id: let `fn` produce the error
    await this.ensureDir();
    const lockPath = this.lockFileFor(id);
    await this.acquireLock(lockPath, id);
    try {
      return await fn();
    } finally {
      await fs.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }

  /** Spin until the lock file can be created exclusively (reclaiming stale locks). */
  private async acquireLock(lockPath: string, id: string): Promise<void> {
    let backoff = 2;
    // Tracks the first Windows delete-pending error in a contention streak so
    // those retries can be bounded by WIN_CONTENTION_BUDGET_MS (a durable
    // permission failure on Windows then surfaces as SessionError). Reset on any
    // non-transient outcome (normal EEXIST contention or a successful stat).
    let firstWinTransientAt: number | null = null;
    const noteWinTransient = (err: unknown, verb: string): void => {
      firstWinTransientAt ??= Date.now();
      if (Date.now() - firstWinTransientAt > WIN_CONTENTION_BUDGET_MS) {
        throw new SessionError(`Failed to ${verb} session lock for "${id}"`, {
          cause: err,
          details: { id, lockPath },
        });
      }
    };
    // Generous budget rather than an artificial wall-clock timeout: with
    // backoff capped at ~50ms this tolerates very long legitimate critical
    // sections before declaring a peer dead.
    for (let attempt = 0; ; attempt += 1) {
      try {
        const handle = await fs.open(lockPath, "wx");
        await handle.close();
        return;
      } catch (err) {
        if (hasFsCode(err, "EEXIST")) {
          // Normal contention: a peer holds the lock. Do NOT reset the transient
          // budget here — only a *successful* stat below proves the lock is
          // healthy. Resetting on EEXIST would let a persistent Windows stat
          // failure (EACCES) spin forever, since every loop re-hits EEXIST first.
        } else if (isWindowsTransient(err)) {
          noteWinTransient(err, "acquire");
          await delay(backoff);
          backoff = Math.min(backoff * 2, 50);
          continue;
        } else {
          throw new SessionError(`Failed to acquire session lock for "${id}"`, {
            cause: err,
            details: { id, lockPath },
          });
        }
      }
      // Lock exists — reclaim it if stale, otherwise wait and retry.
      try {
        const stat = await fs.stat(lockPath);
        firstWinTransientAt = null;
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.rm(lockPath, { force: true }).catch(() => undefined);
          continue; // try to take it immediately
        }
      } catch (err) {
        if (hasFsCode(err, "ENOENT")) continue; // released between calls — retry now
        // Transient Windows delete-pending contention is retried within budget.
        if (isWindowsTransient(err)) {
          noteWinTransient(err, "inspect");
          await delay(backoff);
          backoff = Math.min(backoff * 2, 50);
          continue;
        }
        // Any other stat failure (e.g. durable EACCES on POSIX) is fatal:
        // stale-reclaim is unreachable, so retrying would spin forever.
        throw new SessionError(`Failed to inspect session lock for "${id}"`, {
          cause: err,
          details: { id, lockPath },
        });
      }
      await delay(backoff);
      backoff = Math.min(backoff * 2, 50);
    }
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private ensureDir(): Promise<void> {
    this.dirReady ??= fs.mkdir(this.dir, { recursive: true }).then(
      () => undefined,
      (err: unknown) => {
        this.dirReady = null;
        throw new SessionError(`Failed to create session directory "${this.dir}"`, {
          cause: err,
          details: { dir: this.dir },
        });
      },
    );
    return this.dirReady;
  }

  /** Parse + validate a session file; warn and return `null` when corrupt. */
  private parseRecord(raw: string, file: string): SessionRecord | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isSessionRecordShape(parsed)) {
        this.logger.warn("Skipping session file with unexpected shape", { file });
        return null;
      }
      // Normalise messageCount from the actual message list.
      parsed.messageCount = parsed.messages.length;
      return parsed;
    } catch (err) {
      this.logger.warn("Skipping corrupt session file", {
        file,
        error: serializeError(err),
      });
      return null;
    }
  }

  /** Atomic write: temp file in the same directory, then rename. */
  private async writeRecord(record: SessionRecord): Promise<void> {
    await this.ensureDir();
    const file = this.fileFor(record.id);
    const tmp = `${file}.${process.pid.toString(36)}-${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(record), "utf8");
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw new SessionError(`Failed to write session "${record.id}"`, {
        cause: err,
        details: { id: record.id, file },
      });
    }
  }

  private async deleteUnlocked(id: string): Promise<boolean> {
    if (!SAFE_ID.test(id)) return false;
    try {
      await fs.unlink(this.fileFor(id));
      return true;
    } catch (err) {
      if (hasFsCode(err, "ENOENT")) return false;
      throw new SessionError(`Failed to delete session "${id}"`, {
        cause: err,
        details: { id },
      });
    }
  }

  /** Read every parseable `*.json` session file in the directory. */
  private async readAllRecords(): Promise<SessionRecord[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch (err) {
      if (hasFsCode(err, "ENOENT")) return [];
      throw new SessionError(`Failed to read session directory "${this.dir}"`, {
        cause: err,
        details: { dir: this.dir },
      });
    }
    const records: SessionRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(this.dir, name);
      let raw: string;
      try {
        raw = await fs.readFile(file, "utf8");
      } catch (err) {
        if (hasFsCode(err, "ENOENT")) continue; // deleted concurrently
        this.logger.warn("Skipping unreadable session file", {
          file,
          error: serializeError(err),
        });
        continue;
      }
      const record = this.parseRecord(raw, file);
      if (record) records.push(record);
    }
    return records;
  }
}
