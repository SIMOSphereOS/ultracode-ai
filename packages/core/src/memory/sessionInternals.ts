/**
 * Internal helpers shared by all `ISessionStore` implementations.
 *
 * Not part of the public module surface — import from the concrete stores or
 * the memory `index.ts` instead.
 */

import type { ChatMessage, SessionMeta, SessionRecord } from "@ultracode/shared";

/** Default title for sessions created without an explicit one. */
export const DEFAULT_SESSION_TITLE = "New Session";

/** Current timestamp as an ISO-8601 (UTC) string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Comparator for "most-recent first" listings: `updatedAt` desc, then
 * `createdAt` desc, then `id` asc as a deterministic tie-breaker.
 * ISO-8601 UTC strings compare correctly lexicographically.
 */
export function compareMetaDesc(a: SessionMeta, b: SessionMeta): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Apply a `list(limit)` argument defensively.
 *
 * - `undefined` → all items
 * - `<= 0`, `NaN` → empty list
 * - fractional values are floored
 * - `Infinity` → all items
 */
export function applyListLimit<T>(items: T[], limit?: number): T[] {
  if (limit === undefined) return items;
  if (Number.isNaN(limit)) return [];
  if (!Number.isFinite(limit)) return limit > 0 ? items : [];
  const n = Math.floor(limit);
  return n <= 0 ? [] : items.slice(0, n);
}

/**
 * Select the sessions a `prune(maxSessions)` call must delete.
 *
 * Keeps the `maxSessions` most recently updated sessions. Defensive
 * normalisation: `NaN` and negative values behave like `0` (delete all),
 * `Infinity` deletes nothing, fractional values are floored.
 *
 * @returns The ids to delete, **oldest first**.
 */
export function selectPruneVictims(metas: SessionMeta[], maxSessions: number): string[] {
  let keep: number;
  if (Number.isNaN(maxSessions)) keep = 0;
  else if (maxSessions === Number.POSITIVE_INFINITY) return [];
  else keep = Math.max(0, Math.floor(maxSessions));

  const sortedDesc = [...metas].sort(compareMetaDesc);
  if (sortedDesc.length <= keep) return [];
  return sortedDesc
    .slice(keep)
    .reverse()
    .map((m) => m.id);
}

/** Structural check for a persisted session record (tolerant of extras). */
export function isSessionRecordShape(value: unknown): value is SessionRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    (r["id"] as string).length > 0 &&
    typeof r["title"] === "string" &&
    typeof r["createdAt"] === "string" &&
    typeof r["updatedAt"] === "string" &&
    typeof r["agentName"] === "string" &&
    Array.isArray(r["messages"])
  );
}

/** Extract the meta header from a record, deriving `messageCount` from `messages`. */
export function toMeta(record: SessionRecord): SessionMeta {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    agentName: record.agentName,
    messageCount: record.messages.length,
  };
}

/** Deep-copy messages so stores never share mutable state with callers. */
export function cloneMessages(msgs: ChatMessage[]): ChatMessage[] {
  return structuredClone(msgs);
}
