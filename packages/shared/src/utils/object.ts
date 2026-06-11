/**
 * Object utilities: plain-object detection and a prototype-pollution-safe deep
 * merge used to layer configuration (project over user over defaults).
 */

import { ValidationError } from "../errors.js";

/** Keys that must never be assigned during a merge (prototype-pollution guard). */
const FORBIDDEN_KEYS = new Set<string>(["__proto__", "constructor", "prototype"]);

/**
 * Maximum nesting depth `deepMerge`/`clonePlain` will recurse before failing
 * fast with a {@link ValidationError}. Guards against stack-overflow crashes
 * from pathologically deep (or cyclic) override trees.
 */
export const MAX_MERGE_DEPTH = 100;

/**
 * Whether `value` is a "plain" object: a non-null object whose prototype is
 * `Object.prototype` or `null`. Arrays, class instances, `Date`, `Map`, etc.
 * are rejected.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively merge `override` onto `base`, returning a new object.
 *
 * Semantics:
 * - Plain objects are merged key-by-key, recursively.
 * - **Arrays are replaced wholesale**, never concatenated or element-merged.
 * - `undefined` values in `override` are skipped (they do not erase `base`).
 *   `null` values *do* overwrite (an explicit "set to null").
 * - Non-plain objects (class instances, `Date`, `Map`, …) in `override` replace
 *   the corresponding `base` value wholesale.
 * - **Prototype pollution is prevented**: keys `__proto__`, `constructor` and
 *   `prototype` are never copied, and only own-enumerable string keys are read.
 *
 * Neither input is mutated. The result is a fresh, null-prototype-free object
 * tree for the merged portions.
 *
 * @typeParam T - the (resolved) shape of the base object.
 */
export function deepMerge<T>(base: T, override: unknown): T {
  return deepMergeAt(base, override, 0);
}

/** Recursive worker for {@link deepMerge}; tracks nesting `depth`. */
function deepMergeAt<T>(base: T, override: unknown, depth: number): T {
  if (depth > MAX_MERGE_DEPTH) {
    throw new ValidationError(
      `deepMerge exceeded maximum nesting depth of ${MAX_MERGE_DEPTH} ` +
        `(cyclic or pathologically deep override)`,
      { details: { maxDepth: MAX_MERGE_DEPTH } },
    );
  }

  // Non-mergeable override (primitive, array, class instance) wins outright,
  // unless it is `undefined` (treated as "no override").
  if (override === undefined) return clonePlainAt(base, depth, new WeakSet()) as T;
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return clonePlainAt(override, depth, new WeakSet()) as T;
  }

  const out: Record<string, unknown> = clonePlainAt(base, depth, new WeakSet()) as Record<
    string,
    unknown
  >;

  for (const key of Object.keys(override)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(override, key)) continue;

    const overrideVal = override[key];
    if (overrideVal === undefined) continue; // skip, keep base

    const baseVal = out[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      out[key] = deepMergeAt(baseVal, overrideVal, depth + 1);
    } else {
      out[key] = clonePlainAt(overrideVal, depth + 1, new WeakSet());
    }
  }

  return out as T;
}

/**
 * Shallow-recursive clone that copies plain objects and arrays while leaving
 * other values (primitives, class instances) by reference. Drops forbidden keys.
 * Tracks nesting `depth` and the chain of `seen` containers (cycle guard).
 *
 * Cyclic references and pathologically deep trees are rejected with a
 * {@link ValidationError} rather than crashing the stack.
 */
function clonePlainAt<T>(value: T, depth: number, seen: WeakSet<object>): T {
  if (depth > MAX_MERGE_DEPTH) {
    throw new ValidationError(
      `deepMerge exceeded maximum nesting depth of ${MAX_MERGE_DEPTH} ` +
        `(cyclic or pathologically deep override)`,
      { details: { maxDepth: MAX_MERGE_DEPTH } },
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new ValidationError("deepMerge detected a circular reference", {
        details: { kind: "array" },
      });
    }
    seen.add(value);
    const cloned = value.map((item) => clonePlainAt(item, depth + 1, seen)) as unknown as T;
    seen.delete(value);
    return cloned;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) {
      throw new ValidationError("deepMerge detected a circular reference", {
        details: { kind: "object" },
      });
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = clonePlainAt((value as Record<string, unknown>)[key], depth + 1, seen);
    }
    seen.delete(value);
    return out as T;
  }
  return value;
}
