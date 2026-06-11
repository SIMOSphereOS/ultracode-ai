/**
 * Object utilities: plain-object detection and a prototype-pollution-safe deep
 * merge used to layer configuration (project over user over defaults).
 */

/** Keys that must never be assigned during a merge (prototype-pollution guard). */
const FORBIDDEN_KEYS = new Set<string>(["__proto__", "constructor", "prototype"]);

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
  // Non-mergeable override (primitive, array, class instance) wins outright,
  // unless it is `undefined` (treated as "no override").
  if (override === undefined) return clonePlain(base) as T;
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return clonePlain(override) as T;
  }

  const out: Record<string, unknown> = clonePlain(base) as Record<string, unknown>;

  for (const key of Object.keys(override)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(override, key)) continue;

    const overrideVal = override[key];
    if (overrideVal === undefined) continue; // skip, keep base

    const baseVal = out[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      out[key] = deepMerge(baseVal, overrideVal);
    } else {
      out[key] = clonePlain(overrideVal);
    }
  }

  return out as T;
}

/**
 * Shallow-recursive clone that copies plain objects and arrays while leaving
 * other values (primitives, class instances) by reference. Drops forbidden keys.
 */
function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clonePlain(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = clonePlain((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}
