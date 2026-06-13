/**
 * Core-local authoring events.
 *
 * As with the `tokens` module, the frozen `ultracode-shared` `UltraCodeEvent`
 * union is not extended. Instead the authoring module defines its own event
 * types and a tiny non-throwing emitter that publishes them onto any provided
 * {@link IEventBus} via a structural cast, always falling back to `logger.info`.
 * Subscribers that know the string discriminators can opt in; the shared union
 * stays untouched.
 */

import type { IEventBus, Logger } from "ultracode-shared";

/** Discriminator: a new skill was created. */
export const SKILL_CREATED_EVENT = "skill.created" as const;
/** Discriminator: an existing skill was upgraded. */
export const SKILL_UPDATED_EVENT = "skill.updated" as const;
/** Discriminator: a new agent definition was created. */
export const AGENT_CREATED_EVENT = "agent.created" as const;

/** Payload published when a skill is created. */
export interface SkillCreatedEvent {
  type: typeof SKILL_CREATED_EVENT;
  /** Skill name. */
  name: string;
  /** Catalog the skill belongs to. */
  catalog: string;
  /** Version written. */
  version: string;
}

/** Payload published when a skill is upgraded. */
export interface SkillUpdatedEvent {
  type: typeof SKILL_UPDATED_EVENT;
  /** Skill name. */
  name: string;
  /** Catalog the skill belongs to. */
  catalog: string;
  /** Previous version. */
  fromVersion: string;
  /** New version. */
  toVersion: string;
}

/** Payload published when an agent is created. */
export interface AgentCreatedEvent {
  type: typeof AGENT_CREATED_EVENT;
  /** Agent name. */
  name: string;
}

/** Union of all core-local authoring events. */
export type AuthoringEvent = SkillCreatedEvent | SkillUpdatedEvent | AgentCreatedEvent;

/**
 * Publish an authoring event. Emits structurally onto `events` when present
 * (keeping the shared union frozen) and always logs a one-line summary via
 * `logger`. Never throws.
 *
 * @param event - The authoring event to publish.
 * @param events - Optional event bus.
 * @param logger - Optional logger.
 */
export function emitAuthoringEvent(
  event: AuthoringEvent,
  events: IEventBus | undefined,
  logger: Logger | undefined,
): void {
  try {
    (events as { emit?: (e: unknown) => void } | undefined)?.emit?.(event);
  } catch {
    /* the bus isolates handler errors; belt-and-braces */
  }
  logger?.info(event.type, { ...event });
}
