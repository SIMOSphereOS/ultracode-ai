/**
 * Event-bus contracts.
 *
 * UltraCode is event-driven: subsystems publish typed {@link UltraCodeEvent}s
 * onto an {@link IEventBus}. Events are a discriminated union keyed by `type`.
 * The concrete {@link import("../events/EventBus.js").EventBus} implementation
 * isolates handler failures so one bad subscriber cannot break others.
 */

import type { SerializedError } from "../errors.js";
import type { VersionSuggestion } from "./versioning.js";

/** A tool finished executing. */
export interface ToolExecutedEvent {
  type: "tool.executed";
  /** Name of the executed tool. */
  toolName: string;
  /** Whether the execution succeeded. */
  ok: boolean;
  /** Execution wall-clock time in milliseconds. */
  durationMs: number;
}

/** The active agent changed. */
export interface AgentSwitchedEvent {
  type: "agent.switched";
  /** Previous agent name (`null` at startup). */
  from: string | null;
  /** New agent name. */
  to: string;
}

/** A session started. */
export interface SessionStartedEvent {
  type: "session.started";
  /** Identifier of the started session. */
  sessionId: string;
}

/** A session ended. */
export interface SessionEndedEvent {
  type: "session.ended";
  /** Identifier of the ended session. */
  sessionId: string;
}

/** An error occurred somewhere in the pipeline. */
export interface ErrorEvent {
  type: "error";
  /** The serialised error. */
  error: SerializedError;
}

/** A version was suggested by the versioning engine. */
export interface VersionSuggestedEvent {
  type: "version.suggested";
  /** The suggestion produced. */
  suggestion: VersionSuggestion;
}

/** The full event union published on the bus. */
export type UltraCodeEvent =
  | ToolExecutedEvent
  | AgentSwitchedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | ErrorEvent
  | VersionSuggestedEvent;

/** Discriminator literal of any {@link UltraCodeEvent}. */
export type UltraCodeEventType = UltraCodeEvent["type"];

/** Narrow an event to its concrete shape by `type`. */
export type EventOfType<T extends UltraCodeEventType> = Extract<UltraCodeEvent, { type: T }>;

/** Handler for a specific event type. */
export type EventHandler<T extends UltraCodeEventType> = (event: EventOfType<T>) => void;

/**
 * The event-bus interface.
 *
 * Contract:
 * - `emit` synchronously invokes all subscribers for the event's `type`; a
 *   throwing handler must not prevent other handlers from running.
 * - `on` returns an unsubscribe function that is safe to call at any time,
 *   including from within a handler during an active `emit`.
 */
export interface IEventBus {
  /** Publish an event to all matching subscribers. */
  emit(event: UltraCodeEvent): void;
  /** Subscribe to a specific event type; returns an unsubscribe function. */
  on<T extends UltraCodeEventType>(type: T, handler: EventHandler<T>): () => void;
}
