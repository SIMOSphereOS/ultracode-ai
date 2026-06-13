/**
 * The composable {@link OptimizerStage}s.
 *
 * Each stage is pure and deterministic. The lossless stages
 * ({@link DedupContextStage}, {@link WhitespaceNormalizeStage},
 * {@link SystemPromptMinifyStage}, {@link ToolSchemaSlimStage}) are idempotent;
 * {@link ConversationCompactionStage} converges (re-applying it does nothing
 * once the middle has been folded).
 *
 * ## What is NEVER touched
 *
 * - **Code inside fenced blocks** — significant whitespace (Python, YAML,
 *   diffs) is preserved byte-for-byte.
 * - **IMMUTABLE system-prompt segments** — security/compliance/AML instructions
 *   wrapped in markers are reproduced bit-for-bit.
 * - **Tool names, parameter schemas and `required`** — only free-text
 *   descriptions are shortened; the callable contract is untouched.
 * - **Tool-call / tool-result message pairs** — compaction never separates an
 *   assistant tool call from its `tool` answer.
 */

import type { ChatMessage, ILLMProvider, ToolDefinition } from "ultracode-shared";
import type { OptimizeContext, OptimizerStage, PromptPayload } from "./types.js";
import {
  hashBlock,
  normalizeProseWhitespace,
  splitBlocks,
  splitCodeFences,
  truncateAtWord,
} from "./internal.js";
import {
  DEDUP_PLACEHOLDER,
  DEFAULT_IMMUTABLE_CLOSE,
  DEFAULT_IMMUTABLE_OPEN,
  DEFAULT_KEEP_HEAD,
  DEFAULT_KEEP_TAIL,
  DEFAULT_TOOL_DESC_MAX,
  KEEP_HEAD_FLOOR,
  KEEP_TAIL_FLOOR,
  SUMMARIZER_MAX_TOKENS,
  SUMMARIZER_SYSTEM_PROMPT,
  SUMMARIZER_TRANSCRIPT_MAX_CHARS,
} from "./defaults.js";

export {
  DEDUP_PLACEHOLDER,
  DEFAULT_IMMUTABLE_OPEN,
  DEFAULT_IMMUTABLE_CLOSE,
  DEFAULT_TOOL_DESC_MAX,
};

/* ========================================================================== *
 * a) DedupContextStage
 * ========================================================================== */

/**
 * Removes exact-duplicate blocks from {@link PromptPayload.context}.
 *
 * Real agent contexts frequently contain the *same* file or directory listing
 * twice (e.g. a file read, then re-read after an edit, then injected again).
 * This stage hashes each block (paragraph or fenced code block) and replaces
 * any later byte-identical repeat with a short reference, keeping the first
 * occurrence intact.
 *
 * Lossless in meaning (the reference points at the retained original) and
 * idempotent: once duplicates are folded, a second pass finds none.
 */
export class DedupContextStage implements OptimizerStage {
  public readonly name = "dedup-context";

  public apply(p: PromptPayload, _ctx: OptimizeContext): PromptPayload {
    void _ctx;
    if (p.context === undefined || p.context === "") return p;

    const blocks = splitBlocks(p.context);
    if (blocks.length < 2) return p;

    const seen = new Set<string>();
    const out: string[] = [];
    let changed = false;
    for (const block of blocks) {
      const normalized = block.trim();
      const h = hashBlock(normalized);
      if (normalized.length > 0 && seen.has(h)) {
        out.push(DEDUP_PLACEHOLDER);
        changed = true;
      } else {
        seen.add(h);
        out.push(block);
      }
    }
    if (!changed) return p;
    return { ...p, context: out.join("\n\n") };
  }
}

/* ========================================================================== *
 * b) WhitespaceNormalizeStage
 * ========================================================================== */

/**
 * Collapses 3+ consecutive blank lines to one and trims trailing whitespace on
 * each line — **outside fenced code blocks only**.
 *
 * Fenced code (```` ``` ```` / `~~~`) is reproduced verbatim because its
 * whitespace can be load-bearing (Python indentation, diffs, YAML). Applies to
 * `system`, `context` and the textual `content` of every message.
 */
export class WhitespaceNormalizeStage implements OptimizerStage {
  public readonly name = "whitespace-normalize";

