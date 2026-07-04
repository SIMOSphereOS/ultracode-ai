/**
 * Custom, user-configured OpenAI-compatible provider.
 *
 * Closes the "custom / OpenAI-compatible endpoint" gap: any backend that speaks
 * the OpenAI `chat/completions` wire format — OpenRouter, LM Studio, vLLM,
 * llama.cpp, self-hosted gateways — can be reached by pointing a user-chosen
 * provider id at its base URL. Unlike the four built-in providers this one has
 * NO {@link import("./catalog.js").PROVIDER_CATALOG} entry: its identity
 * (`name`) and its `baseUrl` are supplied at construction time, so a single
 * class serves arbitrarily many user-defined backends.
 *
 * Instantiated by {@link import("./index.js").createProvider} when the requested
 * provider id is not a built-in catalog entry but a non-empty `baseUrl` is
 * supplied. An API key is optional (local backends such as LM Studio need
 * none); when present it is sent as a bearer token exactly like the OpenAI
 * provider, since all wire logic is inherited from {@link OpenAICompatProvider}.
 */

import type { Logger, ProviderId, ProviderOptions } from "ultracode-shared";
import { OpenAICompatProvider } from "./openaiCompat.js";

/** LLM provider for an arbitrary OpenAI-compatible backend. */
export class CustomProvider extends OpenAICompatProvider {
  public readonly name: ProviderId;

  /**
   * @param name - the user-configured provider id (also the runtime `name`).
   * @param options - provider options; `options.baseUrl` is REQUIRED for a
   *   custom backend (there is no catalog default to fall back to). The factory
   *   only routes here once a non-empty `baseUrl` is present.
   * @param logger - optional structured logger.
   */
  constructor(name: ProviderId, options: ProviderOptions, logger?: Logger) {
    // The empty-string fallback is never effective: `createProvider` guarantees
    // a non-empty `options.baseUrl` before constructing a CustomProvider.
    super(options, options.baseUrl ?? "", logger);
    this.name = name;
  }
}
