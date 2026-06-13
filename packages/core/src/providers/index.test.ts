import { describe, expect, it } from "vitest";
import { ProviderError } from "ultracode-shared";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { LocalProvider } from "./LocalProvider.js";
import { MistralProvider } from "./MistralProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import { createProvider } from "./index.js";
import { testOptions } from "./testkit.test.js";

describe("createProvider", () => {
  it("creates every built-in provider", () => {
    expect(createProvider("mistral", testOptions())).toBeInstanceOf(MistralProvider);
    expect(createProvider("openai", testOptions())).toBeInstanceOf(OpenAIProvider);
    expect(createProvider("anthropic", testOptions())).toBeInstanceOf(AnthropicProvider);
    expect(createProvider("local", testOptions())).toBeInstanceOf(LocalProvider);
  });

  it("exposes the correct provider names", () => {
    expect(createProvider("mistral", testOptions()).name).toBe("mistral");
    expect(createProvider("local", testOptions()).name).toBe("local");
  });

  it("throws a clear ProviderError for unknown providers", () => {
    const err = ((): unknown => {
      try {
        createProvider("skynet", testOptions());
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).provider).toBe("skynet");
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).message).toMatch(/Unknown provider "skynet"/);
  });

  it("throws ProviderError when a keyed provider lacks an apiKey", () => {
    for (const name of ["mistral", "openai", "anthropic"] as const) {
      const options = testOptions();
      delete (options as { apiKey?: string }).apiKey;
      expect(() => createProvider(name, options)).toThrow(ProviderError);
      expect(() => createProvider(name, options)).toThrow(/API key/);
    }
  });

  it("rejects empty/whitespace API keys", () => {
    expect(() => createProvider("openai", testOptions({ apiKey: "   " }))).toThrow(ProviderError);
  });

  it("creates the local provider without any apiKey", () => {
    const options = testOptions();
    delete (options as { apiKey?: string }).apiKey;
    expect(createProvider("local", options)).toBeInstanceOf(LocalProvider);
  });

  it("accepts an injected logger", () => {
    const provider = createProvider("local", {
      ...testOptions(),
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    expect(provider).toBeInstanceOf(LocalProvider);
  });
});
