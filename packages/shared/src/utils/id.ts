/**
 * Identifier generation.
 */

import { randomUUID } from "node:crypto";

/**
 * Generate a unique identifier backed by `crypto.randomUUID()`.
 *
 * - Without a prefix: returns the bare UUID (e.g. `"f47ac10b-58cc-…"`).
 * - With a prefix: returns `"<prefix>_<uuid>"` (e.g. `"sess_f47ac10b-…"`).
 *
 * @param prefix - optional namespace prefix (no trailing separator needed).
 */
export function generateId(prefix?: string): string {
  const uuid = randomUUID();
  return prefix !== undefined && prefix.length > 0 ? `${prefix}_${uuid}` : uuid;
}
