/**
 * Reduce an arbitrary thrown value to a stable, JSON-safe {@link SerializedError}.
 *
 * Handles {@link UltraCodeError} (preserving its `code`), plain `Error`s,
 * string/primitive throws, and structurally error-shaped objects. Never throws.
 */

import type { SerializedError } from "../errors.js";
import { UltraCodeError } from "../errors.js";

/** Type guard for objects that look like an `Error`. */
function isErrorLike(value: unknown): value is { name?: unknown; message?: unknown; stack?: unknown; code?: unknown } {
  return typeof value === "object" && value !== null;
}

/**
 * Convert any caught value into a {@link SerializedError}.
 *
 * @param err - the thrown value (may be anything).
 * @returns a JSON-safe error descriptor with at least `name`, `message`, `code`.
 */
export function serializeError(err: unknown): SerializedError {
  // UltraCodeError already knows how to serialise itself.
  if (err instanceof UltraCodeError) {
    return err.toJSON();
  }

  if (err instanceof Error) {
    const out: SerializedError = {
      name: err.name || "Error",
      message: err.message,
      code:
        typeof (err as unknown as { code?: unknown }).code === "string"
          ? (err as unknown as { code: string }).code
          : "ERROR",
    };
    if (typeof err.stack === "string") out.stack = err.stack;
    return out;
  }

  // String throws: `throw "boom"`.
  if (typeof err === "string") {
    return { name: "Error", message: err, code: "ERROR" };
  }

  // Error-shaped plain objects (e.g. structured-clone survivors).
  if (isErrorLike(err)) {
    const name = typeof err.name === "string" ? err.name : "Error";
    const message =
      typeof err.message === "string" ? err.message : safeStringify(err);
    const out: SerializedError = {
      name,
      message,
      code: typeof err.code === "string" ? err.code : "ERROR",
    };
    if (typeof err.stack === "string") out.stack = err.stack;
    return out;
  }

  // Fallback for numbers, booleans, null, undefined, symbols, bigints.
  return { name: "Error", message: safeStringify(err), code: "ERROR" };
}

/** `JSON.stringify` that degrades gracefully and never throws. */
function safeStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    const s = JSON.stringify(value);
    return s ?? String(value);
  } catch {
    return String(value);
  }
}
