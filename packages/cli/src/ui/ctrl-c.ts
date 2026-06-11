/**
 * Double-press detection for the "press Ctrl+C twice to exit" behaviour.
 * Pure and timer-free, so it is trivially unit-testable.
 */
export class DoublePress {
  private last = Number.NEGATIVE_INFINITY;

  /**
   * @param windowMs - maximum gap between two presses to count as a double
   *   press (default 1500 ms).
   */
  constructor(private readonly windowMs: number = 1500) {}

  /**
   * Record a press.
   *
   * @param now - timestamp in ms (defaults to `Date.now()`).
   * @returns `true` when this press completes a double press.
   */
  press(now: number = Date.now()): boolean {
    const isDouble = now - this.last <= this.windowMs;
    this.last = now;
    return isDouble;
  }
}
