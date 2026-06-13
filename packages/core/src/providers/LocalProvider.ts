/**
 * Local provider for Ollama-compatible backends.
 *
 * Wire format:
 * - Chat via `POST <endpoint>/api/chat`; streaming responses are NDJSON
 *   (`stream: true`), non-streaming a single JSON document.
 * - Tool calls arrive as `message.tool_calls[].function.{name,arguments}`
 *   where `arguments` is already a JSON object (no ids — synthesised here).
 * - `listModels` via `GET <endpoint>/api/tags`.
 *
 * The base URL comes from `options.baseUrl` and defaults to
 * `http://localhost:11434`. No API key is required.
 */

import { ProviderError, generateId } from "@ultracode/shared";
import type {
  ChatMessage,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  FinishReason,
  Logger,
  ProviderOptions,
  ToolCallRequest,
} from "@ultracode/shared";
import { BaseProvider } from "./BaseProvider.js";
import type { ProviderRequestInit } from "./BaseProvider.js";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  safeParseArgs,
  toOpenAITools,
} from "./openaiCompat.js";
import type { TerminalCompletionChunk } from "./sse.js";
import { parseNDJSON } from "./sse.js";

/** Default Ollama endpoint. */
export const OLLAMA_BASE_URL = "http://localhost:11434";

/** Map ChatMessages onto Ollama's chat format. */
function toOllamaMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    const wire: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.role === "assistant" && m.toolCalls !== undefined && m.toolCalls.length > 0) {
      wire.tool_calls = m.toolCalls.map((tc) => ({
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    // Ollama correlates a tool result back to its call via `tool_name`. The
    // contract addresses tool results by `toolCallId`, and `name` is optional —
    // when it is absent we must NOT drop the correlation. Fall back to a stable
    // name derived from `toolCallId` (deterministic across the turn) so the
    // model can still match the result to the originating call.
    if (m.role === "tool") {
      const toolName = m.name ?? (m.toolCallId !== undefined ? `tool_${m.toolCallId}` : undefined);
      if (toolName !== undefined) wire.tool_name = toolName;
    }
    return wire;
  });
}

/** Parse `message.tool_calls` from an Ollama response (object or JSON-string args). */
function parseOllamaToolCalls(value: unknown, logger: Logger): ToolCallRequest[] {
  const list = asArray(value);
  if (list === undefined) return [];
  const out: ToolCallRequest[] = [];
  for (const entry of list) {
    const fn = asRecord(asRecord(entry)?.function);
    const name = asString(fn?.name);
    if (fn === undefined || name === undefined) continue;
    const rawArgs = fn.arguments;
    out.push({
      id: generateId("call"),
      name,
      arguments:
        typeof rawArgs === "string" ? safeParseArgs(rawArgs, logger) : (asRecord(rawArgs) ?? {}),
    });
  }
  return out;
}

function mapOllamaFinishReason(doneReason: string | undefined, hasToolCalls: boolean): FinishReason {
  if (hasToolCalls) return "tool_calls";
  switch (doneReason) {
    case "length":
      return "length";
    case "stop":
    case undefined:
      return "stop";
    default:
      return "stop";
  }
}

/** LLM provider for local Ollama-compatible backends. */
export class LocalProvider extends BaseProvider {
  public readonly name = "local";
  private readonly baseUrl: string;

  constructor(options: ProviderOptions, logger?: Logger) {
    super(options, logger);
    this.baseUrl = (options.baseUrl ?? OLLAMA_BASE_URL).replace(/\/+$/, "");
  }

  private buildBody(req: CompletionRequest, stream: boolean): string {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOllamaMessages(req.messages),
      stream,
    };
    const options: Record<string, unknown> = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
    if (Object.keys(options).length > 0) body.options = options;
    if (req.tools !== undefined && req.tools.length > 0) body.tools = toOpenAITools(req.tools);
    return JSON.stringify(body);
  }

  public async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = `${this.baseUrl}/api/chat`;
    const init: ProviderRequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: this.buildBody(req, false),
    };
    if (req.signal !== undefined) init.signal = req.signal;
    const response = await this.fetchWithRetry(url, init);
    const json = await this.readJson(response, url);
    const root = asRecord(json);
    const message = asRecord(root?.message);
    if (root === undefined || message === undefined) {
      throw new ProviderError(`${this.name} returned an invalid completion response`, {
        provider: this.name,
        retryable: false,
        details: { url },
      });
    }
    const toolCalls = parseOllamaToolCalls(message.tool_calls, this.logger);
    return {
      text: asString(message.content) ?? "",
      toolCalls,
      usage: {
        inputTokens: asNumber(root.prompt_eval_count) ?? 0,
        outputTokens: asNumber(root.eval_count) ?? 0,
      },
      finishReason: mapOllamaFinishReason(asString(root.done_reason), toolCalls.length > 0),
    };
  }

  public async *stream(req: CompletionRequest): AsyncIterable<CompletionChunk> {
    const url = `${this.baseUrl}/api/chat`;
    const init: ProviderRequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: this.buildBody(req, true),
    };
    if (req.signal !== undefined) init.signal = req.signal;
    const response = await this.fetchWithRetry(url, init);
    const body = this.requireBody(response, url);

    let inputTokens = 0;
    let outputTokens = 0;
    /** Whether Ollama's terminal `done: true` line was observed. */
    let sawDone = false;
    let hadToolCalls = false;
    try {
      for await (const line of parseNDJSON(body, this.logger, req.signal, this.streamIdleTimeoutMs())) {
        const root = asRecord(line);
        if (root === undefined) continue;
        const error = asString(root.error);
        if (error !== undefined) {
          throw new ProviderError(`${this.name} stream error: ${error}`, {
            provider: this.name,
            retryable: false,
          });
        }
        const message = asRecord(root.message);
        const text = asString(message?.content);
        if (text !== undefined && text !== "") yield { type: "text", text };
        for (const toolCall of parseOllamaToolCalls(message?.tool_calls, this.logger)) {
          hadToolCalls = true;
          yield { type: "tool_call", toolCall };
        }
        if (root.done === true) {
          sawDone = true;
          inputTokens = asNumber(root.prompt_eval_count) ?? inputTokens;
          outputTokens = asNumber(root.eval_count) ?? outputTokens;
        }
      }
    } catch (err) {
      throw this.toProviderError(err, `Streaming from ${this.name} failed`, req.signal);
    }
    // A stream that ended without Ollama's terminal `done: true` line was cut
    // off mid-turn: flag the terminal chunk `incomplete` and carry the
    // best-known finishReason instead of implying a clean stop with zero usage.
    const done: TerminalCompletionChunk = { type: "done", usage: { inputTokens, outputTokens } };
    if (!sawDone) {
      // Clean completion stays byte-identical (`{ type, usage }`); only the
      // cut-off path annotates the terminal chunk.
      done.incomplete = true;
      done.finishReason = hadToolCalls ? "tool_calls" : "error";
    }
    yield done;
  }

  public async listModels(): Promise<string[]> {
    const url = `${this.baseUrl}/api/tags`;
    const response = await this.fetchWithRetry(url, {});
    const json = await this.readJson(response, url);
    const models = asArray(asRecord(json)?.models) ?? [];
    const names: string[] = [];
    for (const entry of models) {
      const name = asString(asRecord(entry)?.name);
      if (name !== undefined) names.push(name);
    }
    return names;
  }

  public async healthCheck(): Promise<boolean> {
    return this.ping(`${this.baseUrl}/api/tags`);
  }
}
