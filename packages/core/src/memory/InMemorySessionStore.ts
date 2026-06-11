/**
 * Volatile, in-process {@link ISessionStore}.
 *
 * Used when `sessions.enablePersistence` is `false` and as a last-resort
 * fallback. All data is lost when the process exits.
 */

import { SessionError, generateId } from "@ultracode/shared";
import type { ChatMessage, ISessionStore, SessionMeta, SessionRecord } from "@ultracode/shared";

import {
  DEFAULT_SESSION_TITLE,
  applyListLimit,
  cloneMessages,
  compareMetaDesc,
  nowIso,
  selectPruneVictims,
  toMeta,
} from "./sessionInternals.js";

/**
 * Map-backed session store. Returned records are deep copies, so callers can
 * never mutate the store's internal state.
 */
export class InMemorySessionStore implements ISessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  /** Create a new, empty session and return its header. */
  async create(agentName: string, title?: string): Promise<SessionMeta> {
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
    this.sessions.set(record.id, record);
    return toMeta(record);
  }

  /** Load a full session by id, or `null` if absent. */
  async get(id: string): Promise<SessionRecord | null> {
    const record = this.sessions.get(id);
    return record ? structuredClone(record) : null;
  }

  /** Append messages, bumping `updatedAt` and `messageCount`. */
  async appendMessages(id: string, msgs: ChatMessage[]): Promise<void> {
    const record = this.sessions.get(id);
    if (!record) {
      throw new SessionError(`Cannot append messages: unknown session "${id}"`, {
        details: { id },
      });
    }
    record.messages = record.messages.concat(cloneMessages(msgs));
    record.messageCount = record.messages.length;
    record.updatedAt = nowIso();
  }

  /** List session headers, most-recent first. */
  async list(limit?: number): Promise<SessionMeta[]> {
    const metas = [...this.sessions.values()].map(toMeta).sort(compareMetaDesc);
    return applyListLimit(metas, limit);
  }

  /** Delete a session; `true` if it existed. */
  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  /** Retain only the `maxSessions` most-recent sessions; returns the count removed. */
  async prune(maxSessions: number): Promise<number> {
    const metas = [...this.sessions.values()].map(toMeta);
    const victims = selectPruneVictims(metas, maxSessions);
    let removed = 0;
    for (const id of victims) {
      if (this.sessions.delete(id)) removed++;
    }
    return removed;
  }
}
