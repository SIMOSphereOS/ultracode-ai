/**
 * Core-local token-optimization reporting event.
 *
 * The frozen `ultracode-shared` `UltraCodeEvent` union is 1.0 and not
 * extended here. Instead we define a *separate*, core-local event type and a
 * tiny emitter that publishes it onto any provided {@link IEventBus} via a
 * loosely-typed cast, falling back to `logger.info` when no bus is available.
 * Subscribers that know the `"tokens.optimized"` type can listen for it; the
 * shared union is untouched, so nothing existing breaks.
 */

import type { IEventBus, Logger } from "ultracode-shared";
import type { OptimizeResult } from "./TokenOptimizer.js";
import { TOKENS_OPTIMIZED_EVENT } from "./defaults.js";

export { TOKENS_OPTIMIZED_EVENT };

/** Payload published after a {@link TokenOptimizer.optimize} pass. */
export interface TokensOptimizedEvent {
  type: typeof TOKENS_OPTIMIZED_EVENT;
  /** Total tokens before optimization. */
  before: number;
  /** Total tokens after optimization. */
  after: number;
  /** Overall reduction percentage (one decimal). */
  reductionPct: number;
  /** Per-stage savings. */
  perStage: ReadonlyArray<{ stage: string; saved: number }>;
}

/** Build a {@link TokensOptimizedEvent} from an {@link OptimizeResult}. */
export function toTokensOptimizedEvent(result: OptimizeResult): TokensOptimizedEvent {
  return {
    type: TOKENS_OPTIMIZED_EVENT,
    before: result.before.total,
    after: result.after.total,
    reductionPct: result.reductionPct,
    perStage: result.perStage.map((s) => ({ stage: s.stage, saved: s.saved })),
  };
}

/**
 * Publish a token-optimization report.
 *
 * Emits the core-local {@link TokensOptimizedEvent} on `events` when present
 * (using a structural cast so the shared union stays frozen), and always logs a
 * one-line summary via `logger`. Never throws.
 */
export function reportOptimization(
  result: OptimizeResult,
  events: IEventBus | undefined,
  logger: Logger | undefined,
): void {
  const event = toTokensOptimizedEvent(result);
  try {
    // The shared bus union does not include this core-local event by design;
    // emit it structurally for subscribers that opt in to the string type.
    (events as { emit?: (e: unknown) => void } | undefined)?.emit?.(event);
  } catch {
    /* the bus isolates handler errors; belt-and-braces */
  }
  logger?.info("tokens.optimized", {
    before: event.before,
    after: event.after,
    reductionPct: event.reductionPct,
  });
}
