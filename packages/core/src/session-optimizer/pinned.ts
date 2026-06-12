/**
 * Deterministic, heuristic extraction of "pinned facts" — the durably-important
 * snippets of a conversation that must survive compaction forever: file paths,
 * code identifiers/symbols, explicit decisions, open tasks/TODOs and version
 * numbers.
 *
 * Everything here is pure and side-effect-free: equal input always yields the
 * same ordered, de-duplicated output. The functions never throw and tolerate
 * arbitrary Unicode.
 */

import type { ChatMessage } from "@ultracode/shared";

/** Upper bound on a single pinned fact's length (characters). */
const MAX_FACT_CHARS = 200;

/** Hard cap on the number of pinned facts returned (most recent kept). */
const MAX_FACTS = 64;

/** File paths: POSIX or Windows, with a recognised file extension (unicode-aware). */
const FILE_PATH_RE =
  /(?:[A-Za-z]:\\|\.{0,2}[/\\])?(?:[\p{L}\p{N}.@_-]+[/\\])+[\p{L}\p{N}.@_-]+\.[A-Za-z][A-Za-z0-9]{0,9}/gu;

/** Bare dotted/extensioned filenames (e.g. `config.toml`, `café.md`). */
const BARE_FILE_RE = /[\p{L}\p{N}_-]+\.(?:[A-Za-z][A-Za-z0-9]{0,9})\b/gu;

/** Semantic-ish version numbers (e.g. `1.2.0`, `v3.4`, `2.0.0-rc.1`). */
const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/g;

/**
 * Identifiers / code symbols: CamelCase, snake_case, or `a.b.c()` member chains,
 * optionally ending in a `()` call. No trailing `\b` so the `()` is captured.
 */
const IDENTIFIER_RE = /(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:\(\))?/g;

/** Lines that look like a decision ("we decided to use X", "chosen: Y"). */
const DECISION_RE =
  /(?:^|[\s.;])((?:decided|decide|chosen|choose|chose|use|using|adopt(?:ed)?|pick(?:ed)?|go with|selected|prefer(?:red)?)\b[^.!?\n]{0,180})/gi;

/** Lines that look like an open task ("TODO: …", "FIXME …", "next step …"). */
const TODO_RE = /\b(?:TODO|FIXME|XXX|HACK|next step|open task|action item)\b[^.\n]{0,180}/gi;

/** True when a token looks like a meaningful code symbol (not a stop-word). */
function isCodeSymbol(token: string): boolean {
  if (token.length < 3) return false;
  // CamelCase, contains underscore/$/digit, or a member chain / call — these
  // are strong signals of an identifier rather than prose.
  return (
    /[A-Z]/.test(token.slice(1)) || // internal uppercase → CamelCase
    /[_$]/.test(token) || // snake_case or sigil
    /\d/.test(token) || // contains a digit
    token.includes(".") || // member chain
    token.endsWith("()") // call expression
  );
}

/** Push a trimmed, length-capped candidate into the ordered set. */
function add(set: Map<string, true>, raw: string): void {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return;
  const fact = trimmed.length > MAX_FACT_CHARS ? trimmed.slice(0, MAX_FACT_CHARS) : trimmed;
  if (!set.has(fact)) set.set(fact, true);
}

/** Collect every match of `re` from `text` into `set`. */
function collect(set: Map<string, true>, text: string, re: RegExp, group = 0): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = group === 0 ? m[0] : m[group];
    if (value !== undefined) add(set, value);
    if (m.index === re.lastIndex) re.lastIndex++; // guard zero-width matches
  }
}

/**
 * Extract pinned facts from a single block of text. Deterministic and pure.
 *
 * @param text - Arbitrary message content.
 * @returns Ordered, de-duplicated facts (file paths, symbols, decisions, TODOs,
 *   versions). The order is: decisions, TODOs, file paths, versions, symbols.
 */
export function extractPinnedFromText(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];

  const decisions = new Map<string, true>();
  const todos = new Map<string, true>();
  const paths = new Map<string, true>();
  const versions = new Map<string, true>();
  const symbols = new Map<string, true>();

  collect(decisions, text, DECISION_RE, 1);
  collect(todos, text, TODO_RE);
  collect(paths, text, FILE_PATH_RE);
  collect(paths, text, BARE_FILE_RE);
  collect(versions, text, VERSION_RE);

  // Symbols: filter the broad identifier match down to real code-looking tokens.
  // Skip anything already captured as a file path or version (cross-category
  // dedup) so e.g. `config.toml` is listed once, not twice.
  IDENTIFIER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IDENTIFIER_RE.exec(text)) !== null) {
    const token = m[0];
    if (isCodeSymbol(token) && !paths.has(token) && !versions.has(token)) {
      add(symbols, token);
    }
    if (m.index === IDENTIFIER_RE.lastIndex) IDENTIFIER_RE.lastIndex++;
  }

  return [
    ...decisions.keys(),
    ...todos.keys(),
    ...paths.keys(),
    ...versions.keys(),
    ...symbols.keys(),
  ];
}

/**
 * Extract and merge pinned facts across a list of messages, preserving an
 * existing ordered set (already-pinned facts come first and are kept).
 * Deterministic, pure, capped to {@link MAX_FACTS}.
 *
 * @param messages - Messages to scan (only textual content is considered).
 * @param existing - Already-known pinned facts to retain and dedupe against.
 * @returns The merged, de-duplicated, capped fact list.
 */
export function extractPinnedFacts(
  messages: ChatMessage[],
  existing: readonly string[] = [],
): string[] {
  const set = new Map<string, true>();
  for (const fact of existing) add(set, fact);
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      for (const fact of extractPinnedFromText(msg?.content ?? "")) {
        set.set(fact, true);
      }
    }
  }
  const all = [...set.keys()];
  // Keep the earliest (existing + first-seen) facts when over the cap so that
  // long-lived facts are never evicted by a late burst.
  return all.slice(0, MAX_FACTS);
}
