/**
 * {@link SessionOptimizer} — running, incremental, non-blocking session
 * compaction.
 *
 * After every user turn the optimizer is invoked fire-and-forget. It keeps the
 * conversation cheap to replay without ever losing context or exploding the
 * token count by dragging the full history forward:
 *
 * 1. **Dedup** — repeated identical blocks (the same tool output / file read)
 *    are collapsed: older copies are replaced by a terse back-reference.
 * 2. **Rolling durable summary** — only the turns that have *newly* aged out of
 *    the recent window (tracked by `summarizedUpToIndex` in a sidecar file) are
 *    summarised and *merged* into the existing durable summary. The default is
 *    extractive (zero cost); an LLM cheap-model summary is used only when
 *    `enableLlmSummary` is set, a provider is wired and the budget gate allows
 *    it, falling back to extractive on any failure.
 * 3. **Pinned facts** — file paths, code symbols, decisions, TODOs and versions
 *    are deterministically re-extracted and preserved forever.
 *
 * Nothing destructive is written over the raw {@link SessionRecord}: the
 * compacted form lives entirely in `~/.ultracode/sessions-opt/<id>.json`, so
 * {@link SessionOptimizer.buildWorkingSet} can rebuild the compact view while
 * the full history stays available. Failures are non-fatal — they are logged
 * and surfaced as a zero-saving result, never thrown to the caller.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { NoopLogger, serializeError } from "@ultracode/shared";
import type {
  ChatMessage,
  IEventBus,
  ILLMProvider,
  ISessionStore,
  Logger,
  SessionRecord,
} from "@ultracode/shared";

import { resolveHome } from "../config/paths.js";
import { HeuristicTokenCounter } from "../tokens/TokenCounter.js";
import type { TokenCounter } from "../tokens/TokenCounter.js";
import type { IBudgetGate } from "../budget/types.js";
import { emitSessionOptimizedEvent } from "./events.js";
import { extractPinnedFacts } from "./pinned.js";
import {
  DEFAULT_THRESHOLDS,
  type SessionOptimizationResult,
  type SessionOptimizer,
  type SessionOptState,
  type Thresholds,
  type WorkingSet,
} from "./types.js";

/** Root directory for the optimizer sidecars (before `~` expansion). */
const SIDECAR_ROOT = "~/.ultracode/sessions-opt";

/** Budget category charged for optional LLM summarisation. */
const BUDGET_CATEGORY = "operations";

/** Construction options for {@link createSessionOptimizer}. */
export interface SessionOptimizerOptions {
  /** Session persistence the optimizer reads from (never writes through). */
  sessionStore: ISessionStore;
  /** Token counter for before/after measurement; defaults to the heuristic one. */
  counter?: TokenCounter;
  /** Budget gate consulted before any LLM summarisation. */
  budget?: IBudgetGate;
  /** LLM provider for optional cheap-model summarisation. */
  provider?: ILLMProvider;
  /** Structured logger. */
  logger: Logger;
  /** Optional event bus for `session.optimized`. */
  events?: IEventBus;
  /** Threshold overrides merged onto {@link DEFAULT_THRESHOLDS}. */
  thresholds?: Partial<Thresholds>;
  /** Injectable clock (epoch ms) for deterministic tests. */
  now?: () => number;
  /** Home-directory override for the sidecar root (tests/embedders). */
  homeDir?: string;
}

/**
 * Create a {@link SessionOptimizer}. All collaborators are injected; the only
 * required ones are a session store and a logger.
 *
 * @param opts - Wiring + threshold overrides.
 * @returns A ready optimizer whose `processIncremental` is safe to call
 *   fire-and-forget.
 */
export function createSessionOptimizer(opts: SessionOptimizerOptions): SessionOptimizer {
  return new SessionOptimizerImpl(opts);
}

