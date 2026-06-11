/**
 * Agent contracts.
 *
 * An agent is a configured orchestration loop: it pairs a system prompt and a
 * model/provider with a permitted tool set, and turns a user prompt into a
 * final answer (driving the provider/tool loop internally).
 */

import type { ProviderId, TokenUsage } from "./provider.js";

/** Lifecycle/role classification of an agent. */
export type AgentType = "default" | "subagent" | "specialized" | "custom";

/**
 * Static definition of an agent. `enabledTools`/`disabledTools` are resolved
 * against the global tool registry; `enabledTools` (when present) acts as an
 * allow-list that overrides `disabledTools`.
 */
export interface AgentDefinition {
  /** Unique agent name (e.g. `"build"`, `"review"`). */
  name: string;
  /** One-line description of the agent's purpose. */
  description: string;
  /** Agent classification. */
  type: AgentType;
  /** Model override; falls back to the active model when omitted. */
  model?: string;
  /** Provider override; falls back to the active provider when omitted. */
  provider?: ProviderId;
  /** Identifier of the system prompt to load (e.g. `"security"`). */
  systemPromptId?: string;
  /** Allow-list of tool names; overrides {@link AgentDefinition.disabledTools}. */
  enabledTools?: string[];
  /** Deny-list of tool names. */
  disabledTools?: string[];
}

/** Input to a single agent run. */
export interface AgentRunInput {
  /** The user's prompt/instruction. */
  prompt: string;
  /** Existing session to continue; a new session is created when omitted. */
  sessionId?: string;
  /** Cancellation signal for the whole run. */
  signal?: AbortSignal;
}

/** Aggregated outcome of an agent run. */
export interface AgentRunResult {
  /** Final assistant text presented to the user. */
  text: string;
  /** Number of tool executions performed across all turns. */
  toolCallsExecuted: number;
  /** Cumulative token usage across all model calls in the run. */
  usage: TokenUsage;
  /** Number of model turns taken. */
  turns: number;
}

/**
 * The implementable agent interface.
 *
 * Contract: `run` resolves with an {@link AgentRunResult} on success and
 * rejects with an {@link import("../errors.js").AgentError} on unrecoverable
 * failure. Cancellation via {@link AgentRunInput.signal} should reject with an
 * abort-derived error.
 */
export interface IAgent {
  /** Static definition of this agent. */
  readonly definition: AgentDefinition;
  /** Execute the agent against the given input. */
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
