/**
 * Deterministic, offline token estimation.
 *
 * UltraCode never ships an ML tokenizer (no `tiktoken`, no model downloads):
 * the {@link HeuristicTokenCounter} produces a **calibrated estimate** of how
 * many tokens a string costs, using only string statistics. It is intended for
 * *budgeting* and *before/after reduction reporting*, not for exact billing.
 *
 * ## Honesty note (read this)
 *
 * The returned numbers are estimates with a provider-dependent error band of
 * roughly **±10–20 %**. Real tokenization is model/BPE-specific (a
 * `cl100k_base`, a SentencePiece and an Anthropic tokenizer disagree on the
 * same text). What the heuristic *does* guarantee is **monotonicity and
 * stability**: removing text never increases the estimate, the same input
 * always yields the same number, and pathological inputs (empty, ≥1 MB,
 * emoji, surrogate pairs, CJK, pure whitespace) never throw and never produce
 * `NaN`/`Infinity`. That is exactly what an optimizer needs to report an
 * *honest relative* reduction (before vs. after) even if the absolute count is
 * approximate.
 *
 * For an exact count, plug a {@link ProviderTokenCounter} (e.g. a future
 * Anthropic `count_tokens` API call) into the optimizer — but the default is
 * deliberately offline.
 */

import type { ChatMessage } from "@ultracode/shared";

/**
 * Counts tokens for a piece of text or a conversation.
 *
 * Implementations MUST be total (never throw) and deterministic (equal input →
 * equal output). They SHOULD be monotonic: a substring never costs more than
 * the whole.
 */
export interface TokenCounter {
  /** Estimate the token count of a single string. `""` → `0`. */
  count(text: string): number;
  /**
   * Estimate the token count of a list of chat messages, including a small
   * per-message structural overhead (role markers, tool-call envelopes).
   */
  countMessages(messages: ChatMessage[]): number;
}

/**
 * Optional asynchronous hook for an exact, provider-backed token count (for
 * example the Anthropic `count_tokens` endpoint or an OpenAI tokenizer).
 *
 * This is intentionally *not* the default: it implies a network round-trip or
 * a heavy local dependency. The offline {@link HeuristicTokenCounter} is the
 * default everywhere; a {@link ProviderTokenCounter} can be supplied where an
 * exact count is worth the cost.
 */
export interface ProviderTokenCounter {
  /** Exact token count for `text`, as reported by the backend. */
  countExact(text: string): Promise<number>;
}

/** Per-message structural overhead added by {@link HeuristicTokenCounter.countMessages}. */
const PER_MESSAGE_OVERHEAD = 4;

/** Extra tokens charged for each tool-call envelope on an assistant message. */
const PER_TOOL_CALL_OVERHEAD = 8;

/** Weight applied to the word-based estimate when blending the two models. */
const WORD_WEIGHT = 0.5;

/** Average characters per token assumed by the chars/N model (English-ish). */
const CHARS_PER_TOKEN = 4;

/** Multiplier turning a word count into a rough token count (sub-word splits). */
const WORD_TO_TOKEN = 1.3;

/**
 * Offline, calibrated token estimator.
 *
 * The estimate blends two classic heuristics and adds penalties for content
 * that real BPE tokenizers split aggressively:
 *
 * 1. **chars / {@link CHARS_PER_TOKEN}** — the upper-bound rule of thumb used
 *    across the OpenAI/Anthropic docs for English prose.
 * 2. **words × {@link WORD_TO_TOKEN}** — accounts for sub-word splitting of
 *    longer words; whitespace runs collapse to a single separator so a wall of
 *    spaces is not counted as many "words".
 * 3. **penalties** — punctuation/symbols and especially CJK / non-Latin
 *    codepoints and astral-plane characters (emoji) cost disproportionately
 *    more tokens than their char count suggests; a per-class surcharge nudges
 *    the estimate towards reality without ever lowering it.
 *
 * The two base models are averaged ({@link WORD_WEIGHT}) and the penalty is
 * added on top, then `Math.ceil`'d. Empty input is `0`; any non-empty input is
 * at least `1`.
 *
 * @remarks Iteration is by Unicode code point (`for…of`), so surrogate pairs
 * are counted as one character and never split. The implementation touches
 * each code point at most once → linear time, safe on ≥1 MB inputs.
 */
