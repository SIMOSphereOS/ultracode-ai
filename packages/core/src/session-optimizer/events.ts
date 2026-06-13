/**
 * Core-local session-optimization event.
 *
 * As with the `tokens`/`authoring`/`budget` modules, the frozen
 * `ultracode-shared` `UltraCodeEvent` union is **not** extended here. Instead
 * this module defines its own event type and a tiny non-throwing emitter that
 * publishes it onto any provided {@link IEventBus} via a structural cast,
 * always falling back to `logger.info`. Subscribers that know the
 * `"session.optimized"` discriminator can opt in; the shared union stays
 * untouched.
 */

import type { IEventBus, Logger } from "ultracode-shared";

/** Discriminator for the core-local session-optimization event. */
export const SESSION_OPTIMIZED_EVENT = "session.optimized" as const;

/** Payload published after a {@link SessionOptimizer.processIncremental} pass. */
export interface SessionOptimizedEvent {
  type: typeof SESSION_OPTIMIZED_EVENT;
  /** Identifier of the optimized session. */
  sessionId: string;
  /** Estimated tokens of the raw history before compaction. */
  beforeTokens: number;
  /** Estimated tokens of the compacted working set after this pass. */
  afterTokens: number;
  /** `beforeTokens - afterTokens`, never negative. */
  savedTokens: number;
}

/**
 * Publish a session-optimization report. Emits structurally onto `events` when
 * present (keeping the shared union frozen) and always logs a one-line summary
 * via `logger`. Never throws.
 *
 * @param event - The session-optimization event to publish.
 * @param events - Optional event bus.
 * @param logger - Optional logger.
 */
export function emitSessionOptimizedEvent(
  event: SessionOptimizedEvent,
  events: IEventBus | undefined,
  logger: Logger | undefined,
): void {
  try {
    // The shared bus union does not include this core-local event by design;
    // emit it structurally for subscribers that opt in to the string type.
    (events as { emit?: (e: unknown) => void } | undefined)?.emit?.(event);
  } catch {
    /* the bus isolates handler errors; belt-and-braces */
  }
  logger?.info(event.type, {
    sessionId: event.sessionId,
    beforeTokens: event.beforeTokens,
    afterTokens: event.afterTokens,
    savedTokens: event.savedTokens,
  });
}
