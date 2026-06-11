/**
 * Bidirectional mapping between the TOML on-disk representation
 * (snake_case keys, `[tools.<name>]` / `[agents.<name>]` sub-tables,
 * `[[mcp_servers]]`) and the camelCase `UltraCodeConfig` interfaces.
 *
 * Parsing is tolerant: unknown sections/keys produce a warning callback and
 * are dropped; dangerous keys (`__proto__`, …) are silently discarded.
 * Hard syntax errors raise `ConfigError` with line/column information.
 */

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ConfigError, isPlainObject } from "@ultracode/shared";
import type { DeepPartial, UltraCodeConfig } from "@ultracode/shared";
import {
  AGENT_ENTRY_SPEC,
  CONFIG_SPEC,
  DANGEROUS_KEYS,
  PER_TOOL_SPEC,
  camelizeKey,
  snakeifyKey,
  type ObjectSpec,
  type SpecNode,
} from "./spec.js";
import type { ResolvedUltraCodeConfig } from "./schema.js";

/** Callback invoked for every unknown/ignored key. */
export type WarnFn = (message: string) => void;

/** A config overlay produced by one layer (file, env, overrides). */
export type ConfigOverlay = DeepPartial<UltraCodeConfig> & {
  providers?: { apiKeys?: Record<string, string> };
};

/**
 * Parses TOML source text into a plain object.
 *
 * @param source - Raw TOML text (a UTF-8 BOM is tolerated).
 * @param origin - Human-readable origin (file path) used in error messages.
 * @throws {ConfigError} on syntax errors, with `line`/`column` details when
 *   the parser provides them.
 */
export function parseTomlSource(source: string, origin: string): Record<string, unknown> {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  try {
    const parsed: unknown = parseToml(text);
    return isPlainObject(parsed) ? parsed : {};
  } catch (cause) {
    const err = cause as { message?: string; line?: number; column?: number };
    const line = typeof err.line === "number" ? err.line : undefined;
    const column = typeof err.column === "number" ? err.column : undefined;
    const where = line !== undefined ? ` (line ${line}${column !== undefined ? `, column ${column}` : ""})` : "";
    throw new ConfigError(
      `Invalid TOML in ${origin}${where}: ${err.message ?? String(cause)}`,
      { cause, details: { origin, line, column } },
    );
  }
}

/** True when the TOML date wrapper or another non-plain object should pass as a leaf. */
function sanitizeLeaf(valueIn: unknown): unknown {
  if (Array.isArray(valueIn)) return valueIn.map((v) => sanitizeLeaf(v));
  if (isPlainObject(valueIn)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(valueIn)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      out[key] = sanitizeLeaf(valueIn[key]);
    }
    return out;
  }
  return valueIn;
}

/** Maps one node according to its spec, camelising keys and warning on unknowns. */
function mapNode(input: unknown, spec: SpecNode, pathStr: string, warn: WarnFn): unknown {
  if (spec.kind === "value") return sanitizeLeaf(input);

  if (spec.kind === "arrayOfObjects") {
    if (!Array.isArray(input)) {
      // Type errors are caught later by the schema; map best-effort.
      return sanitizeLeaf(input);
    }
    return input.map((item, i) =>
      isPlainObject(item) ? mapNode(item, spec.item, `${pathStr}[${i}]`, warn) : sanitizeLeaf(item),
    );
  }

  if (!isPlainObject(input)) return sanitizeLeaf(input);

  const out: Record<string, unknown> = {};
  for (const rawKey of Object.keys(input)) {
    if (DANGEROUS_KEYS.has(rawKey)) continue;
    const camel = camelizeKey(rawKey);
    if (DANGEROUS_KEYS.has(camel)) continue;
    const childPath = pathStr === "" ? rawKey : `${pathStr}.${rawKey}`;
    const childSpec = spec.keys[camel];
    if (childSpec !== undefined) {
      out[camel] = mapNode(input[rawKey], childSpec, childPath, warn);
    } else if (spec.open === "verbatim") {
      out[rawKey] = mapNode(input[rawKey], spec.openValue ?? { kind: "value" }, childPath, warn);
    } else if (spec.open === "camel") {
      out[camel] = mapNode(input[rawKey], spec.openValue ?? { kind: "value" }, childPath, warn);
    } else {
      warn(`Unknown config key "${childPath}" — ignored`);
    }
  }
  return out;
}

