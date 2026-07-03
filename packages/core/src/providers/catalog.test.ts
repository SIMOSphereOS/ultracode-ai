/**
 * Contract tests for the declarative provider catalog.
 *
 * These assert that the catalog, the `createProvider` factory, the
 * `ProviderName` union and the env-var key mapping cannot drift apart —
 * adding a provider in one place but not the others fails here instead of
 * silently mis-routing at runtime.
 */

import { describe, expect, it } from "vitest";
import { envToOverlay } from "../config/env.js";
import { isKeyedProvider, isKnownProvider, PROVIDER_CATALOG, PROVIDER_IDS } from "./catalog.js";
import { createProvider } from "./index.js";

const DUMMY_OPTIONS = { timeoutMs: 1000, maxRetries: 0, retryDelayMs: 1 };

describe("provider catalog contract", () => {
  it("covers exactly the built-in ProviderName union members", () => {
    expect([...PROVIDER_IDS].sort()).toEqual(["anthropic", "local", "mistral", "openai"]);
  });

  it("constructs every catalog entry via createProvider with a matching runtime name", () => {
    for (const descriptor of Object.values(PROVIDER_CATALOG)) {
      const provider = createProvider(descriptor.id, {
        ...DUMMY_OPTIONS,
        apiKey: descriptor.keyed ? "test-key" : undefined,
      });
      expect(provider.name).toBe(descriptor.id);
    }
  });

  it("enforces the keyed flag: keyed providers throw without apiKey, key-less do not", () => {
    for (const descriptor of Object.values(PROVIDER_CATALOG)) {
      if (descriptor.keyed) {
        expect(() => createProvider(descriptor.id, { ...DUMMY_OPTIONS })).toThrowError(
          /requires an API key/,
        );
      } else {
        expect(() => createProvider(descriptor.id, { ...DUMMY_OPTIONS })).not.toThrow();
      }
    }
  });

  it("pairs keyed with apiKeyEnvVar and follows the <PROVIDER>_API_KEY convention", () => {
    for (const descriptor of Object.values(PROVIDER_CATALOG)) {
      if (descriptor.keyed) {
        // Same convention as the facade's apiKeyEnvVar() fallback resolution.
        expect(descriptor.apiKeyEnvVar).toBe(
          `${descriptor.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`,
        );
      } else {
        expect(descriptor.apiKeyEnvVar).toBeUndefined();
      }
    }
  });

  it("declares a non-empty default base URL for every provider", () => {
    for (const descriptor of Object.values(PROVIDER_CATALOG)) {
      expect(descriptor.defaultBaseUrl).toMatch(/^https?:\/\//);
    }
  });

  it("maps every keyed provider's env var into providers.apiKeys via envToOverlay", () => {
    const env: Record<string, string> = {};
    for (const descriptor of Object.values(PROVIDER_CATALOG)) {
      if (descriptor.keyed && descriptor.apiKeyEnvVar) {
        env[descriptor.apiKeyEnvVar] = `key-${descriptor.id}`;
      }
    }
    const overlay = envToOverlay(env, () => {});
    const apiKeys = (overlay.providers as { apiKeys?: Record<string, string> } | undefined)
      ?.apiKeys;
    for (const descriptor of Object.values(PROVIDER_CATALOG)) {
      if (descriptor.keyed) {
        expect(apiKeys?.[descriptor.id]).toBe(`key-${descriptor.id}`);
      }
    }
  });

  it("exposes coherent helper guards", () => {
    expect(isKnownProvider("anthropic")).toBe(true);
    expect(isKnownProvider("nope")).toBe(false);
    expect(isKeyedProvider("openai")).toBe(true);
    expect(isKeyedProvider("local")).toBe(false);
    expect(isKeyedProvider("nope")).toBe(false);
  });
});
