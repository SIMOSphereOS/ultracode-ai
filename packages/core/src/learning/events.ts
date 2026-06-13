/**
 * Core-local learning lifecycle events.
 *
 * The frozen `ultracode-shared` `UltraCodeEvent` union is 1.0 and not extended
 * here. Following the `tokens` module's pattern, we declare separate core-local
 * event types and a tiny non-throwing emitter that publishes them onto any
 * provided {@link IEventBus} via a structural cast, falling back to
 * `logger.info` when no bus is available.
 */

import type { IEventBus, Logger } from "ultracode-shared";
import type { CostEstimate, LearnRunPlan, LearnRunReport } from "./types.js";

/** Discriminator: a learn run has begun. */
export const LEARN_STARTED_EVENT = "learn.started" as const;
/** Discriminator: a learn plan (cost estimate) was produced. */
export const LEARN_ESTIMATED_EVENT = "learn.estimated" as const;
/** Discriminator: a learn run finished (success or hard-stop). */
export const LEARN_COMPLETED_EVENT = "learn.completed" as const;

/** Emitted at the start of {@link LearnAgent.run}. */
export interface LearnStartedEvent {
  type: typeof LEARN_STARTED_EVENT;
  /** Source id being processed. */
  sourceId: string;
  /** Candidate page count. */
  candidatePages: number;
  /** ISO-8601 start timestamp. */
  startedAt: string;
}

/** Emitted by {@link LearnAgent.plan} once an estimate exists. */
export interface LearnEstimatedEvent {
  type: typeof LEARN_ESTIMATED_EVENT;
  /** Source id. */
  sourceId: string;
  /** Candidate page count. */
  candidatePages: number;
  /** USD midpoint of the estimate. */
  estimatedUsd: number;
  /** The full estimate. */
  estimate: CostEstimate;
}

/** Emitted when a run completes. */
export interface LearnCompletedEvent {
  type: typeof LEARN_COMPLETED_EVENT;
  /** Source id. */
  sourceId: string;
  /** The run report. */
  report: LearnRunReport;
}

/** Union of all core-local learning events. */
export type LearningEvent = LearnStartedEvent | LearnEstimatedEvent | LearnCompletedEvent;

/** Publish `event` on `events` (structural cast) and mirror to `logger`. Never throws. */
export function emitLearningEvent(
  event: LearningEvent,
  events: IEventBus | undefined,
  logger: Logger | undefined,
): void {
  try {
    (events as { emit?: (e: unknown) => void } | undefined)?.emit?.(event);
  } catch {
    /* the bus isolates handler errors; belt-and-braces */
  }
  logger?.info(event.type, summarize(event));
}

/** Build the `learn.started` event. */
export function startedEvent(plan: LearnRunPlan, startedAt: string): LearnStartedEvent {
  return {
    type: LEARN_STARTED_EVENT,
    sourceId: plan.sourceId,
    candidatePages: plan.candidatePages.length,
    startedAt,
  };
}

/** Build the `learn.estimated` event. */
export function estimatedEvent(plan: LearnRunPlan): LearnEstimatedEvent {
  const mid = (plan.estimate.usdLow + plan.estimate.usdHigh) / 2;
  return {
    type: LEARN_ESTIMATED_EVENT,
    sourceId: plan.sourceId,
    candidatePages: plan.candidatePages.length,
    estimatedUsd: mid,
    estimate: plan.estimate,
  };
}

/** Build the `learn.completed` event. */
export function completedEvent(report: LearnRunReport): LearnCompletedEvent {
  return { type: LEARN_COMPLETED_EVENT, sourceId: report.sourceId, report };
}

/** Reduce an event to a small log-friendly meta object. */
function summarize(event: LearningEvent): Record<string, unknown> {
  switch (event.type) {
    case LEARN_STARTED_EVENT:
      return { sourceId: event.sourceId, candidatePages: event.candidatePages };
    case LEARN_ESTIMATED_EVENT:
      return { sourceId: event.sourceId, estimatedUsd: event.estimatedUsd };
    case LEARN_COMPLETED_EVENT:
      return {
        sourceId: event.sourceId,
        processed: event.report.processed,
        actualUsd: event.report.actualUsd,
      };
  }
}
