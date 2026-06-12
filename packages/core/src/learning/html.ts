/**
 * Dependency-free HTML → text extraction.
 *
 * No DOM, no parser dependency: a small, robust pipeline that strips
 * `<script>`/`<style>`/`<noscript>` blocks, heuristically narrows to the
 * `<main>`/`<article>` region when present, removes the remaining tags and
 * decodes the common HTML entities. The goal is *clean enough* text for token
 * estimation and LLM distillation, not perfect rendering.
 */

/** Result of {@link extractText}: title plus cleaned body text. */
export interface ExtractedDoc {
  /** Document title from `<title>` or the first `<h1>`, when found. */
  title?: string;
  /** Cleaned, whitespace-collapsed body text. */
  text: string;
}

const NOISE_BLOCK = /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
const MAIN_RE = /<main\b[^>]*>([\s\S]*?)<\/main>/i;
const ARTICLE_RE = /<article\b[^>]*>([\s\S]*?)<\/article>/i;
/** Block-level tags whose boundaries should become line breaks. */
const BLOCK_TAGS =
  /<\/?(p|div|section|article|main|h[1-6]|ul|ol|li|br|tr|table|pre|blockquote|header|footer|nav)\b[^>]*>/gi;
const ANY_TAG = /<[^>]+>/g;

/**
 * Extract a clean title and body text from an HTML string.
 *
 * @param html - Raw HTML markup (may be empty).
 * @returns Title (best-effort) and collapsed body text.
 */
export function extractText(html: string): ExtractedDoc {
  if (typeof html !== "string" || html.length === 0) return { text: "" };

  // 1. Title before we discard the head.
  const titleMatch = TITLE_RE.exec(html);
  let title = titleMatch ? decodeEntities(stripTags(titleMatch[1] ?? "")).trim() : undefined;

  // 2. Drop noise blocks and comments.
  let work = html.replace(NOISE_BLOCK, " ").replace(COMMENT, " ");

  // 3. Narrow to main/article when present (first match wins).
  const main = MAIN_RE.exec(work) ?? ARTICLE_RE.exec(work);
  if (main && main[1]) work = main[1];

  // 4. Fall back to first <h1> for the title if <title> was empty.
  if (!title) {
    const h1 = H1_RE.exec(work);
    if (h1 && h1[1]) {
      const t = decodeEntities(stripTags(h1[1])).trim();
      if (t.length > 0) title = t;
    }
  }

  // 5. Convert block boundaries to newlines, strip the rest, decode entities.
  work = work.replace(BLOCK_TAGS, "\n");
  const text = collapse(decodeEntities(stripTags(work)));

  return title ? { title, text } : { text };
}

/** Remove every remaining tag. */
function stripTags(s: string): string {
  return s.replace(ANY_TAG, " ");
}

/** Collapse runs of whitespace; trim each line; drop empty lines. */
function collapse(s: string): string {
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
  trade: "™",
  deg: "°",
};

/**
 * Decode the common named entities and numeric (`&#NN;` / `&#xHH;`) references.
 * Unknown entities are left verbatim. Never throws; out-of-range code points
 * fall back to the original text.
 */
export function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const num = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(num) || num < 0 || num > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(num);
      } catch {
        return whole;
      }
    }
    const named = NAMED[body];
    return named !== undefined ? named : whole;
  });
}