  public apply(p: PromptPayload, _ctx: OptimizeContext): PromptPayload {
    void _ctx;
    const system = normalizeOutsideCode(p.system);
    const context = p.context === undefined ? undefined : normalizeOutsideCode(p.context);
    const messages = p.messages.map((m) => {
      const next = normalizeOutsideCode(m.content);
      return next === m.content ? m : { ...m, content: next };
    });

    const next: PromptPayload = { ...p, system, messages };
    if (context !== undefined) next.context = context;
    return next;
  }
}

/** Normalize whitespace in prose segments while leaving fenced code untouched. */
function normalizeOutsideCode(text: string): string {
  if (text === "") return text;
  const segments = splitCodeFences(text);
  let changed = false;
  const rebuilt = segments
    .map((seg) => {
      if (seg.kind === "code") return seg.text;
      const norm = normalizeProseWhitespace(seg.text);
      if (norm !== seg.text) changed = true;
      return norm;
    })
    .join("\n");
  return changed ? rebuilt : text;
}

/* ========================================================================== *
 * c) SystemPromptMinifyStage
 * ========================================================================== */

/** Options for {@link SystemPromptMinifyStage}. */
export interface SystemPromptMinifyOptions {
  /** Opening marker for an immutable span. Default {@link DEFAULT_IMMUTABLE_OPEN}. */
  immutableOpen?: string;
  /** Closing marker for an immutable span. Default {@link DEFAULT_IMMUTABLE_CLOSE}. */
  immutableClose?: string;
  /**
   * Additional regexes whose every match is treated as immutable and never
   * altered (e.g. a compliance/AML instruction fingerprint). Matched spans are
   * carved out before any reduction.
   */
  immutableMarkers?: RegExp[];
}

/**
 * Safely minifies the system prompt: collapses blank-line runs and removes
 * **exact** duplicate paragraphs — and nothing else.
 *
 * ### Security invariant
 *
 * Spans wrapped in the immutable markers (default
 * `<!--immutable-->…<!--/immutable-->`) — or matched by any supplied
 * `immutableMarkers` regex — are reproduced **bit-for-bit**. This is the
 * mechanism that protects security/compliance/AML instructions: the minifier
 * carves out every immutable span, transforms only the mutable remainder, and
 * stitches the original spans back unchanged.
 *
 * Without markers it performs *only* lossless whitespace + exact-duplicate
 * reduction. It NEVER does semantic shortening, paraphrasing or summarization.
 */
export class SystemPromptMinifyStage implements OptimizerStage {
  public readonly name = "system-minify";
  private readonly open: string;
  private readonly close: string;
  private readonly markers: RegExp[];

  constructor(options: SystemPromptMinifyOptions = {}) {
    this.open = options.immutableOpen ?? DEFAULT_IMMUTABLE_OPEN;
    this.close = options.immutableClose ?? DEFAULT_IMMUTABLE_CLOSE;
    this.markers = options.immutableMarkers ?? [];
  }

  public apply(p: PromptPayload, _ctx: OptimizeContext): PromptPayload {
    void _ctx;
    if (p.system === "") return p;

    const { mutableParts, immutableParts, order } = this.partition(p.system);
    let changed = false;
    const transformedMutable = mutableParts.map((part) => {
      const next = minifyMutable(part);
      if (next !== part) changed = true;
      return next;
    });

    if (!changed) return p;

    // Re-stitch in original order; immutable parts are reproduced verbatim.
    let mi = 0;
    let ii = 0;
    const rebuilt = order
      .map((kind) => (kind === "mutable" ? transformedMutable[mi++] : immutableParts[ii++]))
      .join("");
    return { ...p, system: rebuilt };
  }

