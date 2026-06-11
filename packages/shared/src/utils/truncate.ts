/**
 * Unicode-safe string truncation.
 *
 * Truncation respects Unicode code points (so a surrogate pair / emoji is never
 * split in half) and appends an ellipsis suffix that is included in the budget.
 */

/** Default suffix appended when a string is truncated. */
export const DEFAULT_TRUNCATE_SUFFIX = "…";

/** Options for {@link truncate}. */
export interface TruncateOptions {
  /** Suffix appended on truncation. Defaults to `"…"`. */
  suffix?: string;
}

/**
 * Truncate `s` so the result is at most `max` code points long.
 *
 * - If `s` already fits, it is returned unchanged.
 * - If `max <= 0`, the empty string is returned.
 * - The `suffix` counts toward `max`; if the suffix alone exceeds `max`, the
 *   suffix itself is code-point-truncated to fit.
 * - Counting and slicing operate on code points (via the string iterator), so
 *   emoji and other astral-plane characters are never cut mid-pair.
 *
 * @param s - input string.
 * @param max - maximum length in Unicode code points.
 * @param options - truncation options.
 */
export function truncate(s: string, max: number, options: TruncateOptions = {}): string {
  if (max <= 0) return "";

  // Fast path: byte/unit length is an upper bound on code-point count, so if it
  // already fits there is no possible truncation. Avoids iterating huge strings.
  if (s.length <= max) return s;

  const suffix = options.suffix ?? DEFAULT_TRUNCATE_SUFFIX;
  const codePoints = Array.from(s);
  if (codePoints.length <= max) return s;

  const suffixPoints = Array.from(suffix);
  // If the suffix cannot fit, truncate the suffix itself.
  if (suffixPoints.length >= max) {
    return suffixPoints.slice(0, max).join("");
  }

  const keep = max - suffixPoints.length;
  return codePoints.slice(0, keep).join("") + suffix;
}
