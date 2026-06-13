/**
 * Extraction pipeline: page text → distilled {@link KnowledgeMaterial}.
 *
 * Steps:
 * 1. **Chunk** the cleaned text into ~512-token windows with ~10 % overlap.
 * 2. **Estimate** tokens heuristically (no ML tokenizer).
 * 3. **Map-reduce** with cheap-model routing (80/15/5) over an injected
 *    {@link ILLMProvider}: each chunk is summarised (map), then the summaries
 *    are reduced into facts + snippets. A per-chunk hash cache short-circuits
 *    repeated work across runs.
 *
 * When no provider is supplied (or the budget gate refused), the pipeline is
 * **fully deterministic**: it derives a summary/facts/snippets directly from
 * the text without any model call.
 */

import { createHash } from "node:crypto";

import type { ILLMProvider } from "ultracode-shared";
import type { KnowledgeMaterial, RoutingShare } from "./types.js";
import {
  CHARS_PER_TOKEN,
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_OVERLAP,
  DEFAULT_ROUTE_MODEL,
  DEFAULT_ROUTING,
  DETERMINISTIC_SUMMARY_MAX_CHARS,
  DETERMINISTIC_SUMMARY_SENTENCES,
  MAX_CODE_SNIPPETS,
  MAX_FACTS,
  MAX_OVERLAP,
  ROUTING_WINDOW,
  SUMMARY_CHUNK_COUNT,
  SUMMARY_MAX_CHARS,
} from "./defaults.js";

export { DEFAULT_CHUNK_TOKENS, DEFAULT_OVERLAP, DEFAULT_ROUTING } from "./defaults.js";

/** A single chunk of page text. */
export interface Chunk {
  /** Sequential index within the page. */
  index: number;
  /** Chunk text. */
  text: string;
  /** SHA-256 of the chunk text (cache key). */
  hash: string;
  /** Heuristic token estimate. */
  tokens: number;
}

/** Heuristic token estimate: ~4 chars/token, never below 1 for non-empty. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/** SHA-256 hex digest of `text`. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Split `text` into ~`chunkTokens`-sized chunks with fractional `overlap`.
 *
 * Splitting is word-boundary aware (falls back to hard slicing for a single
 * giant token). Empty input yields no chunks.
 *
 * @param text - Cleaned page text.
 * @param chunkTokens - Target tokens per chunk.
 * @param overlap - Fractional overlap (0..0.9).
 */
export function chunkText(
  text: string,
  chunkTokens: number = DEFAULT_CHUNK_TOKENS,
  overlap: number = DEFAULT_OVERLAP,
): Chunk[] {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  const targetChars = Math.max(1, chunkTokens) * CHARS_PER_TOKEN;
  const ov = Math.min(MAX_OVERLAP, Math.max(0, overlap));
  const overlapChars = Math.floor(targetChars * ov);

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  const len = text.length;
  while (start < len) {
    let end = Math.min(len, start + targetChars);
    // Prefer a word boundary near `end` when not at the very end of the text.
    if (end < len) {
      const ws = text.lastIndexOf(" ", end);
      if (ws > start + targetChars / 2) end = ws;
    }
    const slice = text.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({ index, text: slice, hash: sha256(slice), tokens: estimateTokens(slice) });
      index++;
    }
    if (end >= len) break;
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }
  return chunks;
}

/** Round-robin a model name for chunk `i` per the routing distribution. */
export function routeModel(i: number, routing: RoutingShare[] = DEFAULT_ROUTING): string {
  if (routing.length === 0) return DEFAULT_ROUTE_MODEL;
  // Build a cumulative ladder once per call (small arrays).
  let acc = 0;
  const ladder = routing.map((r) => {
    acc += Math.max(0, r.share);
    return { model: r.model, upto: acc };
  });
  const total = acc > 0 ? acc : 1;
  const pos = ((i % ROUTING_WINDOW) / ROUTING_WINDOW) * total;
  for (const step of ladder) if (pos < step.upto) return step.model;
  return ladder[ladder.length - 1]?.model ?? DEFAULT_ROUTE_MODEL;
}