/** Standard {@link SessionOptimizer} implementation. */
class SessionOptimizerImpl implements SessionOptimizer {
  private readonly store: ISessionStore;
  private readonly counter: TokenCounter;
  private readonly budget?: IBudgetGate;
  private readonly provider?: ILLMProvider;
  private readonly logger: Logger;
  private readonly events?: IEventBus;
  private readonly thresholds: Thresholds;
  private readonly now: () => number;
  private readonly sidecarRoot: string;

  constructor(opts: SessionOptimizerOptions) {
    this.store = opts.sessionStore;
    this.counter = opts.counter ?? new HeuristicTokenCounter();
    if (opts.budget !== undefined) this.budget = opts.budget;
    if (opts.provider !== undefined) this.provider = opts.provider;
    this.logger = opts.logger ?? new NoopLogger();
    if (opts.events !== undefined) this.events = opts.events;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds ?? {}) };
    this.now = opts.now ?? (() => Date.now());
    this.sidecarRoot = resolveHome(SIDECAR_ROOT, opts.homeDir);
  }

  /** {@inheritDoc SessionOptimizer.processIncremental} */
  async processIncremental(sessionId: string): Promise<SessionOptimizationResult> {
    const empty: SessionOptimizationResult = {
      sessionId,
      beforeTokens: 0,
      afterTokens: 0,
      savedTokens: 0,
      summarizedTurns: 0,
      durableSummaryUpdated: false,
    };
    try {
      const record = await this.store.get(sessionId);
      if (record === null) return empty;

      const messages = Array.isArray(record.messages) ? record.messages : [];
      const beforeTokens = this.counter.countMessages(messages);
      empty.beforeTokens = beforeTokens;
      empty.afterTokens = beforeTokens;

      if (messages.length < this.thresholds.minMessages) {
        // Too short to compact — record the sidecar lazily so pinned facts and
        // the (empty) summary exist, but report zero savings.
        return { ...empty };
      }

      const prior = await this.loadState(sessionId);

      // (1) Dedup repeated identical blocks across the whole history.
      const deduped = dedupMessages(messages);

      // (2) Rolling summary: the window of turns that have newly aged out.
      const recentStart = Math.max(0, deduped.length - this.thresholds.recentKeep);
      const from = Math.min(prior.summarizedUpToIndex, recentStart);
      const agedOut = deduped.slice(from, recentStart);
      let summarizedTurns = 0;
      let durableSummary = prior.durableSummary;
      let durableSummaryUpdated = false;
      if (agedOut.length > 0) {
        const chunkSummary = await this.summarize(agedOut);
        if (chunkSummary.trim().length > 0) {
          durableSummary = mergeSummary(
            prior.durableSummary,
            chunkSummary,
            this.thresholds.summaryMaxChars,
          );
          durableSummaryUpdated = durableSummary !== prior.durableSummary;
          summarizedTurns = agedOut.length;
        }
      }

      // (3) Pinned facts: re-extract from the aged-out turns, merge with prior.
      const pinnedFacts = extractPinnedFacts(agedOut, prior.pinnedFacts);

      const next: SessionOptState = {
        version: 1,
        sessionId,
        summarizedUpToIndex: Math.max(prior.summarizedUpToIndex, recentStart),
        durableSummary,
        pinnedFacts,
        updatedAt: new Date(this.now()).toISOString(),
      };
      await this.saveState(next);

      // Measure the compacted working set against the raw history.
      const compactRecord: SessionRecord = { ...record, messages: deduped };
      const workingSet = this.buildWorkingSetFrom(compactRecord, next);
      const afterTokens = this.measureWorkingSet(workingSet);
      const savedTokens = Math.max(0, beforeTokens - afterTokens);

      emitSessionOptimizedEvent(
        { type: "session.optimized", sessionId, beforeTokens, afterTokens, savedTokens },
        this.events,
        this.logger,
      );

      return {
        sessionId,
        beforeTokens,
        afterTokens,
        savedTokens,
        summarizedTurns,
        durableSummaryUpdated,
      };
    } catch (err) {
      // Background task: never throw to the caller.
      this.logger.warn("session-optimizer.process-failed", {
        sessionId,
        error: serializeError(err),
      });
      return empty;
    }
  }

  /** {@inheritDoc SessionOptimizer.buildWorkingSet} */
  buildWorkingSet(record: SessionRecord): WorkingSet {
    // Synchronous variant used at run-build time: read the sidecar best-effort
    // is async, so callers that need the persisted summary use the optimizer's
    // async path. Here we derive a fresh working set from the record alone,
    // deduping and extracting pinned facts deterministically.
    const messages = Array.isArray(record.messages) ? record.messages : [];
    const deduped = dedupMessages(messages);
    const recentStart = Math.max(0, deduped.length - this.thresholds.recentKeep);
    const agedOut = deduped.slice(0, recentStart);
    const pinnedFacts = extractPinnedFacts(agedOut, []);
    const durableSummary = extractiveSummary(agedOut, this.thresholds.summaryMaxChars);
    return this.assembleWorkingSet(deduped, durableSummary, pinnedFacts);
  }

  /**
   * Load the persisted sidecar for a session and build the working set from it.
   * Preferred over {@link buildWorkingSet} when the rolling summary should be
   * used (it reflects prior LLM/extractive passes).
   *
   * @param record - The raw session record.
   * @returns The compacted working set, using the sidecar's summary/pins when
   *   present, otherwise a freshly-derived one.
   */
  async buildWorkingSetPersisted(record: SessionRecord): Promise<WorkingSet> {
    try {
      const state = await this.loadState(record.id);
      const deduped = dedupMessages(
        Array.isArray(record.messages) ? record.messages : [],
      );
      if (state.durableSummary.length === 0 && state.pinnedFacts.length === 0) {
        return this.buildWorkingSet(record);
      }
      return this.buildWorkingSetFrom({ ...record, messages: deduped }, state);
    } catch {
      return this.buildWorkingSet(record);
    }
  }

  /** Build a working set from already-deduped messages and a sidecar state. */
  private buildWorkingSetFrom(record: SessionRecord, state: SessionOptState): WorkingSet {
    const messages = Array.isArray(record.messages) ? record.messages : [];
    return this.assembleWorkingSet(messages, state.durableSummary, state.pinnedFacts);
  }

  /**
   * Assemble the final {@link WorkingSet}: the first system/leading message, the
   * recent window, and the summary/pins — never splitting a tool-call/tool-result
   * pair at the window boundary.
   */
  private assembleWorkingSet(
    messages: ChatMessage[],
    durableSummary: string,
    pinnedFacts: string[],
  ): WorkingSet {
    const result: ChatMessage[] = [];
    const leadingCount = leadingSystemCount(messages);
    for (let i = 0; i < leadingCount; i++) {
      const msg = messages[i];
      if (msg !== undefined) result.push(msg);
    }

    let recentStart = Math.max(leadingCount, messages.length - this.thresholds.recentKeep);
    // Do not start the recent window on a `tool` message whose triggering
    // assistant tool-call is just before it — pull the boundary back to include
    // the assistant turn so the pair stays together.
    recentStart = pullBackToKeepPairs(messages, recentStart, leadingCount);

    for (let i = recentStart; i < messages.length; i++) {
      const msg = messages[i];
      if (msg !== undefined) result.push(msg);
    }

    return { messages: result, durableSummary, pinnedFacts: [...pinnedFacts] };
  }

  /** Estimate the token cost of a working set (messages + summary + pins). */
  private measureWorkingSet(ws: WorkingSet): number {
    let total = this.counter.countMessages(ws.messages);
    if (ws.durableSummary.length > 0) total += this.counter.count(ws.durableSummary);
    for (const fact of ws.pinnedFacts) total += this.counter.count(fact);
    return total;
  }

  /**
   * Summarise the aged-out turns. Extractive by default (zero cost). Uses a
   * cheap-model LLM summary only when enabled, wired, and the budget allows it,
   * falling back to extractive on any failure.
   */
  private async summarize(agedOut: ChatMessage[]): Promise<string> {
    const extractive = extractiveSummary(agedOut, this.thresholds.summaryMaxChars);
    if (!this.thresholds.enableLlmSummary || !this.provider || !this.budget) {
      return extractive;
    }
    try {
      const joined = agedOut.map((m) => `${m.role}: ${m.content ?? ""}`).join("\n");
      const estimate = this.budget.estimate({
        category: BUDGET_CATEGORY,
        texts: [joined],
      });
      const decision = this.budget.check(estimate, BUDGET_CATEGORY);
      if (!decision.allowed) {
        this.logger.info("session-optimizer.llm-summary-skipped", {
          reason: decision.reason,
        });
        return extractive;
      }
      const completion = await this.provider.complete({
        model: pickCheapModel(this.provider),
        messages: [
          {
            role: "system",
            content:
              "Summarise the following conversation turns into a terse, factual " +
              "running summary. Preserve decisions, file paths, identifiers and open tasks.",
          },
          { role: "user", content: joined },
        ],
        maxTokens: 512,
        temperature: 0,
      });
      await this.budget.record({
        ts: new Date(this.now()).toISOString(),
        category: BUDGET_CATEGORY,
        model: completion ? pickCheapModel(this.provider) : undefined,
        estimatedUsd: estimate.usdHigh,
        actualUsd: estimate.usdHigh,
        note: "session-optimizer rolling summary",
      });
      const text = (completion?.text ?? "").trim();
      return text.length > 0 ? text : extractive;
    } catch (err) {
      this.logger.warn("session-optimizer.llm-summary-failed", {
        error: serializeError(err),
      });
      return extractive;
    }
  }

  /** Absolute sidecar path for a session id. */
  private sidecarFile(sessionId: string): string {
    const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
    return path.join(this.sidecarRoot, `${safe}.json`);
  }

  /** Load the sidecar state for a session, or a fresh empty state. */
  private async loadState(sessionId: string): Promise<SessionOptState> {
    const fresh: SessionOptState = {
      version: 1,
      sessionId,
      summarizedUpToIndex: 0,
      durableSummary: "",
      pinnedFacts: [],
      updatedAt: new Date(this.now()).toISOString(),
    };
    try {
      const raw = await fs.readFile(this.sidecarFile(sessionId), "utf8");
      const parsed = JSON.parse(raw) as Partial<SessionOptState>;
      return {
        version: 1,
        sessionId,
        summarizedUpToIndex:
          typeof parsed.summarizedUpToIndex === "number" && parsed.summarizedUpToIndex >= 0
            ? Math.floor(parsed.summarizedUpToIndex)
            : 0,
        durableSummary: typeof parsed.durableSummary === "string" ? parsed.durableSummary : "",
        pinnedFacts: Array.isArray(parsed.pinnedFacts)
          ? parsed.pinnedFacts.filter((f): f is string => typeof f === "string")
          : [],
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : fresh.updatedAt,
      };
    } catch {
      // Missing or corrupt sidecar → start fresh (non-fatal).
      return fresh;
    }
  }

  /** Persist the sidecar state atomically (temp file + rename). */
  private async saveState(state: SessionOptState): Promise<void> {
    const file = this.sidecarFile(state.sessionId);
    const dir = path.dirname(file);
    const tmp = path.join(dir, `.${path.basename(file)}.${randomUUID()}.tmp`);
    const data = JSON.stringify(state, null, 2);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tmp, data, "utf8");
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      // Non-fatal: log and move on (a failed sidecar write just means the next
      // pass re-summarises the same window — idempotent, not corrupting).
      this.logger.warn("session-optimizer.sidecar-write-failed", {
        file,
        error: serializeError(err),
      });
    }
  }
}

