/**
 * Context compression — token estimation, relevance ranking and trimming of
 * collected {@link ContextSection}s to a token budget.
 *
 * - Token estimate: `ceil(chars / 4)` (a pragmatic upper-bound heuristic).
 * - Ranking: sections mentioning file/directory names from the prompt come
 *   first; ties fall back to the collector-assigned priority, which encodes
 *   recency/importance (recently modified files rank above the full tree).
 * - Trimming happens at section boundaries; if not even one whole section
 *   fits, the top section is cut at a word boundary — never mid-word.
 */

import type { ContextSection } from "./ContextCollector.js";

/** Options for {@link ContextCompressor.compress}. */
export interface CompressOptions {
  /** User prompt; used for mention-based relevance ranking. */
  prompt: string;
  /** Token budget for the rendered context (`<= 0` → empty string). */
  maxTokens: number;
}

/** Heading prepended to every rendered context document. */
export const CONTEXT_HEADER = "# Project Context";

/** Marker appended when a section had to be cut. */
const TRUNCATION_MARKER = "… (truncated)";

/** Cap on the number of distinct prompt terms considered (bounds huge prompts). */
const MAX_PROMPT_TERMS = 200;

/**
 * Ranks and trims context sections into a single markdown document that fits
 * a token budget.
 */
export class ContextCompressor {
  /**
   * Estimate the token count of a string using the chars/4 heuristic.
   * Empty input → `0`; otherwise at least `1`.
   */
  estimateTokens(text: string): number {
    return text.length === 0 ? 0 : Math.ceil(text.length / 4);
  }

  /**
   * Extract lowercase search terms (words and path segments, length >= 3)
   * from a prompt. Bounded to {@link MAX_PROMPT_TERMS} distinct terms.
   */
  extractTerms(prompt: string): string[] {
    const terms = new Set<string>();
    const tokens = prompt.toLowerCase().split(/[^\p{L}\p{N}._\\/-]+/u);
    for (const token of tokens) {
      if (terms.size >= MAX_PROMPT_TERMS) break;
      const cleaned = token.replace(/^[.\-/\\]+|[.\-/\\]+$/g, "");
      if (cleaned.length >= 3) terms.add(cleaned);
      // Path-like tokens also contribute their segments ("src/app.ts" → "app.ts").
      for (const seg of cleaned.split(/[/\\]+/)) {
        if (terms.size >= MAX_PROMPT_TERMS) break;
        if (seg.length >= 3) terms.add(seg);
      }
    }
    return [...terms];
  }

  /**
   * Rank sections by prompt relevance: number of distinct prompt terms found
   * in title/content (descending), then collector priority (ascending).
   * The input array is not mutated.
   */
  rank(sections: ContextSection[], prompt: string): ContextSection[] {
    const terms = this.extractTerms(prompt);
    const scored = sections.map((section, index) => {
      let score = 0;
      if (terms.length > 0) {
        const haystack = `${section.title}\n${section.content}`.toLowerCase();
        for (const term of terms) {
          if (haystack.includes(term)) score++;
        }
      }
      return { section, score, index };
    });
    scored.sort(
      (a, b) =>
        b.score - a.score || a.section.priority - b.section.priority || a.index - b.index,
    );
    return scored.map((s) => s.section);
  }

  /**
   * Render the highest-ranked sections as markdown within `maxTokens`.
   *
   * Whole sections are added greedily in rank order; sections that do not fit
   * are skipped in favour of smaller, lower-ranked ones. When no complete
   * section fits, the top section is truncated at a word boundary. Returns
   * `""` for an empty/zero budget or when nothing fits.
   */
  compress(sections: ContextSection[], options: CompressOptions): string {
    const budget = Math.floor(options.maxTokens);
    if (!Number.isFinite(budget) || budget <= 0) return "";

    const usable = sections.filter((s) => s.content.trim() !== "");
    if (usable.length === 0) return "";

    const ranked = this.rank(usable, options.prompt);
    let remaining = budget - this.estimateTokens(`${CONTEXT_HEADER}\n`);
    if (remaining < 0) return "";

    const parts: string[] = [];
    for (const section of ranked) {
      const rendered = this.render(section, section.content);
      const cost = this.estimateTokens(rendered);
      if (cost <= remaining) {
        parts.push(rendered);
        remaining -= cost;
      }
    }

    if (parts.length === 0) {
      const top = ranked[0];
      if (top !== undefined) {
        const truncated = this.renderTruncated(top, remaining);
        if (truncated !== null) parts.push(truncated);
      }
    }

    if (parts.length === 0) return "";
    return `${CONTEXT_HEADER}\n${parts.join("")}`;
  }

  /* ----------------------------------------------------------------------
   * Internals
   * -------------------------------------------------------------------- */

  private render(section: ContextSection, body: string): string {
    return `\n## ${section.title}\n\n${body}\n`;
  }

  /** Render a word-boundary-truncated version of `section` fitting `tokenBudget`. */
  private renderTruncated(section: ContextSection, tokenBudget: number): string | null {
    if (tokenBudget <= 0) return null;
    // Rendered length with an empty cut; the cut text adds chars 1:1 on top.
    const overhead = this.render(section, `\n${TRUNCATION_MARKER}`).length;
    const charBudget = tokenBudget * 4 - overhead;
    if (charBudget <= 0) return null;
    const cut = cutAtWordBoundary(section.content, charBudget);
    if (cut === "") return null;
    return this.render(section, `${cut}\n${TRUNCATION_MARKER}`);
  }
}

/**
 * Cut `text` down to at most `maxChars` characters, ending at a whitespace
 * boundary (never mid-word, never splitting a surrogate pair). Returns `""`
 * when no clean cut is possible.
 */
export function cutAtWordBoundary(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text.trimEnd();
  const slice = text.slice(0, maxChars);
  // Find the last whitespace character in the slice and cut there.
  let cutIndex = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (/\s/.test(slice[i] as string)) {
      cutIndex = i;
      break;
    }
  }
  if (cutIndex <= 0) return "";
  return slice.slice(0, cutIndex).trimEnd();
}
