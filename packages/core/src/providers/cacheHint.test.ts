/**
 * Provider prompt-cache hint wire-format tests.
 *
 * Two invariants:
 * 1. WITHOUT a cache hint, the request body is byte-identical to the
 *    pre-cache format (`system` stays a plain string, `tools` untouched, no
 *    `prompt_cache_key`) — so every existing provider test stays green.
 * 2. WITH a hint, Anthropic places `cache_control` on the last stable block and
 *    OpenAI-compatible providers set a stable `prompt_cache_key`.
 */

import type { CompletionRequest, ToolDefinition } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import { jsonResponse, stubFetchSequence, testOptions } from "./testkit.test.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tool(name: string): ToolDefinition {
  return {
    name,
    description: "do a thing",
    category: "utility",
    parameters: { type: "object", properties: {}, required: [] },
    permission: "always",
  };
}

const baseMessages: CompletionRequest["messages"] = [
  { role: "system", content: "be precise" },
  { role: "user", content: "hi" },
];

function bodyOf(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = mock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("Anthropic cache hint", () => {
  const anthropicResponse = (): Response =>
    jsonResponse({
      content: [],
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    });

  it("emits a plain string system and untouched tools WITHOUT a hint", async () => {
    const mock = stubFetchSequence(anthropicResponse());
    const provider = new AnthropicProvider(testOptions());
    await provider.complete({ messages: baseMessages, model: "claude", tools: [tool("a")] });
    const body = bodyOf(mock);
    expect(body.system).toBe("be precise");
    expect(body.tools).toEqual([
      {
        name: "a",
        description: "do a thing",
        input_schema: { type: "object", properties: {}, required: [] },
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("cache_control");
  });

  it("puts cache_control on the LAST tool WITH a hint (system stays a string)", async () => {
    const mock = stubFetchSequence(anthropicResponse());
    const provider = new AnthropicProvider(testOptions());
    const req = {
      messages: baseMessages,
      model: "claude",
      tools: [tool("a"), tool("b")],
      cacheHint: { cachePrefix: true },
    } as unknown as CompletionRequest;
    await provider.complete(req);
    const body = bodyOf(mock);
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0]?.cache_control).toBeUndefined();
    expect(tools[1]?.cache_control).toEqual({ type: "ephemeral" });
    expect(body.system).toBe("be precise");
  });

  it("puts cache_control on the system block WITH a hint and no tools", async () => {
    const mock = stubFetchSequence(anthropicResponse());
    const provider = new AnthropicProvider(testOptions());
    const req = {
      messages: baseMessages,
      model: "claude",
      cacheHint: { cachePrefix: true },
    } as unknown as CompletionRequest;
    await provider.complete(req);
    const body = bodyOf(mock);
    expect(body.system).toEqual([
      { type: "text", text: "be precise", cache_control: { type: "ephemeral" } },
    ]);
  });
});

describe("OpenAI cache hint", () => {
  const openaiResponse = (): Response =>
    jsonResponse({
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

  it("omits prompt_cache_key WITHOUT a hint", async () => {
    const mock = stubFetchSequence(openaiResponse());
    const provider = new OpenAIProvider(testOptions());
    await provider.complete({ messages: baseMessages, model: "gpt" });
    expect(bodyOf(mock).prompt_cache_key).toBeUndefined();
  });

  it("sets a stable prompt_cache_key WITH a hint key", async () => {
    const mock = stubFetchSequence(openaiResponse());
    const provider = new OpenAIProvider(testOptions());
    const req = {
      messages: baseMessages,
      model: "gpt",
      cacheHint: { cachePrefix: true, key: "prefix-abc123" },
    } as unknown as CompletionRequest;
    await provider.complete(req);
    expect(bodyOf(mock).prompt_cache_key).toBe("prefix-abc123");
  });
});