export class HeuristicTokenCounter implements TokenCounter {
  /** {@inheritDoc TokenCounter.count} */
  public count(text: string): number {
    if (typeof text !== "string" || text.length === 0) return 0;

    // `effectiveChars` collapses each whitespace *run* to a single character so
    // a wall of spaces is not billed like a wall of letters (real tokenizers
    // merge repeated whitespace into few tokens). Non-whitespace contributes
    // 1:1.
    let effectiveChars = 0;
    let wordChars = 0;
    let inWord = false;
    let inWhitespace = false;
    let words = 0;
    let punctuation = 0;
    let cjkOrAstral = 0;

    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;

      if (isWhitespace(cp)) {
        if (!inWhitespace) effectiveChars += 1; // count one per run
        inWhitespace = true;
        if (inWord) {
          words += 1;
          inWord = false;
        }
        continue;
      }
      inWhitespace = false;
      effectiveChars += 1;

      if (isWordChar(cp)) {
        wordChars += 1;
        inWord = true;
      } else {
        // Non-word, non-whitespace ends the current word and is a symbol.
        if (inWord) {
          words += 1;
          inWord = false;
        }
        punctuation += 1;
      }

      if (isCjkOrAstral(cp)) cjkOrAstral += 1;
    }
    if (inWord) words += 1;

    // Base model 1: effective characters / N (whitespace runs collapsed to 1).
    const charModel = effectiveChars / CHARS_PER_TOKEN;
    // Base model 2: words × sub-word factor. Single-letter words still cost ~1.
    const wordModel = words * WORD_TO_TOKEN;

    let estimate = charModel * (1 - WORD_WEIGHT) + wordModel * WORD_WEIGHT;

    // Penalties: punctuation/symbols are frequently their own token; CJK and
    // astral codepoints (emoji) routinely cost 1–3 tokens *each*.
    estimate += punctuation * 0.3;
    estimate += cjkOrAstral * 1.2;

    // Guard against degenerate all-whitespace input collapsing below the
    // char model (which already counts whitespace) — never below 1 for
    // non-empty text.
    void wordChars;
    const tokens = Math.ceil(estimate);
    return tokens < 1 ? 1 : tokens;
  }

  /** {@inheritDoc TokenCounter.countMessages} */
  public countMessages(messages: ChatMessage[]): number {
    if (!Array.isArray(messages) || messages.length === 0) return 0;
    let total = 0;
    for (const m of messages) {
      total += PER_MESSAGE_OVERHEAD;
      total += this.count(m.content ?? "");
      if (typeof m.name === "string") total += this.count(m.name);
      if (typeof m.toolCallId === "string") total += this.count(m.toolCallId);
      for (const tc of m.toolCalls ?? []) {
        total += PER_TOOL_CALL_OVERHEAD;
        total += this.count(tc.name);
        total += this.count(safeJsonLength(tc.arguments));
      }
    }
    return total;
  }
}

/** Stringify tool-call arguments for counting; never throws. */
function safeJsonLength(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return typeof s === "string" ? s : "";
  } catch {
    return "";
  }
}

/** Whitespace code points (ASCII run + common Unicode separators). */
function isWhitespace(cp: number): boolean {
  return (
    cp === 0x20 ||
    cp === 0x09 ||
    cp === 0x0a ||
    cp === 0x0d ||
    cp === 0x0b ||
    cp === 0x0c ||
    cp === 0xa0 ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    (cp >= 0x2000 && cp <= 0x200a)
  );
}

/** Letters, digits and common in-word connectors. */
function isWordChar(cp: number): boolean {
  return (
    (cp >= 0x30 && cp <= 0x39) || // 0-9
    (cp >= 0x41 && cp <= 0x5a) || // A-Z
    (cp >= 0x61 && cp <= 0x7a) || // a-z
    cp === 0x5f || // _
    (cp >= 0x80 && cp <= 0x024f) // Latin-1 supplement + extended (accented)
  );
}

/**
 * Whether a code point belongs to a script/plane that real tokenizers split
 * heavily: CJK ideographs, Hiragana/Katakana, Hangul, and everything in the
 * astral planes (emoji, rare scripts) — `cp > 0xFFFF`.
 */
function isCjkOrAstral(cp: number): boolean {
  return (
    cp > 0xffff || // astral plane (emoji, etc.)
    (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana + Katakana
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) // CJK compatibility
  );
}