/* ----------------------------------------------------------------------------
 * Pure helpers
 * ------------------------------------------------------------------------- */

/** Number of leading messages that form the immutable header (system + first). */
function leadingSystemCount(messages: ChatMessage[]): number {
  let count = 0;
  while (count < messages.length && messages[count]?.role === "system") count++;
  // Always keep at least the very first message (the durable anchor) even when
  // there is no system message.
  return Math.max(count, messages.length > 0 ? Math.min(1, messages.length) : 0);
}

/**
 * Pull the recent-window start back so it never begins on a `tool` message
 * whose originating assistant tool-call sits just before the boundary.
 */
function pullBackToKeepPairs(
  messages: ChatMessage[],
  recentStart: number,
  floor: number,
): number {
  let start = recentStart;
  while (start > floor && messages[start]?.role === "tool") {
    start--;
  }
  return start;
}

/**
 * Collapse repeated identical message blocks: when the exact same `(role,
 * content, toolCallId)` block appears more than once, every occurrence after
 * the first is replaced by a terse back-reference. Stable, deterministic, and
 * non-destructive to the *first* occurrence. Recent unique content is untouched.
 */
export function dedupMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Map<string, number>();
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    const content = msg.content ?? "";
    // Only dedup substantial tool/assistant payloads; never collapse short or
    // user turns (they carry intent).
    const dedupable =
      (msg.role === "tool" || msg.role === "assistant") && content.length >= 80;
    if (!dedupable) {
      out.push(msg);
      continue;
    }
    const key = `${msg.role} ${msg.name ?? ""} ${content}`;
    const firstAt = seen.get(key);
    if (firstAt === undefined) {
      seen.set(key, out.length);
      out.push(msg);
    } else {
      const ref: ChatMessage = {
        role: msg.role,
        content: `[duplicate of an earlier ${msg.role} message — content elided]`,
      };
      if (msg.toolCallId !== undefined) ref.toolCallId = msg.toolCallId;
      if (msg.name !== undefined) ref.name = msg.name;
      out.push(ref);
    }
  }
  return out;
}

