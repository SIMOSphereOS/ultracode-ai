/**
 * Core-local error type for the authoring subsystem.
 *
 * The shared 1.0 error hierarchy is frozen, so the authoring module defines its
 * own {@link UltraCodeError} subclass with a dedicated `code`. It is used for
 * registry/persistence failures and malformed authoring input — never thrown
 * across the frozen contract boundary.
 */

import { UltraCodeError } from "ultracode-shared";
import type { UltraCodeErrorOptions } from "ultracode-shared";

/** A skill/agent authoring or registry operation failed. */
export class AuthoringError extends UltraCodeError {
  /**
   * @param message - Human-readable description.
   * @param options - Optional `cause`/`details`.
   */
  constructor(message: string, options: UltraCodeErrorOptions = {}) {
    super("AUTHORING_ERROR", message, options);
  }
}
