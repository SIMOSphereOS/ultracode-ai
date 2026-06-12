/**
 * Core-local contracts for the session optimizer.
 *
 * The session optimizer keeps a running conversation compact and cheap to
 * replay: after every user turn it incrementally summarises the turns that have
 * aged out of the recent window and merges them into a durable summary, dedupes
 * repeated tool output, and extracts pinned facts that must survive forever.
 * None of this is destructive — the raw {@link SessionRecord} is left intact
 * and the compacted form lives in a sidecar file so the working set can be
 * rebuilt on demand.
 *
 * These types are deliberately defined *here* in `core` rather than in the
 * frozen `@ultracode/shared` 1.0 contract layer: the subsystem is new and may
 * still evolve. All cross-module dependencies (token counter, budget gate, LLM
 * provider) are consumed through narrow, constructor-injected interfaces.
 */

import type { ChatMessage } from "@ultracode/shared";

/** Outcome of a single {@link SessionOptimizer.processIncremental} pass. */
export interface SessionOptimizationResult {
  /** Identifier of the session that was processed. */
  sessionId: string;
  /** Estimated tokens of the raw history before this pass. */
  beforeTokens: number;
  /** Estimated tokens of the compacted working set after this pass. */
  afterTokens: number;
  /** `beforeTokens - afterTokens`, clamped to never be negative. */
  savedTokens: number;
  /** Number of turns newly folded into the durable summary this pass. */
  summarizedTurns: number;
  /** Whether the durable summary text changed this pass. */
  durableSummaryUpdated: boolean;
}

/**
 * The compacted view of a session handed to the next run instead of the full
 * raw history. Built by {@link SessionOptimizer.buildWorkingSet}; tool-call and
 * tool-result messages are always kept together.
 */
export interface WorkingSet {
  /** The compacted message list (system/first + recent window). */
  messages: ChatMessage[];
  /** Rolling durable summary of everything that has aged out. */
  durableSummary: string;
  /** Deterministically-extracted facts that must survive forever. */
  pinnedFacts: string[];
}

/** Tunables governing when and how aggressively a session is compacted. */
export interface Thresholds {
  /** Below this message count `processIncremental` is a no-op. Default `12`. */
  minMessages: number;
  /** Number of most-recent messages always kept verbatim. Default `8`. */
  recentKeep: number;
  /** Hard cap on the durable-summary length (characters). Default `4000`. */
  summaryMaxChars: number;
  /**
   * Whether an LLM may be used to summarise aged-out turns (subject to a budget
   * check). When `false` (the default) summarisation is purely extractive and
   * costs nothing.
   */
  enableLlmSummary: boolean;
}

/** The default {@link Thresholds} applied when none are supplied. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  minMessages: 12,
  recentKeep: 8,
  summaryMaxChars: 4000,
  enableLlmSummary: false,
};

/**
 * The persisted sidecar state for one session, kept under
 * `~/.ultracode/sessions-opt/<id>.json`. The raw session is never mutated; this
 * is the canonical home of the compacted/rolling form.
 */
export interface SessionOptState {
  /** Schema/version marker for forward-compatible migrations. */
  version: 1;
  /** Session id this sidecar belongs to. */
  sessionId: string;
  /**
   * Exclusive upper bound (into the raw `messages` array) of the turns already
   * folded into {@link durableSummary}. Everything `[0, summarizedUpToIndex)`
   * has been summarised; the rolling pass only looks at new, aged-out turns.
   */
  summarizedUpToIndex: number;
  /** Rolling durable summary of everything that has aged out so far. */
  durableSummary: string;
  /** Deterministically-extracted, ever-growing set of pinned facts. */
  pinnedFacts: string[];
  /** ISO-8601 timestamp of the last successful pass. */
  updatedAt: string;
}

/** The implementable session-optimizer surface (see the module factory). */
export interface SessionOptimizer {
  /**
   * Incrementally compact a session after a user turn. Loads the raw record,
   * folds newly aged-out turns into the durable summary, dedupes repeated tool
   * output and refreshes pinned facts, then persists the sidecar. A no-op (with
   * `savedTokens: 0`) when the session is shorter than `minMessages`.
   * Idempotent: a second call with no new messages changes nothing. Never
   * throws — background failures are logged and reported as a zero-saving
   * result.
   */
  processIncremental(sessionId: string): Promise<SessionOptimizationResult>;
  /**
   * Build the compacted {@link WorkingSet} for a loaded record: system/first
   * message + pinned facts + durable summary + the last `recentKeep` messages,
   * never splitting a tool-call/tool-result pair.
   */
  buildWorkingSet(record: import("@ultracode/shared").SessionRecord): WorkingSet;
}