/**
 * Deterministic extractive summary of a block of turns: the essence of each
 * turn (first sentence / tool-result headline), de-duplicated and capped.
 */
export function extractiveSummary(messages: ChatMessage[], maxChars: number): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    const content = (msg.content ?? "").replace(/\s+/g, " ").trim();
    if (content.length === 0) {
      // Pure tool-call assistant turn → note the tool names instead.
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const names = msg.toolCalls.map((tc) => tc.name).join(", ");
        const line = `${msg.role} called: ${names}`;
        if (!seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
      }
      continue;
    }
    const essence = firstSentence(content);
    const line = `${msg.role}: ${essence}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  const joined = lines.join("\n");
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

/** The first sentence (or a 160-char prefix) of a single-line string. */
function firstSentence(text: string): string {
  const match = /[.!?](?:\s|$)/.exec(text);
  const end = match ? match.index + 1 : text.length;
  const sentence = text.slice(0, end).trim();
  return sentence.length > 160 ? sentence.slice(0, 160) : sentence;
}

/**
 * Merge a new chunk summary into the existing durable summary, keeping the
 * existing prefix and appending the new content, then capping to `maxChars`
 * (oldest content is dropped first when over the cap). Never duplicates an
 * identical trailing chunk (idempotency guard).
 */
export function mergeSummary(existing: string, chunk: string, maxChars: number): string {
  const cleanChunk = chunk.trim();
  if (cleanChunk.length === 0) return existing;
  if (existing.length === 0) {
    return cleanChunk.length > maxChars ? cleanChunk.slice(cleanChunk.length - maxChars) : cleanChunk;
  }
  if (existing.endsWith(cleanChunk)) return existing; // idempotent re-merge
  const merged = `${existing}\n${cleanChunk}`;
  // Cap: keep the most-recent `maxChars` characters (drop oldest summary text).
  return merged.length > maxChars ? merged.slice(merged.length - maxChars) : merged;
}

/** Pick a cheap model id from a provider's name (best-effort, deterministic). */
function pickCheapModel(provider: ILLMProvider): string {
  const name = String(provider.name);
  if (name.includes("anthropic")) return "claude-3-5-haiku-latest";
  if (name.includes("openai")) return "gpt-4o-mini";
  if (name.includes("mistral")) return "mistral-small-latest";
  return name;
}