/** Matches `<provider>_api_key` keys inside `[providers]`. */
const PROVIDER_API_KEY_RE = /^([a-z0-9-]+)_api_key$/i;

/**
 * Converts a parsed TOML document into a camelCase config overlay.
 *
 * Handles the structural TOML idioms:
 * - `[tools.<name>]` sub-tables → `tools.perTool.<name>`
 * - `[agents.<name>]` sub-tables → `agents.agents.<name>`
 * - `[[mcp_servers]]` → `mcpServers`
 * - `[session]` is accepted as an alias for `[sessions]` (the docs use both)
 * - `<provider>_api_key` under `[providers]` → in-memory `providers.apiKeys`
 *
 * Unknown sections/keys are reported via `warn` and dropped.
 */
export function tomlToOverlay(raw: Record<string, unknown>, warn: WarnFn): ConfigOverlay {
  const doc: Record<string, unknown> = {};

  for (const sectionKey of Object.keys(raw)) {
    if (DANGEROUS_KEYS.has(sectionKey)) continue;
    const valueIn = raw[sectionKey];

    if (sectionKey === "mcp_servers") {
      doc["mcpServers"] = valueIn;
      continue;
    }
    // The documentation uses `[session.compaction]` while the contract section
    // is `[sessions]` — accept the singular form as an alias.
    if (sectionKey === "session" && isPlainObject(valueIn)) {
      const existing = doc["sessions"];
      doc["sessions"] = isPlainObject(existing) ? { ...existing, ...valueIn } : { ...valueIn };
      continue;
    }
    if (sectionKey === "sessions" && isPlainObject(valueIn)) {
      const existing = doc["sessions"];
      doc["sessions"] = isPlainObject(existing) ? { ...valueIn, ...existing } : { ...valueIn };
      continue;
    }
    if (sectionKey === "tools" && isPlainObject(valueIn)) {
      const tools: Record<string, unknown> = {};
      const perTool: Record<string, unknown> = {};
      for (const k of Object.keys(valueIn)) {
        if (DANGEROUS_KEYS.has(k)) continue;
        const v = valueIn[k];
        if (k === "disabled" || k === "enabled" || k === "per_tool" || k === "perTool") {
          tools[k] = v;
        } else if (isPlainObject(v)) {
          perTool[k] = v; // `[tools.<name>]` — tool names stay verbatim
        } else {
          tools[k] = v; // unknown scalar → warned by the spec walk
        }
      }
      if (Object.keys(perTool).length > 0) {
        const existing = tools["per_tool"] ?? tools["perTool"];
        delete tools["per_tool"];
        delete tools["perTool"];
        tools["perTool"] = isPlainObject(existing) ? { ...existing, ...perTool } : perTool;
      }
      doc["tools"] = tools;
      continue;
    }
    if (sectionKey === "agents" && isPlainObject(valueIn)) {
      const agents: Record<string, unknown> = {};
      const entries: Record<string, unknown> = {};
      for (const k of Object.keys(valueIn)) {
        if (DANGEROUS_KEYS.has(k)) continue;
        const v = valueIn[k];
        if (k === "default" || k === "agents") {
          agents[k] = v;
        } else if (isPlainObject(v)) {
          entries[k] = v; // `[agents.<name>]` — agent names stay verbatim
        } else {
          agents[k] = v;
        }
      }
      if (Object.keys(entries).length > 0) {
        const existing = agents["agents"];
        agents["agents"] = isPlainObject(existing) ? { ...existing, ...entries } : entries;
      }
      doc["agents"] = agents;
      continue;
    }
    if (sectionKey === "providers" && isPlainObject(valueIn)) {
      const providers: Record<string, unknown> = {};
      const apiKeys: Record<string, string> = {};
      for (const k of Object.keys(valueIn)) {
        if (DANGEROUS_KEYS.has(k)) continue;
        const m = PROVIDER_API_KEY_RE.exec(k);
        const v = valueIn[k];
        if (m !== null && typeof v === "string") {
          apiKeys[(m[1] as string).toLowerCase()] = v;
        } else {
          providers[k] = v;
        }
      }
      if (Object.keys(apiKeys).length > 0) {
        const existing = providers["api_keys"] ?? providers["apiKeys"];
        delete providers["api_keys"];
        delete providers["apiKeys"];
        providers["apiKeys"] = isPlainObject(existing) ? { ...existing, ...apiKeys } : apiKeys;
      }
      doc["providers"] = providers;
      continue;
    }
    doc[sectionKey] = valueIn;
  }

  return mapNode(doc, CONFIG_SPEC, "", warn) as ConfigOverlay;
}

