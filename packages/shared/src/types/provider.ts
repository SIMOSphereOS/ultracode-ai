/**
 * LLM provider contracts.
 *
 * Providers are the integration boundary to a model backend (Mistral,
 * Anthropic, OpenAI, local). Unlike tools, **providers throw on failure** —
 * specifically {@link ProviderError} (with `retryable` set appropriately) — so
 * the execution engine can apply retry/backoff policy.
 */

import type { ToolDefinition } from "./tool.js";

/** Well-known provider identifiers. */
export type ProviderName = "mistral" | "anthropic" | "openai" | "local";

/**
 * A provider identifier. Accepts the well-known {@link ProviderName} values
 * while remaining open to custom backends via the `string & {}` trick (which
 * preserves literal autocompletion without collapsing to `string`).
 */
export type ProviderId = ProviderName | (string & {});

/** Role of a message in a chat completion. */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A model's request to invoke a tool, emitted as part of a completion. */
export interface ToolCallRequest {
  /** Provider-assigned identifier correlating the call with its result. */
  id: string;
  /** Name of the tool to invoke. */
  name: string;
  /** Parsed arguments object for the tool. */
  arguments: Record<string, unknown>;
}

/** A single message in a conversation. */
export interface ChatMessage {
  /** Message role. */
  role: ChatRole;
  /** Textual content. May be empty for assistant turns that only call tools. */
  content: string;
  /** For assistant messages: tool calls requested this turn. */
  toolCalls?: ToolCallRequest[];
  /** For `role: "tool"` messages: the {@link ToolCallRequest.id} being answered. */
  toolCallId?: string;
  /** Optional speaker/tool name (provider-specific addressing). */
  name?: string;
}

/** Token accounting for a completion. */
export interface TokenUsage {
  /** Tokens consumed by the prompt. */
  inputTokens: number;
  /** Tokens produced by the model. */
  outputTokens: number;
}

/** A request for a (streaming or non-streaming) chat completion. */
export interface CompletionRequest {
  /** Ordered conversation history. */
  messages: ChatMessage[];
  /** Target model identifier. */
  model: string;
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  /** Sampling temperature, typically `0.0`–`1.0`. */
  temperature?: number;
  /** Tool definitions exposed to the model for this turn. */
  tools?: ToolDefinition[];
  /** Cancellation signal for the in-flight request. */
  signal?: AbortSignal;
}

/** A single chunk emitted by {@link ILLMProvider.stream}. */
export interface CompletionChunk {
  /**
   * Chunk discriminator:
   * - `"text"`      — incremental assistant text in `text`.
   * - `"tool_call"` — a (possibly partial) tool call in `toolCall`.
   * - `"done"`      — terminal chunk; `usage` is populated.
   */
  type: "text" | "tool_call" | "done";
  /** Present for `type: "text"`. */
  text?: string;
  /** Present for `type: "tool_call"`. */
  toolCall?: ToolCallRequest;
  /** Present for `type: "done"`. */
  usage?: TokenUsage;
}

/** Reason a completion finished. */
export type FinishReason = "stop" | "tool_calls" | "length" | "error";

/** Aggregated result of a non-streaming completion. */
export interface CompletionResult {
  /** Full assistant text. */
  text: string;
  /** Tool calls requested by the model (empty when none). */
  toolCalls: ToolCallRequest[];
  /** Token accounting for the call. */
  usage: TokenUsage;
  /** Why generation stopped. */
  finishReason: FinishReason;
}

/**
 * The implementable provider interface.
 *
 * Contract:
 * - All async methods **throw {@link ProviderError}** on failure; transient
 *   failures set `retryable: true`.
 * - `stream` yields {@link CompletionChunk}s and terminates with a `"done"`
 *   chunk carrying {@link TokenUsage}.
 * - `healthCheck` resolves `false` (rather than throwing) for a reachable but
 *   unhealthy backend; it may throw for hard configuration errors.
 */
export interface ILLMProvider {
  /** Stable provider identifier. */
  readonly name: ProviderId;
  /** List model identifiers available from this provider. */
  listModels(): Promise<string[]>;
  /** Run a non-streaming completion. */
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Run a streaming completion. */
  stream(req: CompletionRequest): AsyncIterable<CompletionChunk>;
  /** Lightweight liveness/auth probe. */
  healthCheck(): Promise<boolean>;
}

/** Construction options shared by provider implementations. */
export interface ProviderOptions {
  /** API key/credential. Often injected from the environment, not config. */
  apiKey?: string;
  /** Override base URL for self-hosted/proxy endpoints. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  /** Maximum retry attempts for retryable failures. */
  maxRetries: number;
  /** Base delay between retries in milliseconds (subject to backoff). */
  retryDelayMs: number;
}