/** Options for {@link distillPage}. */
export interface DistillOptions {
  /** Catalog the material belongs to. */
  catalog: string;
  /** Topic label (usually derived from the page title/url). */
  topic: string;
  /** Source URL(s) for attribution. */
  sources: string[];
  /** Optional LLM provider; absent → deterministic extraction. */
  provider?: ILLMProvider;
  /** Whether the budget gate permitted LLM use. */
  llmAllowed?: boolean;
  /** Routing distribution for map-reduce. */
  routing?: RoutingShare[];
  /** Per-chunk summary cache (hash → summary), shared across pages. */
  cache?: Map<string, string>;
  /** Cancellation signal. */
  signal?: AbortSignal;
  /** Chunk size / overlap overrides. */
  chunkTokens?: number;
  overlap?: number;
}

/** Token accounting for a {@link distillPage} call. */
export interface DistillUsage {
  /** Input tokens fed to the model (0 when deterministic). */
  tokensIn: number;
  /** Output tokens produced by the model (0 when deterministic). */
  tokensOut: number;
  /** Number of model calls made. */
  calls: number;
  /** Number of chunks served from cache. */
  cacheHits: number;
}

/**
 * Distil one page's text into {@link KnowledgeMaterial} plus usage accounting.
 *
 * @param text - Cleaned page text.
 * @param opts - Catalog/topic/provider/routing options.
 * @returns The material and the token usage incurred.
 */
export async function distillPage(
  text: string,
  opts: DistillOptions,
): Promise<{ material: KnowledgeMaterial; usage: DistillUsage }> {
  const chunks = chunkText(text, opts.chunkTokens, opts.overlap);
  const cache = opts.cache ?? new Map<string, string>();
  const routing = opts.routing ?? DEFAULT_ROUTING;
  const useLlm = !!opts.provider && opts.llmAllowed === true;

  const usage: DistillUsage = { tokensIn: 0, tokensOut: 0, calls: 0, cacheHits: 0 };
  const summaries: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (opts.signal?.aborted) throw signalError(opts.signal);
    const chunk = chunks[i];
    if (!chunk) continue;
    const cached = cache.get(chunk.hash);
    if (cached !== undefined) {
      usage.cacheHits++;
      summaries.push(cached);
      continue;
    }
    let summary: string;
    if (useLlm && opts.provider) {
      const model = routeModel(i, routing);
      const res = await opts.provider.complete({
        model,
        messages: [
          { role: "system", content: "Summarise the following documentation chunk into 1-3 dense factual sentences. No preamble." },
          { role: "user", content: chunk.text },
        ],
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      summary = (res.text ?? "").trim() || deterministicSummary(chunk.text);
      usage.tokensIn += res.usage?.inputTokens ?? chunk.tokens;
      usage.tokensOut += res.usage?.outputTokens ?? estimateTokens(summary);
      usage.calls++;
    } else {
      summary = deterministicSummary(chunk.text);
    }
    cache.set(chunk.hash, summary);
    summaries.push(summary);
  }

  // Reduce: in deterministic mode, derive facts/snippets directly.
  const facts = dedupe(summaries.flatMap(splitSentences)).slice(0, MAX_FACTS);
  const codeSnippets = extractCodeLike(text).slice(0, MAX_CODE_SNIPPETS);
  const material: KnowledgeMaterial = {
    catalog: opts.catalog,
    topic: opts.topic,
    summary:
      summaries.slice(0, SUMMARY_CHUNK_COUNT).join(" ").slice(0, SUMMARY_MAX_CHARS) ||
      deterministicSummary(text),
    facts,
    codeSnippets,
    sources: opts.sources,
  };
  return { material, usage };
}

/** A cheap, deterministic 1-2 sentence summary of a text. */
function deterministicSummary(text: string): string {
  const sentences = splitSentences(text);
  return sentences
    .slice(0, DETERMINISTIC_SUMMARY_SENTENCES)
    .join(" ")
    .slice(0, DETERMINISTIC_SUMMARY_MAX_CHARS);
}

/** Split text into trimmed sentences. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Stable dedupe preserving first occurrence. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/** Heuristically pull out lines that look like code (indentation, symbols). */
function extractCodeLike(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/[{};=]|^\s*(az |npm |pnpm |import |const |function |class |def |curl )/.test(line) && /[A-Za-z]/.test(line)) {
      out.push(trimmed);
    }
  }
  return dedupe(out);
}

/** Build an abort-derived error mirroring the signal's reason. */
function signalError(signal: AbortSignal): Error {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason instanceof Error) return reason;
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}
