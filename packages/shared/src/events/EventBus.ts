/**
 * Concrete {@link IEventBus} implementation.
 *
 * Design notes:
 * - **Handler isolation:** a throwing handler is caught so it cannot prevent
 *   sibling handlers from running. Caught errors are reported via an optional
 *   `onHandlerError` callback (defaulting to `console.error`).
 * - **Safe mutation during emit:** `emit` iterates over a snapshot of the
 *   handler set, so subscribing/unsubscribing from within a handler does not
 *   disturb the in-flight dispatch and never throws.
 */

import type {
  EventHandler,
  IEventBus,
  UltraCodeEvent,
  UltraCodeEventType,
} from "../types/events.js";

/** Options for {@link EventBus}. */
export interface EventBusOptions {
  /**
   * Invoked when a handler throws. Receives the thrown value and the event that
   * was being dispatched. Defaults to logging via `console.error`. This callback
   * is itself wrapped so that a throwing reporter cannot break dispatch.
   */
  onHandlerError?: (error: unknown, event: UltraCodeEvent) => void;
}

/** Generic handler signature stored internally (variance erased). */
type AnyHandler = (event: UltraCodeEvent) => void;

export class EventBus implements IEventBus {
  /** Per-type subscriber sets. A `Set` gives O(1) add/remove and dedupes. */
  private readonly handlers = new Map<UltraCodeEventType, Set<AnyHandler>>();
  private readonly onHandlerError: (error: unknown, event: UltraCodeEvent) => void;

  constructor(options: EventBusOptions = {}) {
    this.onHandlerError =
      options.onHandlerError ??
      ((error, event): void => {
        // Default reporter; never throws.
        console.error(`[EventBus] handler for "${event.type}" threw:`, error);
      });
  }

  on<T extends UltraCodeEventType>(type: T, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (set === undefined) {
      set = new Set<AnyHandler>();
      this.handlers.set(type, set);
    }
    // Safe: EventHandler<T> is invoked only with EventOfType<T> values, which
    // `emit` guarantees by routing on the event's own discriminator.
    const erased = handler as AnyHandler;
    set.add(erased);

    let active = true;
    return (): void => {
      if (!active) return; // idempotent unsubscribe
      active = false;
      const current = this.handlers.get(type);
      if (current === undefined) return;
      current.delete(erased);
      if (current.size === 0) this.handlers.delete(type);
    };
  }

  emit(event: UltraCodeEvent): void {
    const set = this.handlers.get(event.type);
    if (set === undefined || set.size === 0) return;
    // Snapshot so unsubscribe/subscribe during dispatch is safe and predictable.
    const snapshot = Array.from(set);
    for (const handler of snapshot) {
      try {
        handler(event);
      } catch (error) {
        this.reportSafely(error, event);
      }
    }
  }

  /** Number of subscribers for a given event type (useful for tests/diagnostics). */
  listenerCount(type: UltraCodeEventType): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  /** Remove all subscribers, optionally for a single event type. */
  removeAll(type?: UltraCodeEventType): void {
    if (type === undefined) this.handlers.clear();
    else this.handlers.delete(type);
  }

  /** Invoke the error reporter without ever letting it throw. */
  private reportSafely(error: unknown, event: UltraCodeEvent): void {
    try {
      this.onHandlerError(error, event);
    } catch {
      /* a throwing reporter must not break dispatch */
    }
  }
}
