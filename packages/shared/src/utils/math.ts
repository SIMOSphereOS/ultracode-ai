/**
 * Numeric helpers.
 */

/**
 * Constrain `value` to the inclusive range `[min, max]`.
 *
 * - `NaN` input returns `min` (defensive default).
 * - If `min > max`, the bounds are swapped so the function is total.
 *
 * @param value - the value to clamp.
 * @param min - lower bound.
 * @param max - upper bound.
 */
export function clamp(value: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number.isNaN(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}
