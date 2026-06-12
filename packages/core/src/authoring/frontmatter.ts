/**
 * A tiny, dependency-free frontmatter parser/serializer for skill markdown.
 *
 * Skill files look like:
 *
 * ```md
 * ---
 * name: dora-compliance
 * version: 1.0.0
 * triggers:
 *   - DORA
 *   - operational resilience
 * ---
 * # Body markdown…
 * ```
 *
 * We deliberately do **not** add a YAML dependency. The supported subset is:
 * - `key: value` scalar pairs (value trimmed; quotes stripped),
 * - block lists introduced by `key:` followed by `  - item` lines,
 * - inline flow lists `key: [a, b, c]`.
 *
 * The parser is total: malformed input yields `null` (the caller skips/​warns)
 * rather than throwing. Round-tripping through {@link serializeFrontmatter} →
 * {@link parseFrontmatter} preserves all skill fields, including Unicode.
 */

import type { Skill, SkillFrontmatter, SkillStatus } from "./types.js";

/** The `---` fence that delimits a frontmatter block. */
const FENCE = "---";

/** Raw key/value bag produced by the low-level parser. */
type RawBag = Record<string, string | string[]>;

/**
 * Split a skill document into its raw frontmatter bag and markdown body.
 * Returns `null` when there is no well-formed leading frontmatter block.
 *
 * @param source - Full file contents.
 */
export function splitDocument(source: string): { bag: RawBag; body: string } | null {
  if (typeof source !== "string") return null;
  // Normalise newlines so Windows CRLF files parse identically.
  const text = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Allow a UTF-8 BOM and leading blank lines before the opening fence.
  const stripped = text.replace(/^﻿/, "");
  const lines = stripped.split("\n");

  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i += 1;
  if (i >= lines.length || lines[i]!.trim() !== FENCE) return null;
  i += 1; // skip opening fence

  const fmLines: string[] = [];
  let closed = false;
  for (; i < lines.length; i += 1) {
    if (lines[i]!.trim() === FENCE) {
      closed = true;
      i += 1;
      break;
    }
    fmLines.push(lines[i]!);
  }
  if (!closed) return null;

  // Strip leading blank lines after the closing fence and a single trailing
  // newline (the one {@link serializeFrontmatter} appends) so a serialize →
  // parse round-trip is stable.
  const body = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\n$/, "");
  const bag = parseBag(fmLines);
  return { bag, body };
}

/** Parse the inner frontmatter lines into a key→scalar|list bag. */
function parseBag(lines: string[]): RawBag {
  const bag: RawBag = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const raw of lines) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;

    // A block-list item: `  - value` belonging to the previous key.
    const listItem = /^\s+-\s?(.*)$/.exec(raw);
    if (listItem && currentKey !== null) {
      currentList ??= [];
      currentList.push(unquote(listItem[1]!.trim()));
      bag[currentKey] = currentList;
      continue;
    }

    // A `key: value` line.
    const kv = /^([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!.trim();
    currentKey = key;
    currentList = null;

    if (value === "") {
      // Either an empty scalar or the header of a block list (decided by
      // subsequent `- ` lines). Default to empty string; list items upgrade it.
      bag[key] = "";
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      bag[key] = parseInlineList(value);
      continue;
    }
    bag[key] = unquote(value);
  }
  return bag;
}

/** Parse a `[a, b, c]` inline flow list. */
function parseInlineList(value: string): string[] {
  const inner = value.slice(1, -1).trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((s) => unquote(s.trim()))
    .filter((s) => s.length > 0);
}

/** Strip a single layer of matching single/double quotes. */
function unquote(s: string): string {
  if (s.length >= 2) {
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Coerce a bag value to a string scalar. */
function asScalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

/** Coerce a bag value to a string list (scalar → single-element list). */
function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  return v === "" ? [] : [v];
}

/** Valid status values. */
const STATUSES: readonly SkillStatus[] = ["draft", "active", "deprecated"];

/**
 * Parse a full skill document into a {@link Skill}.
 *
 * Returns `null` when the document has no frontmatter or is missing any
 * required field — callers treat that as "corrupt, skip and warn" rather than a
 * thrown error.
 *
 * @param source - Full file contents.
 */
export function parseFrontmatter(source: string): Skill | null {
  const split = splitDocument(source);
  if (split === null) return null;
  const { bag, body } = split;

  const name = asScalar(bag["name"]);
  const description = asScalar(bag["description"]);
  const version = asScalar(bag["version"]);
  const catalog = asScalar(bag["catalog"]);
  const statusRaw = asScalar(bag["status"]);
  const createdAt = asScalar(bag["createdAt"]);
  const updatedAt = asScalar(bag["updatedAt"]);

  if (
    !name ||
    description === undefined ||
    !version ||
    !catalog ||
    !statusRaw ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const status: SkillStatus = STATUSES.includes(statusRaw as SkillStatus)
    ? (statusRaw as SkillStatus)
    : "draft";

  const skill: Skill = {
    name,
    description,
    version,
    catalog,
    triggers: asList(bag["triggers"]),
    sources: asList(bag["sources"]),
    status,
    createdAt,
    updatedAt,
    body,
  };
  const tools = asList(bag["tools"]);
  if (tools.length > 0) skill.tools = tools;
  return skill;
}

/** Quote a scalar value when it could otherwise be mis-parsed. */
function quoteIfNeeded(value: string): string {
  if (value === "") return '""';
  // Quote when the value contains characters that would break the line parser
  // (leading list dash, embedded colon+space, or surrounding whitespace).
  if (
    /^[\s-]/.test(value) ||
    /:\s/.test(value) ||
    /[\n]/.test(value) ||
    value.trim() !== value ||
    value.startsWith("[") ||
    value.startsWith('"') ||
    value.startsWith("'")
  ) {
    return JSON.stringify(value);
  }
  return value;
}

/** Render a frontmatter list field as a block list, or `[]` when empty. */
function renderList(key: string, items: string[]): string {
  if (items.length === 0) return `${key}: []`;
  const body = items.map((it) => `  - ${quoteIfNeeded(it)}`).join("\n");
  return `${key}:\n${body}`;
}

/**
 * Serialize a {@link Skill} (or bare {@link SkillFrontmatter}) to a markdown
 * document with a frontmatter block. Field order is stable.
 *
 * @param skill - The skill or frontmatter to serialize. When `body` is absent
 *   (a bare frontmatter), an empty body is written.
 */
export function serializeFrontmatter(skill: Skill | SkillFrontmatter): string {
  const lines: string[] = [FENCE];
  lines.push(`name: ${quoteIfNeeded(skill.name)}`);
  lines.push(`description: ${quoteIfNeeded(skill.description)}`);
  lines.push(`version: ${quoteIfNeeded(skill.version)}`);
  lines.push(`catalog: ${quoteIfNeeded(skill.catalog)}`);
  lines.push(renderList("triggers", skill.triggers));
  if (skill.tools !== undefined) lines.push(renderList("tools", skill.tools));
  lines.push(renderList("sources", skill.sources));
  lines.push(`status: ${skill.status}`);
  lines.push(`createdAt: ${quoteIfNeeded(skill.createdAt)}`);
  lines.push(`updatedAt: ${quoteIfNeeded(skill.updatedAt)}`);
  lines.push(FENCE);
  const body = "body" in skill ? skill.body : "";
  return `${lines.join("\n")}\n\n${body}\n`;
}