  /**
   * Partition the system prompt into an interleaved sequence of mutable and
   * immutable parts, preserving order so the original can be rebuilt exactly.
   */
  private partition(system: string): {
    mutableParts: string[];
    immutableParts: string[];
    order: Array<"mutable" | "immutable">;
  } {
    // Collect immutable spans as [start, end) ranges.
    const ranges: Array<[number, number]> = [];
    let cursor = 0;
    while (cursor < system.length) {
      const start = system.indexOf(this.open, cursor);
      if (start === -1) break;
      const end = system.indexOf(this.close, start + this.open.length);
      if (end === -1) {
        // Unterminated → protect to end of string (fail safe).
        ranges.push([start, system.length]);
        break;
      }
      ranges.push([start, end + this.close.length]);
      cursor = end + this.close.length;
    }
    // Apply user regexes (matched spans are immutable too).
    for (const re of this.markers) {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      const global = new RegExp(re.source, flags);
      for (let m = global.exec(system); m !== null; m = global.exec(system)) {
        if (m[0] === "") {
          global.lastIndex += 1;
          continue;
        }
        ranges.push([m.index, m.index + m[0].length]);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = mergeRanges(ranges);

    const mutableParts: string[] = [];
    const immutableParts: string[] = [];
    const order: Array<"mutable" | "immutable"> = [];
    let pos = 0;
    for (const [s, e] of merged) {
      if (s > pos) {
        mutableParts.push(system.slice(pos, s));
        order.push("mutable");
      }
      immutableParts.push(system.slice(s, e));
      order.push("immutable");
      pos = e;
    }
    if (pos < system.length) {
      mutableParts.push(system.slice(pos));
      order.push("mutable");
    }
    return { mutableParts, immutableParts, order };
  }
}

/** Merge overlapping/adjacent ranges. */
function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last !== undefined && r[0] <= last[1]) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      out.push([r[0], r[1]]);
    }
  }
  return out;
}

/** Lossless minify of a mutable span: blank-line collapse + exact dup paragraphs. */
function minifyMutable(text: string): string {
  const normalized = normalizeOutsideCode(text);
  // Remove exact-duplicate paragraphs, keeping first occurrence and order.
  const segments = splitCodeFences(normalized);
  const seen = new Set<string>();
  const rebuilt = segments
    .map((seg) => {
      if (seg.kind === "code") return seg.text;
      const paras = seg.text.split(/(\n[ \t]*\n)/u);
      const kept: string[] = [];
      for (let i = 0; i < paras.length; i++) {
        const chunk = paras[i] as string;
        // Separators (odd indices) always pass through.
        if (i % 2 === 1) {
          kept.push(chunk);
          continue;
        }
        const key = chunk.trim();
        if (key !== "" && seen.has(key)) {
          // Drop the duplicate paragraph and a following separator if present.
          if (i + 1 < paras.length) i += 1;
          continue;
        }
        if (key !== "") seen.add(key);
        kept.push(chunk);
      }
      return kept.join("");
    })
    .join("\n");
  return rebuilt;
}

/* ========================================================================== *
 * d) ToolSchemaSlimStage
 * ========================================================================== */

/** Options for {@link ToolSchemaSlimStage}. */
export interface ToolSchemaSlimOptions {
  /** Maximum description length in characters. Default {@link DEFAULT_TOOL_DESC_MAX}. */
  maxDescriptionChars?: number;
  /**
   * Allow-list of tool names to *keep* for this turn. When provided, tools not
   * in the list are dropped entirely (turn-scoped tool selection). When
   * omitted (the default), all tools are kept and only descriptions are slimmed
   * — the safe default that never removes a capability.
   */
  relevantTools?: readonly string[];
}

/**
 * Shortens over-long tool *descriptions* to a maximum length (at a word
 * boundary) and can optionally restrict the toolset to a per-turn allow-list.
 *
 * **Never** alters a tool's `name`, `parameters` or `required` list — the
 * callable contract is preserved exactly, so slimming can never break a tool
 * call. Descriptions are advisory free text; trimming them is safe.
 */
export class ToolSchemaSlimStage implements OptimizerStage {
  public readonly name = "tool-schema-slim";
  private readonly maxChars: number;
  private readonly relevant?: Set<string>;

  constructor(options: ToolSchemaSlimOptions = {}) {
    const max = options.maxDescriptionChars ?? DEFAULT_TOOL_DESC_MAX;
    this.maxChars = Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_TOOL_DESC_MAX;
    this.relevant = options.relevantTools ? new Set(options.relevantTools) : undefined;
  }

