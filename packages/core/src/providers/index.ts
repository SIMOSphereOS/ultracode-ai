/**
 * `core/providers` — the LLM provider layer.
 *
 * Exposes the four built-in {@link ILLMProvider} implementations (Mistral,
 * OpenAI, Anthropic, local/Ollama), the resilient {@link BaseProvider} HTTP
 * base class, the streaming parsers and the {@link createProvider} factory.
 */

import type {
  ILLMProvider,
  Logger,
  ProviderId,
  ProviderName,
  ProviderOptions,
} from "ultracode-shared";
import { ProviderError } from "ultracode-shared";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { isKeyedProvider, PROVIDER_CATALOG, PROVIDER_IDS } from "./catalog.js";
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
export type { ProviderDescriptor, WireFamily } from "./catalog.js";
export {
  defaultApiKeyEnvVar,
  isKeyedProvider,
  isKnownProvider,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
} from "./catalog.js";
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

/**
 * Constructor per catalog entry. Keyed by {@link ProviderName} so that adding
 * a provider to the catalog without a factory (or vice versa) is a type error;
 * `catalog.test.ts` additionally asserts the runtime `name` of each instance
 * matches its catalog id.
 */
const FACTORIES: Readonly<
  Record<ProviderName, (options: ProviderOptions, logger?: Logger) => ILLMProvider>
> = {
  mistral: (options, logger) => new MistralProvider(options, logger),
  anthropic: (options, logger) => new AnthropicProvider(options, logger),
  openai: (options, logger) => new OpenAIProvider(options, logger),
  local: (options, logger) => new LocalProvider(options, logger),
};

/**
 * Create a built-in LLM provider by name.
 *
 * Driven by {@link PROVIDER_CATALOG}: key requirements and the set of known
 * providers come from the catalog, not from hardcoded lists.
 *
 * @param name - a {@link PROVIDER_IDS} member.
 * @param options - provider options; `logger` is optional.
 * @throws {ProviderError} for an unknown provider name or a missing `apiKey`
 *   on key-requiring providers (`local` needs no key).
 */
export function createProvider(name: ProviderId, options: CreateProviderOptions): ILLMProvider {
  const { logger, ...providerOptions } = options;

  if (isKeyedProvider(name)) {
    const key = providerOptions.apiKey;
    if (key === undefined || key.trim() === "") {
      throw new ProviderError(
        `Provider "${name}" requires an API key (options.apiKey is missing or empty)`,
        { provider: String(name), retryable: false, details: { reason: "missing_api_key" } },
      );
    }
  }

  if (!Object.hasOwn(PROVIDER_CATALOG, name)) {
    throw new ProviderError(
      `Unknown provider "${name}". Known providers: ${PROVIDER_IDS.join(", ")}`,
      { provider: String(name), retryable: false, details: { reason: "unknown_provider" } },
    );
  }
  return FACTORIES[name as ProviderName](providerOptions, logger);
}
