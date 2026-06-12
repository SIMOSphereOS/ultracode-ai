/**
 * Minimal, dependency-free XML sitemap and `toc.json` parsing.
 *
 * Full XML parsing is overkill (and would pull a dependency): sitemaps are a
 * fixed, simple shape, so regex extraction of `<loc>` (and `<lastmod>`) is both
 * sufficient and robust against the well-formed XML that crawlers actually
 * emit. Two shapes are recognised:
 * - `<sitemapindex>` → child sitemap shard URLs,
 * - `<urlset>` → page URLs (with optional `lastmod`).
 */

import { TOC_WALK_GUARD } from "./defaults.js";

/** A `<url>` entry from a `<urlset>` sitemap. */
export interface SitemapUrl {
  /** Page location. */
  loc: string;
  /** Optional `<lastmod>` timestamp. */
  lastmod?: string;
}

/** Discriminated result of {@link parseSitemap}. */
export type SitemapResult =
  | { kind: "index"; sitemaps: string[] }
  | { kind: "urlset"; urls: SitemapUrl[] };

const LOC_RE = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;

/**
 * Parse a sitemap XML document.
 *
 * @param xml - Raw sitemap XML.
 * @returns An index (shard URLs) or a urlset (page URLs). Unknown/empty input
 *   yields an empty `urlset`.
 */
export function parseSitemap(xml: string): SitemapResult {
  if (typeof xml !== "string" || xml.length === 0) return { kind: "urlset", urls: [] };

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  if (isIndex) {
    return { kind: "index", sitemaps: extractLocs(xml) };
  }

  // Parse <url> blocks individually so loc/lastmod stay paired.
  const urls: SitemapUrl[] = [];
  const blockRe = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  let matchedAny = false;
  while ((m = blockRe.exec(xml)) !== null) {
    matchedAny = true;
    const block = m[1] ?? "";
    const loc = firstLoc(block);
    if (!loc) continue;
    const lastmodMatch = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i.exec(block);
    const entry: SitemapUrl = { loc: decodeXml(loc) };
    if (lastmodMatch && lastmodMatch[1]) entry.lastmod = lastmodMatch[1].trim();
    urls.push(entry);
  }
  // Fallback: bare <loc> list with no <url> wrappers.
  if (!matchedAny) {
    for (const loc of extractLocs(xml)) urls.push({ loc });
  }
  return { kind: "urlset", urls };
}

/** Extract and decode every `<loc>` value in a document. */
function extractLocs(xml: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    const loc = (m[1] ?? "").trim();
    if (loc) out.push(decodeXml(loc));
  }
  return out;
}

/** First `<loc>` within a `<url>` block. */
function firstLoc(block: string): string | undefined {
  const m = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(block);
  return m && m[1] ? m[1].trim() : undefined;
}

/** Decode the five predefined XML entities (sitemaps escape `&` in query strings). */
export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Shape of a Microsoft Learn `toc.json` node (recursive). */
interface TocNode {
  href?: string;
  children?: TocNode[];
  items?: TocNode[];
  toc_title?: string;
}

/**
 * Extract every `href` from a Microsoft Learn-style `toc.json` tree.
 *
 * The structure nests under `items`/`children`; both are walked. `href`s are
 * returned as-is (relative or absolute) — the caller normalises them against
 * the toc base URL.
 *
 * @param json - Parsed JSON value (untrusted; defensively walked).
 * @returns All discovered `href` strings, in document order.
 */
export function extractTocHrefs(json: unknown): string[] {
  const out: string[] = [];
  const stack: unknown[] = [json];
  let guard = 0;
  while (stack.length > 0 && guard < TOC_WALK_GUARD) {
    guard++;
    const node = stack.pop();
    if (node == null || typeof node !== "object") continue;
    const n = node as TocNode & Record<string, unknown>;
    if (typeof n.href === "string" && n.href.length > 0) out.push(n.href);
    if (Array.isArray(n.items)) for (const c of n.items) stack.push(c);
    if (Array.isArray(n.children)) for (const c of n.children) stack.push(c);
  }
  return out;
}