  public apply(p: PromptPayload, _ctx: OptimizeContext): PromptPayload {
    void _ctx;
    if (p.tools.length === 0) return p;

    let changed = false;
    const kept: ToolDefinition[] = [];
    for (const tool of p.tools) {
      if (this.relevant !== undefined && !this.relevant.has(tool.name)) {
        changed = true; // dropped
        continue;
      }
      const slim = this.slimDescription(tool.description);
      if (slim !== tool.description) {
        changed = true;
        kept.push({ ...tool, description: slim });
      } else {
        kept.push(tool);
      }
    }
    if (!changed) return p;
    return { ...p, tools: kept };
  }

  /** Trim a description to the max length at a word boundary; idempotent. */
  private slimDescription(desc: string): string {
    if (typeof desc !== "string" || desc.length <= this.maxChars) return desc;
    const cut = truncateAtWord(desc, this.maxChars);
    return cut === "" ? desc.slice(0, this.maxChars) : `${cut}…`;
  }
}

/* ========================================================================== *
 * e) ConversationCompactionStage
 * ========================================================================== */

/** Builds the placeholder note that replaces an omitted middle. */
export function omittedNote(count: number): string {
  return `[${count} earlier message${count === 1 ? "" : "s"} omitted to save context]`;
}

/** Options for {@link ConversationCompactionStage}. */
export interface ConversationCompactionOptions {
  /** Number of leading messages always kept. Default {@link DEFAULT_KEEP_HEAD}. */
  keepHead?: number;
  /** Number of trailing messages always kept. Default {@link DEFAULT_KEEP_TAIL}. */
  keepTail?: number;
  /**
   * Optional provider used to *summarize* the omitted middle instead of
   * dropping it. On any provider error the stage falls back to the
   * deterministic placeholder note (it never lets summarization break a run).
   * When omitted, compaction is fully deterministic and offline.
   */
  summarizer?: ILLMProvider;
  /** Model id passed to the summarizer provider. */
  summarizerModel?: string;
}

/**
 * Head/tail (sliding-window) conversation compaction.
 *
 * When the payload exceeds {@link OptimizeContext.tokenBudget}, the middle of
 * the message history is removed and replaced by a single short note (or, if a
 * `summarizer` provider is injected, by a brief LLM summary — with a hard
 * fallback to the note on any error). The system prompt is always kept; the
 * first `keepHead` and last `keepTail` messages are always kept.
 *
 * ### Consistency invariant
 *
 * The cut boundaries are **snapped** so an assistant message bearing
 * `toolCalls` is never separated from the following `tool` result message(s)
 * that answer it. This keeps the transcript valid for every provider.
 *
 * Note: because compaction can require a provider round-trip, the async variant
 * {@link ConversationCompactionStage.applyAsync} is used by the optimizer when
 * a summarizer is present; the synchronous {@link apply} always uses the
 * deterministic note (so the {@link OptimizerStage} contract stays pure/sync).
 */
export class ConversationCompactionStage implements OptimizerStage {
  public readonly name = "conversation-compaction";
  private readonly keepHead: number;
  private readonly keepTail: number;
  private readonly summarizer?: ILLMProvider;
  private readonly summarizerModel: string;

  constructor(options: ConversationCompactionOptions = {}) {
    this.keepHead = clampInt(options.keepHead, DEFAULT_KEEP_HEAD, KEEP_HEAD_FLOOR);
    this.keepTail = clampInt(options.keepTail, DEFAULT_KEEP_TAIL, KEEP_TAIL_FLOOR);
    if (options.summarizer !== undefined) this.summarizer = options.summarizer;
    this.summarizerModel = options.summarizerModel ?? "";
  }

  /** Synchronous, deterministic compaction (always uses the omitted-note). */
  public apply(p: PromptPayload, ctx: OptimizeContext): PromptPayload {
    const plan = this.plan(p, ctx);
    if (plan === null) return p;
    const note: ChatMessage = { role: "user", content: omittedNote(plan.omitted.length) };
    return { ...p, messages: [...plan.head, note, ...plan.tail] };
  }

