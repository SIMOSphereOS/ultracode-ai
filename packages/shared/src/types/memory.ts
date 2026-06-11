/**
 * Session/memory contracts.
 *
 * A session is an ordered conversation owned by an agent. All timestamps are
 * ISO-8601 strings (UTC). The {@link ISessionStore} abstracts persistence
 * (SQLite, JSON files, in-memory, …).
 */

import type { ChatMessage } from "./provider.js";

/** Lightweight session header, returned by listings. */
export interface SessionMeta {
  /** Unique session identifier. */
  id: string;
  /** Human-readable title (derived or user-supplied). */
  title: string;
  /** Creation time, ISO-8601 (UTC). */
  createdAt: string;
  /** Last-modification time, ISO-8601 (UTC). */
  updatedAt: string;
  /** Name of the agent that owns the session. */
  agentName: string;
  /** Number of messages currently stored. */
  messageCount: number;
}

/** A full session: its header plus the complete message history. */
export interface SessionRecord extends SessionMeta {
  /** Ordered conversation history. */
  messages: ChatMessage[];
}

/**
 * Persistence boundary for sessions.
 *
 * Contract:
 * - Mutating methods bump `updatedAt` and keep `messageCount` consistent.
 * - `get` resolves `null` for an unknown id (it does not throw).
 * - `delete` resolves `false` when the id did not exist.
 * - Hard storage failures reject with
 *   {@link import("../errors.js").SessionError}.
 */
export interface ISessionStore {
  /** Create a new, empty session and return its header. */
  create(agentName: string, title?: string): Promise<SessionMeta>;
  /** Load a full session by id, or `null` if absent. */
  get(id: string): Promise<SessionRecord | null>;
  /** Append messages to a session, updating its metadata. */
  appendMessages(id: string, msgs: ChatMessage[]): Promise<void>;
  /** List session headers, most-recent first, capped by `limit` when given. */
  list(limit?: number): Promise<SessionMeta[]>;
  /** Delete a session; resolves `true` if it existed. */
  delete(id: string): Promise<boolean>;
  /** Retain only the `maxSessions` most-recent sessions; returns the count removed. */
  prune(maxSessions: number): Promise<number>;
}
