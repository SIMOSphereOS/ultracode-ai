/**
 * Declarative provider catalog — the single source of truth for the built-in
 * LLM providers.
 *
 * Everything that used to be scattered across four places (the
 * `createProvider` switch, the `KEYED_PROVIDERS` set, the `API_KEY_VARS`
 * env-mapping and the per-provider base-URL constants) is described here once.
 * The factory (`index.ts`) and the env loader (`config/env.ts`) derive their
 * behaviour from this record, and `catalog.test.ts` asserts that the catalog,
 * the factory and the `ProviderName` union cannot drift apart: adding a
 * provider without registering it everywhere fails the contract test instead
 * of silently mis-routing.
 */

import type { ProviderName } from "ultracode-shared";
import { ANTHROPIC_BASE_URL } from "./AnthropicProvider.js";
import { OLLAMA_BASE_URL } from "./LocalProvider.js";
import { MISTRAL_BASE_URL } from "./MistralProvider.js";
import { OPENAI_BASE_URL } from "./OpenAIProvider.js";

/** Wire protocol family a provider speaks. */
export type WireFamily = "openai-chat" | "anthropic-messages" | "ollama";

/** Declarative description of one built-in provider. */
export interface ProviderDescriptor {
  /** Canonical provider id (matches `ILLMProvider.name`). */
  readonly id: ProviderName;
  /** Human-readable label for docs/CLI output. */
  readonly label: string;
  /** Wire protocol family (decides the transport implementation). */
  readonly wire: WireFamily;
  /** Whether the provider requires an `apiKey` to be constructed. */
  readonly keyed: boolean;
  /**
   * Environment variable holding the API key. Must follow the
   * `<PROVIDER>_API_KEY` convention used by the config env-loader and the
   * facade's fallback resolution. `undefined` for key-less providers.
   */
  readonly apiKeyEnvVar?: string;
  /** Default base URL when `options.baseUrl` is not set. */
  readonly defaultBaseUrl: string;
}

/** The catalog. Keyed by {@link ProviderName} so a missing entry is a type error. */
export const PROVIDER_CATALOG: Readonly<Record<ProviderName, ProviderDescriptor>> = {
  mistral: {
    id: "mistral",
    label: "Mistral",
    wire: "openai-chat",
    keyed: true,
    apiKeyEnvVar: "MISTRAL_API_KEY",
    defaultBaseUrl: MISTRAL_BASE_URL,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    wire: "anthropic-messages",
    keyed: true,
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    defaultBaseUrl: ANTHROPIC_BASE_URL,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    wire: "openai-chat",
    keyed: true,
    apiKeyEnvVar: "OPENAI_API_KEY",
    defaultBaseUrl: OPENAI_BASE_URL,
  },
  local: {
    id: "local",
    label: "Ollama (local)",
    wire: "ollama",
    keyed: false,
    defaultBaseUrl: OLLAMA_BASE_URL,
  },
};

/** All built-in provider ids, in catalog order. */
export const PROVIDER_IDS: readonly ProviderName[] = Object.keys(
  PROVIDER_CATALOG,
) as ProviderName[];

/** Whether `id` names a built-in provider. */
export function isKnownProvider(id: string): id is ProviderName {
  return Object.hasOwn(PROVIDER_CATALOG, id);
}

/** Whether `id` names a built-in provider that requires an API key. */
export function isKeyedProvider(id: string): boolean {
  return isKnownProvider(id) && PROVIDER_CATALOG[id].keyed;
}
