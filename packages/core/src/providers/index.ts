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
import { CustomProvider } from "./CustomProvider.js";
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
export { CustomProvider } from "./CustomProvider.js";
export type { ProviderDescriptor, WireFamily } from "./catalog.js";
export {
  defaultApiKeyEnvVar,
  defaultBaseUrlEnvVar,
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
 * A provider id that is NOT a built-in catalog entry is treated as a **custom,
 * user-configured OpenAI-compatible backend** (OpenRouter, LM Studio, vLLM,
 * self-hosted gateways): it is instantiated as a {@link CustomProvider} as long
 * as `options.baseUrl` names its endpoint. Without a `baseUrl` there is nowhere
 * to send requests, so the id is genuinely unknown and rejected.
 *
 * @param name - a {@link PROVIDER_IDS} member, or a custom id paired with a
 *   `baseUrl`.
 * @param options - provider options; `logger` is optional.
 * @throws {ProviderError} for a missing `apiKey` on key-requiring built-ins
 *   (`local` needs no key), or for an unknown id without a `baseUrl`.
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

  if (Object.hasOwn(PROVIDER_CATALOG, name)) {
    return FACTORIES[name as ProviderName](providerOptions, logger);
  }

  // Not a built-in: a custom OpenAI-compatible backend, allowed once it names
  // its own endpoint. A key is optional here (local gateways need none), so no
  // key check applies. Custom providers deliberately carry no catalog entry.
  const baseUrl = providerOptions.baseUrl;
  if (typeof baseUrl === "string" && baseUrl.trim() !== "") {
    return new CustomProvider(name, providerOptions, logger);
  }

  throw new ProviderError(
    `Unknown provider "${name}". Known providers: ${PROVIDER_IDS.join(", ")}. ` +
      `For a custom OpenAI-compatible backend, configure its base URL ` +
      `(e.g. ${name
        .toString()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")}_BASE_URL).`,
    { provider: String(name), retryable: false, details: { reason: "unknown_provider" } },
  );
}
