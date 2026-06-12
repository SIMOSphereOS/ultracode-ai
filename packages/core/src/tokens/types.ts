/**
 * Core-local types for the token-optimization module.
 *
 * These types deliberately live in `core/tokens` and are **not** part of the
 * frozen `@ultracode/shared` 1.0 contract. They model a prompt as four
 * separately-measurable parts so the optimizer can report *where* tokens were
 * spent and saved.
 */

import type { ChatMessage, ToolDefinition } from "@ultracode/shared";
import type { TokenCounter } from "./TokenCounter.js";

/**
 * A prompt broken into its four budgetable parts.
 *
 * The split mirrors the provider wire format: a (mostly static) system prompt,
 * the tool schemas, the (variable) message history, and an optional injected
 * project/file context block. Keeping them separate lets stages target the
 * right part and lets {@link TokenStats} attribute spend honestly.
 */
export interface PromptPayload {
  /** System prompt / persona / instructions. Often the most static part. */
  system: string;
  /** Tool definitions exposed to the model this turn. */
  tools: ToolDefinition[];
  /** Ordered conversation history (excluding the system prompt). */
  messages: ChatMessage[];
  /** Optional injected context (project/file context). */
  context?: string;
}

/** Per-part and total token counts for a {@link PromptPayload}. */
export interface TokenStats {
  /** Tokens attributed to {@link PromptPayload.system}. */
  system: number;
  /** Tokens attributed to {@link PromptPayload.tools}. */
  tools: number;
  /** Tokens attributed to {@link PromptPayload.messages}. */
  messages: number;
  /** Tokens attributed to {@link PromptPayload.context} (`0` when absent). */
  context: number;
  /** Sum of the four parts above. */
  total: number;
}

/**
 * Read-only context handed to every {@link OptimizerStage}.
 *
 * Stages are pure functions of `(payload, ctx)`; everything they might need
 * beyond the payload itself (the counter, the active user prompt for relevance
 * decisions, a logger) arrives here. Stages MUST NOT mutate the context.
 */
export interface OptimizeContext {
  /** Token counter used for any internal budget decisions. */
  readonly counter: TokenCounter;
  /**
   * The current user prompt (last user turn), when known. Stages such as tool
   * selection can use it to decide relevance. Optional and advisory.
   */
  readonly prompt?: string;
  /**
   * Token budget for the whole payload. Stages that only act *over budget*
   * (e.g. conversation compaction) consult this; `undefined` means "no budget
   * pressure — apply only lossless transforms".
   */
  readonly tokenBudget?: number;
}

/**
 * A single, composable, deterministic prompt transformation.
 *
 * Contract:
 * - **Pure**: `apply` returns a *new* payload (or the same reference when it
 *   changes nothing); it never mutates its input or `ctx`.
 * - **Deterministic**: equal inputs → equal output.
 * - **Idempotent where possible**: applying a stage twice SHOULD equal applying
 *   it once (the lossless stages here are; compaction converges).
 * - **Honest**: a stage never claims a saving it did not make. The optimizer
 *   measures around it; a no-op stage simply yields `saved: 0`.
 */
export interface OptimizerStage {
  /** Stable, human-readable stage identifier (used in the per-stage report). */
  readonly name: string;
  /** Transform `p` under `ctx`, returning the new payload. */
  apply(p: PromptPayload, ctx: OptimizeContext): PromptPayload;
}

/**
 * Provider-agnostic hint that a stable prompt *prefix* exists and may be
 * cached by the backend.
 *
 * Caching is the single largest *real* cost lever (providers bill cached
 * prefix reads at a fraction of fresh input tokens). The rule encoded here is:
 * **"static first, variable last; put the breakpoint on the last stable
 * block."** The system prompt and tool schemas are the stable prefix; message
 * history is the variable suffix.
 *
 * This is a pure data hint: providers that understand it set the appropriate
 * wire field; providers that do not ignore it. With no hint, every provider
 * emits its exact pre-existing wire format.
 */
export interface CacheHint {
  /**
   * Mark the stable prefix (system + tools) as cacheable. When `true`, an
   * Anthropic provider sets `cache_control: { type: "ephemeral" }` on the last
   * stable block; an OpenAI/Mistral provider sets a stable `prompt_cache_key`.
   */
  readonly cachePrefix: boolean;
  /**
   * Optional explicit cache key (stable hash of the prefix). When omitted, the
   * provider derives one. Used as `prompt_cache_key` on OpenAI-compatible APIs.
   */
  readonly key?: string;
}