/** Snakeifies the keys of one node according to its spec (inverse of mapNode). */
function unmapNode(input: unknown, spec: SpecNode): unknown {
  if (spec.kind === "value") return input;
  if (spec.kind === "arrayOfObjects") {
    if (!Array.isArray(input)) return input;
    return input.map((item) => (isPlainObject(item) ? unmapNode(item, spec.item) : item));
  }
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const v = input[key];
    if (v === undefined) continue;
    const childSpec = spec.keys[key];
    if (childSpec !== undefined) {
      out[snakeifyKey(key)] = unmapNode(v, childSpec);
    } else if (spec.open === "verbatim") {
      out[key] = unmapNode(v, spec.openValue ?? { kind: "value" });
    } else {
      out[snakeifyKey(key)] = unmapNode(v, spec.openValue ?? { kind: "value" });
    }
  }
  return out;
}

/**
 * Serialises a resolved config to its TOML text form.
 *
 * Structure follows the documented layout: per-tool settings become
 * `[tools.<name>]` tables, agent overrides `[agents.<name>]`, MCP servers
 * `[[mcp_servers]]`. **API keys are never exported** — they live only
 * in memory (`providers.apiKeys` is stripped).
 */
export function configToToml(config: ResolvedUltraCodeConfig | UltraCodeConfig): string {
  const clone = structuredClone(config) as unknown as Record<string, unknown>;

  // Never persist secrets.
  const providers = clone["providers"];
  if (isPlainObject(providers)) delete providers["apiKeys"];

  const raw = unmapNode(clone, CONFIG_SPEC) as Record<string, unknown>;

  // Flatten `tools.per_tool.<name>` back to `[tools.<name>]`.
  const tools = raw["tools"];
  if (isPlainObject(tools)) {
    const perTool = tools["per_tool"];
    delete tools["per_tool"];
    if (isPlainObject(perTool)) {
      for (const name of Object.keys(perTool)) {
        if (DANGEROUS_KEYS.has(name)) continue;
        tools[name] = unmapNode(perTool[name], PER_TOOL_SPEC);
      }
    }
  }
  // Flatten `agents.agents.<name>` back to `[agents.<name>]`.
  const agents = raw["agents"];
  if (isPlainObject(agents)) {
    const entries = agents["agents"];
    delete agents["agents"];
    if (isPlainObject(entries)) {
      for (const name of Object.keys(entries)) {
        if (DANGEROUS_KEYS.has(name)) continue;
        agents[name] = unmapNode(entries[name], AGENT_ENTRY_SPEC);
      }
    }
  }
  return stringifyToml(pruneUndefined(raw));
}

/** Removes `undefined` values recursively (smol-toml rejects them). */
function pruneUndefined(input: unknown): never | Record<string, unknown> | unknown {
  if (Array.isArray(input)) return input.filter((v) => v !== undefined).map((v) => pruneUndefined(v));
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    const v = input[key];
    if (v === undefined) continue;
    out[key] = pruneUndefined(v);
  }
  return out;
}
