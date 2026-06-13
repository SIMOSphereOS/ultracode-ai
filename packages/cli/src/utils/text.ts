/**
 * Small, dependency-free text/value helpers used across the CLI:
 * CLI-value parsing, dotted-path access, secret masking, config redaction,
 * plain-text tables and optional ANSI colouring.
 */

import { isPlainObject, truncate } from "ultracode-shared";

/** Maximum rendered width of a single table cell, in characters. */
export const MAX_CELL_WIDTH = 60;

/** Key names whose string values are considered secrets and get masked. */
const SECRET_KEY_RE = /(api[-_]?key|key|token|secret|password|credential)/i;

/**
 * Parse a CLI-supplied value string into a JSON-ish value.
 *
 * `"true"`/`"false"`/`"null"` and numeric literals are converted; strings
 * starting with `[`, `{` or `"` are parsed as JSON (falling back to the raw
 * string on parse failure); everything else stays a plain string.
 */
export function parseCliValue(raw: string): unknown {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (t !== "" && /^-?\d+(\.\d+)?$/.test(t) && Number.isFinite(Number(t))) return Number(t);
  if (t.startsWith("[") || t.startsWith("{") || (t.startsWith('"') && t.endsWith('"') && t.length >= 2)) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Read a value from a nested object via a dotted path (`"core.activeModel"`).
 * Returns `undefined` for unknown paths or non-object intermediates.
 */
export function getAtPath(obj: unknown, dotted: string): unknown {
  if (dotted === "") return undefined;
  let cur: unknown = obj;
  for (const part of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Flatten a nested plain object into `[dottedPath, leafValue]` pairs.
 * Arrays and non-plain objects are treated as leaves.
 */
export function flattenLeaves(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const p = prefix === "" ? key : `${prefix}.${key}`;
    if (isPlainObject(value)) {
      out.push(...flattenLeaves(value as Record<string, unknown>, p));
    } else {
      out.push([p, value]);
    }
  }
  return out;
}

/**
 * Mask a secret for display: at most the first three characters survive,
 * the rest becomes `***`. Unicode-safe (never splits surrogate pairs).
 */
export function maskSecret(value: string): string {
  if (value.length === 0) return "(empty)";
  if (value.length <= 6) return "***";
  return `${Array.from(value).slice(0, 3).join("")}***`;
}

/**
 * Deep-copy a value, masking every string whose *key* looks secret
 * (`key`/`token`/`secret`/`password`/`credential`). Used as the fallback
 * redacted view for `config show` when core does not provide one.
 */
export function redactConfig<T>(value: T): T {
  return redactInner(value, "") as T;
}

function redactInner(value: unknown, key: string): unknown {
  if (typeof value === "string") {
    return SECRET_KEY_RE.test(key) && value.length > 0 ? maskSecret(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactInner(v, key));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactInner(v, k);
    }
    return out;
  }
  return value;
}

/** Unicode-aware character count (code points, not UTF-16 units). */
function charLen(s: string): number {
  return Array.from(s).length;
}

/**
 * Render a simple, ANSI-free, two-space-separated table with a header row and
 * a dashed separator. Cells are flattened to one line and truncated to
 * {@link MAX_CELL_WIDTH} characters (Unicode-safe).
 */
export function formatTable(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  const cols = headers.length;
  const cell = (s: unknown): string =>
    truncate(String(s ?? "").replace(/\r?\n/g, " "), MAX_CELL_WIDTH);
  const all = [headers, ...rows].map((r) =>
    Array.from({ length: cols }, (_, i) => cell(r[i])),
  );
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(...all.map((r) => charLen(r[i] ?? ""))),
  );
  const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - charLen(s)));
  const lines = all.map((r) => r.map((c, i) => pad(c, widths[i] ?? 0)).join("  ").trimEnd());
  lines.splice(1, 0, widths.map((w) => "-".repeat(Math.max(1, w))).join("  ").trimEnd());
  return `${lines.join("\n")}\n`;
}

/**
 * Wrap `s` in an ANSI SGR sequence when `enabled` is true; otherwise return
 * `s` untouched. The CLI only emits ANSI when the target stream is a TTY.
 *
 * @param code - SGR code, e.g. `"31"` for red.
 */
export function paint(s: string, code: string, enabled: boolean): string {
  return enabled ? `\u001B[${code}m${s}\u001B[0m` : s;
}
