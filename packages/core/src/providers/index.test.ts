import { ProviderError } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { CustomProvider } from "./CustomProvider.js";
import { createProvider } from "./index.js";
import { LocalProvider } from "./LocalProvider.js";
import { MistralProvider } from "./MistralProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import { jsonResponse, stubFetchSequence, testOptions } from "./testkit.test.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe("createProvider — custom OpenAI-compatible backend", () => {
  it("instantiates a CustomProvider for an unknown id that supplies a baseUrl", () => {
    const provider = createProvider(
      "openrouter",
      testOptions({ baseUrl: "https://openrouter.ai/api/v1" }),
    );
    expect(provider).toBeInstanceOf(CustomProvider);
    expect(provider.name).toBe("openrouter");
  });

  it("does not require an apiKey for a custom backend (e.g. local LM Studio)", () => {
    const options = testOptions({ baseUrl: "http://localhost:1234/v1" });
    delete (options as { apiKey?: string }).apiKey;
    const provider = createProvider("lmstudio", options);
    expect(provider).toBeInstanceOf(CustomProvider);
    expect(provider.name).toBe("lmstudio");
  });

  it("still throws for an unknown id WITHOUT a baseUrl (no endpoint to reach)", () => {
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
    expect((err as ProviderError).message).toMatch(/Unknown provider "skynet"/);
    // The message points the user at the custom-backend base-URL convention.
    expect((err as ProviderError).message).toMatch(/SKYNET_BASE_URL/);
  });

  it("treats a blank baseUrl as no endpoint and rejects the unknown id", () => {
    expect(() => createProvider("ghost", testOptions({ baseUrl: "   " }))).toThrow(ProviderError);
  });

  it("routes completions to <baseUrl>/chat/completions (OpenAI-compatible wire)", async () => {
    const mock = stubFetchSequence(
      jsonResponse({
        choices: [{ message: { content: "hi from custom" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    );
    const provider = createProvider(
      "gateway",
      testOptions({ baseUrl: "https://gw.example.test/v1/" }),
    );
    const result = await provider.complete({ messages: [], model: "some-model" });
    expect(result.text).toBe("hi from custom");
    const [url] = mock.mock.calls[0] as [string, unknown];
    // Trailing slash on the configured baseUrl is normalised away by the base.
    expect(url).toBe("https://gw.example.test/v1/chat/completions");
  });
});
