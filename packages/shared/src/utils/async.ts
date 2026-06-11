/**
 * Async helpers: cancellable {@link sleep}.
 */

/**
 * Resolve after `ms` milliseconds, with optional cancellation.
 *
 * - If `signal` is already aborted, rejects immediately with the signal's
 *   `reason` (or an `AbortError` if none).
 * - If `signal` aborts before the timer fires, the timer is cleared and the
 *   promise rejects with the abort reason.
 * - Negative or non-finite `ms` is clamped to `0`.
 *
 * @param ms - delay in milliseconds.
 * @param signal - optional cancellation signal.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    let onAbort: (() => void) | undefined;

    const timer = setTimeout(() => {
      if (signal !== undefined && onAbort !== undefined) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, delay);

    if (signal !== undefined) {
      onAbort = (): void => {
        clearTimeout(timer);
        reject(abortReason(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Extract a rejection reason from an aborted signal. */
function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  return new DOMException("The operation was aborted.", "AbortError");
}
