/**
 * `core/providers` — the LLM provider layer.
 *
 * Exposes the four built-in {@link ILLMProvider} implementations (Mistral,
 * OpenAI, Anthropic, local/Ollama), the resilient {@link BaseProvider} HTTP
 * base class, the streaming parsers and the {@link createProvider} factory.
 */

import type { ILLMProvider, Logger, ProviderId, ProviderOptions } from "ultracode-shared";
import { ProviderError } from "ultracode-shared";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { LocalProvider } from "./LocalProvider.js";
import { MistralProvider } from "./MistralProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";

export type { RequestCacheHint } from "./AnthropicProvider.js";
export {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_VERSION,
  AnthropicProvider,
  mapAnthropicStopReason,
  readCacheHint,
  toAnthropicMessages,
  toAnthropicTools,
} from "./AnthropicProvider.js";
export type { ProviderRequestInit } from "./BaseProvider.js";
export { BaseProvider, isRetryableStatus, parseRetryAfter } from "./BaseProvider.js";
export { LocalProvider, OLLAMA_BASE_URL } from "./LocalProvider.js";
export { MISTRAL_BASE_URL, MistralProvider } from "./MistralProvider.js";
export { OPENAI_BASE_URL, OpenAIProvider } from "./OpenAIProvider.js";
export {
  mapOpenAIFinishReason,
  OpenAICompatProvider,
  OpenAIToolCallAssembler,
  readOpenAICacheKey,
  safeParseArgs,
  toOpenAIMessages,
  toOpenAITools,
} from "./openaiCompat.js";
export type { SSEEvent, SSEJsonEvent } from "./sse.js";
export { parseNDJSON, parseSSEEvents, parseSSEJson, streamLines } from "./sse.js";

/** Options accepted by {@link createProvider}. */
export type CreateProviderOptions = ProviderOptions & {
  /** Logger injected into the provider. Defaults to a no-op logger. */
  logger?: Logger;
};

/** Providers that require an `apiKey` to be constructed. */
const KEYED_PROVIDERS = new Set<string>(["mistral", "openai", "anthropic"]);

/**
 * Create a built-in LLM provider by name.
 *
 * @param name - one of `"mistral" | "openai" | "anthropic" | "local"`.
 * @param options - provider options; `logger` is optional.
 * @throws {ProviderError} for an unknown provider name or a missing `apiKey`
 *   on key-requiring providers (`local` needs no key).
 */
export function createProvider(name: ProviderId, options: CreateProviderOptions): ILLMProvider {
  const { logger, ...providerOptions } = options;

  if (KEYED_PROVIDERS.has(name)) {
    const key = providerOptions.apiKey;
    if (key === undefined || key.trim() === "") {
      throw new ProviderError(
        `Provider "${name}" requires an API key (options.apiKey is missing or empty)`,
        { provider: String(name), retryable: false, details: { reason: "missing_api_key" } },
      );
    }
  }

  switch (name) {
    case "mistral":
      return new MistralProvider(providerOptions, logger);
    case "openai":
      return new OpenAIProvider(providerOptions, logger);
    case "anthropic":
      return new AnthropicProvider(providerOptions, logger);
    case "local":
      return new LocalProvider(providerOptions, logger);
    default:
      throw new ProviderError(
        `Unknown provider "${name}". Known providers: mistral, openai, anthropic, local`,
        { provider: String(name), retryable: false, details: { reason: "unknown_provider" } },
      );
  }
}