  /**
   * Asynchronous compaction that summarizes the omitted middle via the injected
   * provider, falling back to {@link apply} on any failure or when no
   * summarizer is configured.
   */
  public async applyAsync(p: PromptPayload, ctx: OptimizeContext): Promise<PromptPayload> {
    const plan = this.plan(p, ctx);
    if (plan === null) return p;
    if (this.summarizer === undefined) {
      return this.apply(p, ctx);
    }
    try {
      const transcript = plan.omitted
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")
        .slice(0, SUMMARIZER_TRANSCRIPT_MAX_CHARS);
      const result = await this.summarizer.complete({
        model: this.summarizerModel,
        maxTokens: SUMMARIZER_MAX_TOKENS,
        messages: [
          {
            role: "system",
            content: SUMMARIZER_SYSTEM_PROMPT,
          },
          { role: "user", content: transcript },
        ],
      });
      const summary = (result.text ?? "").trim();
      if (summary === "") return this.apply(p, ctx);
      const note: ChatMessage = {
        role: "user",
        content: `[summary of ${plan.omitted.length} omitted message${
          plan.omitted.length === 1 ? "" : "s"
        }]\n${summary}`,
      };
      return { ...p, messages: [...plan.head, note, ...plan.tail] };
    } catch {
      // Honest fallback: never let summarization break the run.
      return this.apply(p, ctx);
    }
  }

  /**
   * Decide whether and how to compact. Returns `null` when no compaction is
   * needed (under budget, no budget set, or nothing safely removable).
   */
  private plan(
    p: PromptPayload,
    ctx: OptimizeContext,
  ): { head: ChatMessage[]; tail: ChatMessage[]; omitted: ChatMessage[] } | null {
    const budget = ctx.tokenBudget;
    if (budget === undefined || !Number.isFinite(budget) || budget <= 0) return null;

    const total =
      ctx.counter.count(p.system) +
      ctx.counter.count(p.context ?? "") +
      ctx.counter.countMessages(p.messages) +
      toolsTokens(p.tools, ctx);
    if (total <= budget) return null;

    const msgs = p.messages;
    if (msgs.length <= this.keepHead + this.keepTail) return null;

    // Snap the head boundary forward so we never end the head on an assistant
    // message that still has unanswered tool calls.
    let headEnd = snapForward(msgs, this.keepHead);
    // Snap the tail boundary so it starts on a self-contained message (not a
    // `tool` result whose assistant call would be in the omitted middle).
    let tailStart = snapTailStart(msgs, msgs.length - this.keepTail);

    if (tailStart <= headEnd) return null; // nothing safely removable
    // Guard against degenerate snapping that left no gap.
    if (headEnd < 0) headEnd = 0;
    if (tailStart > msgs.length) tailStart = msgs.length;

    const head = msgs.slice(0, headEnd);
    const omitted = msgs.slice(headEnd, tailStart);
    const tail = msgs.slice(tailStart);
    if (omitted.length === 0) return null;
    return { head, tail, omitted };
  }
}

/** Sum the token cost of tool definitions via the counter. */
function toolsTokens(tools: ToolDefinition[], ctx: OptimizeContext): number {
  let n = 0;
  for (const t of tools) {
    n += ctx.counter.count(t.name) + ctx.counter.count(t.description);
    n += ctx.counter.count(safeJson(t.parameters));
  }
  return n;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/**
 * Move the head boundary forward past any trailing assistant-with-toolCalls so
 * its `tool` answers are included in the head (never split).
 */
function snapForward(msgs: ChatMessage[], index: number): number {
  let i = Math.min(Math.max(index, 0), msgs.length);
  // If the last kept-head message requested tools, pull in the answers.
  while (i > 0 && i < msgs.length) {
    const prev = msgs[i - 1];
    if (prev !== undefined && prev.role === "assistant" && (prev.toolCalls?.length ?? 0) > 0) {
      // Include following tool results.
      while (i < msgs.length && (msgs[i] as ChatMessage).role === "tool") i += 1;
      break;
    }
    break;
  }
  return i;
}

/**
 * Move the tail start backward/forward so it does not begin on a `tool` result
 * (whose initiating assistant call would otherwise be omitted).
 */
function snapTailStart(msgs: ChatMessage[], index: number): number {
  let i = Math.min(Math.max(index, 0), msgs.length);
  while (i > 0 && i < msgs.length && (msgs[i] as ChatMessage).role === "tool") {
    i -= 1; // pull the initiating assistant message into the tail
  }
  return i;
}

/** Clamp to a non-negative integer with a default and a floor. */
function clampInt(value: number | undefined, fallback: number, floor: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return n < floor ? floor : n;
}
