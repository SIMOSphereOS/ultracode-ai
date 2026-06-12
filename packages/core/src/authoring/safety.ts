/**
 * Offline safety checks for generated skills and agents.
 *
 * Two concerns:
 * 1. **Harmful instructions** — generated skill/agent text must not contain
 *    jailbreak/exfiltration/destructive phrases. Detection is conservative and
 *    deterministic (substring matching over a normalised string).
 * 2. **Permission escalation** — a generated agent's `enabledTools` must be a
 *    subset of an allow-listed tool set; it must never grant tools it was not
 *    permitted to use.
 */

import type { AgentDefinition } from "@ultracode/shared";

import { FORBIDDEN_PHRASES } from "./defaults.js";

export { FORBIDDEN_PHRASES };

/** Normalise text for phrase matching (lower-case, collapse whitespace). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Return every forbidden phrase found in `text`. Empty array means clean.
 *
 * @param text - Arbitrary text to scan.
 */
export function findForbiddenPhrases(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const hay = normalize(text);
  const hits: string[] = [];
  for (const phrase of FORBIDDEN_PHRASES) {
    if (hay.includes(phrase)) hits.push(phrase);
  }
  return hits;
}

/** Result of an agent permission-escalation check. */
export interface PermissionCheck {
  /** `true` when the agent stays within the allowed tool set. */
  ok: boolean;
  /** Tools the agent tried to enable that are not in the allowed set. */
  escalated: string[];
}

/**
 * Verify that an agent's `enabledTools` does not escalate beyond `allowedTools`.
 *
 * An empty/undefined `enabledTools` is always safe (the agent inherits the
 * default, narrower-or-equal set). When `enabledTools` is present, every entry
 * must appear in `allowedTools`.
 *
 * @param agent - The agent definition under review.
 * @param allowedTools - The permitted tool universe for this author.
 */
export function checkNoEscalation(
  agent: Pick<AgentDefinition, "enabledTools">,
  allowedTools: readonly string[],
): PermissionCheck {
  const allowed = new Set(allowedTools);
  const requested = agent.enabledTools ?? [];
  const escalated = requested.filter((t) => !allowed.has(t));
  return { ok: escalated.length === 0, escalated };
}

/**
 * Filter a desired tool list down to the allowed set, preserving order and
 * dropping duplicates. Used when *constructing* an agent so it can never be
 * built with escalated permissions in the first place.
 *
 * @param desired - The tools the caller would like to enable.
 * @param allowedTools - The permitted tool universe.
 */
export function clampToAllowed(
  desired: readonly string[],
  allowedTools: readonly string[],
): string[] {
  const allowed = new Set(allowedTools);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of desired) {
    if (allowed.has(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
