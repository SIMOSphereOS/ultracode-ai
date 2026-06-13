/**
 * Core-local error subclasses for `core/learning`.
 *
 * Per the cross-cutting error convention, new modules raise their own
 * {@link UltraCodeError} subclasses carrying a stable `code`. The shared
 * package is frozen, so these live here rather than in `ultracode-shared`.
 */

import { UltraCodeError } from "ultracode-shared";
import type { UltraCodeErrorOptions } from "ultracode-shared";

/**
 * Raised when a learning operation cannot proceed: unknown source, corrupt
 * state/checkpoint, or a malformed source library.
 */
export class LearnError extends UltraCodeError {
  /**
   * @param message - Human-readable description.
   * @param options - Optional `cause` / structured `details`.
   */
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("LEARN_ERROR", message, options);
  }
}

/**
 * Raised when a learn run is hard-stopped by the runtime cap. Carries the
 * partial progress in `details` so callers can resume from the checkpoint.
 */
export class LearnCapError extends UltraCodeError {
  /**
   * @param message - Human-readable description.
   * @param options - Optional `cause` / structured `details`.
   */
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("LEARN_CAP_EXCEEDED", message, options);
  }
}
