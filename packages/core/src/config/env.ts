/**
 * Environment-variable layer of the configuration system.
 *
 * Two sources are combined:
 * 1. `~/.ultracode/.env` — parsed by a tiny dependency-free parser
 *    ({@link parseDotEnv}); real process environment variables win over it.
 * 2. The (effective) environment, mapped onto the config tree:
 *    - `MISTRAL_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
 *      → `providers.apiKeys.*` (in-memory only, never persisted),
 *    - `ULTRACODE_DEBUG`, `ULTRACODE_THEME`, `ULTRACODE_PROVIDER`,
 *      `ULTRACODE_MODEL` shortcuts,
 *    - generic `ULTRACODE_<SECTION>__<KEY>` (double underscore = path
 *      separator, single underscores inside a segment map to camelCase).
 */

import { DEFAULT_CONFIG, ENV_PREFIX } from "ultracode-shared";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import type { ConfigOverlay, WarnFn } from "./mapping.js";
import { CONFIG_SPEC, camelizeKey, DANGEROUS_KEYS, type SpecNode } from "./spec.js";

/**
 * Minimal `.env` parser (no dependency): `KEY=VALUE` lines, `#` comments,
 * optional `export ` prefix, single/double quotes (double quotes interpret
 * `\n`, `\r`, `\t`, `\\`), tolerant towards `\r\n` line endings and blank
 * lines. Malformed lines are skipped silently — a `.env` file must never make
 * startup fail.
 */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trimStart();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replace(/\\(.)/g, (_m, c: string) =>
          c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
        );
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      // Unquoted: strip trailing inline comment (` # …`).
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trimEnd();
    }
    if (DANGEROUS_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Provider API key variables mapped into `providers.apiKeys` — derived from
 * the declarative provider catalog so this mapping cannot drift from the
 * factory's key requirements.
 */
const API_KEY_VARS: ReadonlyArray<readonly [string, string]> = Object.values(
  PROVIDER_CATALOG,
).flatMap((d) => (d.keyed && d.apiKeyEnvVar ? [[d.apiKeyEnvVar, d.id] as const] : []));

/** Parses common boolean spellings; returns `undefined` when not recognised. */
function parseBool(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

/** Reads a value from `DEFAULT_CONFIG` along a camelCase path (or `undefined`). */
function defaultAtPath(segments: string[]): unknown {
  let cur: unknown = DEFAULT_CONFIG;
  for (const seg of segments) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Walks the spec to verify the path addresses a known config slot. */
function specAllowsPath(segments: string[]): boolean {
  let node: SpecNode = CONFIG_SPEC;
  for (const seg of segments) {
    if (node.kind === "value") return false;
    if (node.kind === "arrayOfObjects") return false;
    const child: SpecNode | undefined = node.keys[seg];
    if (child !== undefined) {
      node = child;
    } else if (node.open !== undefined) {
      node = node.openValue ?? { kind: "value" };
    } else {
      return false;
    }
  }
  return node.kind === "value";
}

/** Coerces a raw env string based on the type of the default at that path. */
function coerceEnvValue(raw: string, segments: string[], warn: WarnFn, source: string): unknown {
  const def = defaultAtPath(segments);
  if (typeof def === "boolean") {
    const b = parseBool(raw);
    if (b === undefined) {
      warn(`Ignoring ${source}: "${raw}" is not a boolean`);
      return undefined;
    }
    return b;
  }
  if (typeof def === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      warn(`Ignoring ${source}: "${raw}" is not a number`);
      return undefined;
    }
    return n;
  }
  if (Array.isArray(def)) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof def === "string" || def === undefined) {
    // Open records (channels, apiKeys, per-tool extras) or string slots:
    // best-effort scalar coercion for unknown slots, plain string otherwise.
    if (def !== undefined) return raw;
    const b = parseBool(raw);
    if (b !== undefined) return b;
    if (raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
    return raw;
  }
  return raw;
}

/** Inserts `value` into the overlay along `segments` (creating objects). */
function setPath(target: Record<string, unknown>, segments: string[], value: unknown): void {
  let cur = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] as string;
    if (DANGEROUS_KEYS.has(seg)) return;
    const next = cur[seg];
    if (next === null || typeof next !== "object") {
      const fresh: Record<string, unknown> = {};
      cur[seg] = fresh;
      cur = fresh;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  const last = segments[segments.length - 1] as string;
  if (DANGEROUS_KEYS.has(last)) return;
  cur[last] = value;
}

/**
 * Builds the config overlay contributed by environment variables.
 *
 * @param env - The effective environment (already merged with `.env`
 *   variables; real environment wins).
 * @param warn - Receives a message for every ignored/unparsable variable.
 */
export function envToOverlay(env: Record<string, string>, warn: WarnFn): ConfigOverlay {
  const overlay: Record<string, unknown> = {};

  for (const [varName, provider] of API_KEY_VARS) {
    const v = env[varName];
    if (typeof v === "string" && v.length > 0) {
      setPath(overlay, ["providers", "apiKeys", provider], v);
    }
  }

  const shortcuts: ReadonlyArray<readonly [string, string[]]> = [
    [`${ENV_PREFIX}DEBUG`, ["core", "debug"]],
    [`${ENV_PREFIX}THEME`, ["ui", "theme"]],
    [`${ENV_PREFIX}PROVIDER`, ["core", "activeProvider"]],
    [`${ENV_PREFIX}MODEL`, ["core", "activeModel"]],
  ];
  for (const [varName, segments] of shortcuts) {
    const v = env[varName];
    if (typeof v !== "string" || v.length === 0) continue;
    const coerced = coerceEnvValue(v, segments, warn, varName);
    if (coerced !== undefined) setPath(overlay, segments, coerced);
  }

  const shortcutNames = new Set(shortcuts.map(([n]) => n));
  for (const varName of Object.keys(env)) {
    if (!varName.startsWith(ENV_PREFIX) || shortcutNames.has(varName)) continue;
    const rest = varName.slice(ENV_PREFIX.length);
    if (!rest.includes("__")) {
      warn(`Ignoring unknown environment variable ${varName}`);
      continue;
    }
    const segments = rest
      .split("__")
      .map((seg) => camelizeKey(seg.toLowerCase()))
      .filter((seg) => seg.length > 0);
    if (segments.length < 2 || !specAllowsPath(segments)) {
      warn(`Ignoring environment variable ${varName}: no such config option`);
      continue;
    }
    const v = env[varName];
    if (typeof v !== "string") continue;
    const coerced = coerceEnvValue(v, segments, warn, varName);
    if (coerced !== undefined) setPath(overlay, segments, coerced);
  }

  return overlay as ConfigOverlay;
}
