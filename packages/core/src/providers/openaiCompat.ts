/**
 * Shared implementation of the OpenAI-compatible `chat/completions` wire
 * format, used by {@link MistralProvider} and {@link OpenAIProvider}
 * (Mistral's API is OpenAI-compatible including tools/tool_calls).
 *
 * Contains:
 * - message / tool-definition mapping to the wire format,
 * - response parsing into {@link CompletionResult},
 * - SSE streaming with index-based tool-call delta assembly
 *   ({@link OpenAIToolCallAssembler}),
 * - `listModels` via `GET /models` and a fetch-based `healthCheck`.
 */

import { ProviderError } from "@ultracode/shared";
import type {
  ChatMessage,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  FinishReason,
  Logger,
  ProviderOptions,
  TokenUsage,
  ToolCallRequest,
  ToolDefinition,
} from "@ultracode/shared";
import { BaseProvider } from "./BaseProvider.js";
import { parseSSEJson } from "./sse.js";

/** Narrow an unknown value to a plain record, else `undefined`. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Narrow an unknown value to an array, else `undefined`. */
export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** Narrow an unknown value to a string, else `undefined`. */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Narrow an unknown value to a finite number, else `undefined`. */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Parse a tool-call `arguments` JSON string defensively. Malformed payloads
 * are logged and replaced by `{}` so a single bad tool call never crashes a
 * completion.
 */
export function safeParseArgs(raw: string, logger: Logger): Record<string, unknown> {
  if (raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return asRecord(parsed) ?? {};
  } catch {
    logger.warn("Tool call carried malformed JSON arguments; using {}", {
      raw: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw,
    });
    return {};
  }
}

/** Map {@link ChatMessage}s onto OpenAI-compatible wire messages. */
export function toOpenAIMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    const wire: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.name !== undefined) wire.name = m.name;
    if (m.role === "assistant" && m.toolCalls !== undefined && m.toolCalls.length > 0) {
      wire.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      }));
      if (m.content === "") wire.content = null;
    }
    if (m.role === "tool" && m.toolCallId !== undefined) wire.tool_call_id = m.toolCallId;
    return wire;
  });
}

/** Map {@link ToolDefinition}s onto OpenAI-compatible function tools. */
export function toOpenAITools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Map an OpenAI `finish_reason` onto the contract {@link FinishReason}. */
export function mapOpenAIFinishReason(reason: string | undefined, hasToolCalls: boolean): FinishReason {
  if (hasToolCalls) return "tool_calls";
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    case undefined:
      return "stop";
    default:
      return "error";
  }
}

/** Extract {@link TokenUsage} from an OpenAI-style `usage` object. */
export function parseOpenAIUsage(usage: unknown): TokenUsage | undefined {
  const rec = asRecord(usage);
  if (rec === undefined) return undefined;
  return {
    inputTokens: asNumber(rec.prompt_tokens) ?? 0,
    outputTokens: asNumber(rec.completion_tokens) ?? 0,
  };
}

/** Parse complete (non-streaming) tool calls from an assistant message. */
function parseWireToolCalls(value: unknown, logger: Logger): ToolCallRequest[] {
  const list = asArray(value);
  if (list === undefined) return [];
  const out: ToolCallRequest[] = [];
  for (const entry of list) {
    const rec = asRecord(entry);
    const fn = asRecord(rec?.function);
    const name = asString(fn?.name);
    if (rec === undefined || fn === undefined || name === undefined) continue;
    const rawArgs = fn.arguments;
    out.push({
      id: asString(rec.id) ?? `call_${out.length}`,
      name,
      arguments:
        typeof rawArgs === "string" ? safeParseArgs(rawArgs, logger) : (asRecord(rawArgs) ?? {}),
    });
  }
  return out;
}

/**
 * Assembles OpenAI-style streamed tool-call delta fragments (index-based)
 * into complete {@link ToolCallRequest}s.
 *
 * Fragments accumulate per `index`; {@link OpenAIToolCallAssembler.drain}
 * finalises and returns all assembled calls (called once the stream signals
 * completion).
 */
export class OpenAIToolCallAssembler {
  private readonly pending = new Map<number, { id?: string; name: string; args: string }>();
  private nextImplicitIndex = 0;

  constructor(private readonly logger: Logger) {}

  /** Feed the `delta.tool_calls` array from one streamed chunk. */
  public add(deltaToolCalls: unknown): void {
    const list = asArray(deltaToolCalls);
    if (list === undefined) return;
    for (const entry of list) {
      const rec = asRecord(entry);
      if (rec === undefined) continue;
      const index = asNumber(rec.index) ?? this.nextImplicitIndex;
      this.nextImplicitIndex = Math.max(this.nextImplicitIndex, index);
      const fn = asRecord(rec.function);
      let slot = this.pending.get(index);
      if (slot === undefined) {
        slot = { name: "", args: "" };
        this.pending.set(index, slot);
      }
      const id = asString(rec.id);
      if (id !== undefined) slot.id = id;
      const name = asString(fn?.name);
      if (name !== undefined) slot.name += name;
      const args = asString(fn?.arguments);
      if (args !== undefined) slot.args += args;
    }
  }

  /** Whether any fragments are buffered. */
  public get size(): number {
    return this.pending.size;
  }

  /** Finalise and return all assembled tool calls, clearing internal state. */
  public drain(): ToolCallRequest[] {
    const out: ToolCallRequest[] = [];
    const indices = [...this.pending.keys()].sort((a, b) => a - b);
    for (const index of indices) {
      const slot = this.pending.get(index);
      if (slot === undefined) continue;
      if (slot.name === "") {
        this.logger.warn("Discarding streamed tool call without a name", { index });
        continue;
      }
      out.push({
        id: slot.id ?? `call_${index}`,
        name: slot.name,
        arguments: safeParseArgs(slot.args, this.logger),
      });
    }
    this.pending.clear();
    return out;
  }
}

/**
 * Abstract provider speaking the OpenAI-compatible `chat/completions`
 * protocol. Concrete subclasses only configure name, base URL and headers.
 */
export abstract class OpenAICompatProvider extends BaseProvider {
  protected readonly baseUrl: string;

  protected constructor(options: ProviderOptions, defaultBaseUrl: string, logger?: Logger) {
    super(options, logger);
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
  }

  /** Authentication / content headers for this backend. */
  protected headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.options.apiKey ?? ""}`,
    };
  }

  /** Extra body fields merged into the request payload (subclass hook). */
  protected extraBody(stream: boolean): Record<string, unknown> {
    void stream;
    return {};
  }

  private buildBody(req: CompletionRequest, stream: boolean): string {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.messages),
      stream,
      ...this.extraBody(stream),
    };
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools !== undefined && req.tools.length > 0) body.tools = toOpenAITools(req.tools);
    return JSON.stringify(body);
  }

  public async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = `${this.baseUrl}/chat/completions`;
    const init: Parameters<BaseProvider["fetchWithRetry"]>[1] = {
      method: "POST",
      headers: this.headers(),
      body: this.buildBody(req, false),
    };
    if (req.signal !== undefined) init.signal = req.signal;
    const response = await this.fetchWithRetry(url, init);
    const json = await this.readJson(response, url);
    const root = asRecord(json);
    const choice = asRecord(asArray(root?.choices)?.[0]);
    const message = asRecord(choice?.message);
    if (root === undefined || choice === undefined || message === undefined) {
      throw new ProviderError(`${this.name} returned an invalid completion response`, {
        provider: String(this.name),
        retryable: false,
        details: { url },
      });
    }
    const toolCalls = parseWireToolCalls(message.tool_calls, this.logger);
    return {
      text: asString(message.content) ?? "",
      toolCalls,
      usage: parseOpenAIUsage(root.usage) ?? { inputTokens: 0, outputTokens: 0 },
      finishReason: mapOpenAIFinishReason(asString(choice.finish_reason), toolCalls.length > 0),
    };
  }

  public async *stream(req: CompletionRequest): AsyncIterable<CompletionChunk> {
    const url = `${this.baseUrl}/chat/completions`;
    const init: Parameters<BaseProvider["fetchWithRetry"]>[1] = {
      method: "POST",
      headers: this.headers(),
      body: this.buildBody(req, true),
    };
    if (req.signal !== undefined) init.signal = req.signal;
    const response = await this.fetchWithRetry(url, init);
    const body = this.requireBody(response, url);
    const assembler = new OpenAIToolCallAssembler(this.logger);
    let usage: TokenUsage | undefined;
    try {
      for await (const evt of parseSSEJson(body, this.logger, req.signal)) {
        const root = asRecord(evt.json);
        if (root === undefined) continue;
        usage = parseOpenAIUsage(root.usage) ?? usage;
        const choice = asRecord(asArray(root.choices)?.[0]);
        if (choice === undefined) continue;
        const delta = asRecord(choice.delta);
        const text = asString(delta?.content);
        if (text !== undefined && text !== "") yield { type: "text", text };
        if (delta?.tool_calls !== undefined) assembler.add(delta.tool_calls);
        if (asString(choice.finish_reason) !== undefined && assembler.size > 0) {
          for (const toolCall of assembler.drain()) yield { type: "tool_call", toolCall };
        }
      }
    } catch (err) {
      throw this.toProviderError(err, `Streaming from ${this.name} failed`, req.signal);
    }
    // Flush calls whose stream ended without an explicit finish_reason.
    for (const toolCall of assembler.drain()) yield { type: "tool_call", toolCall };
    yield { type: "done", usage: usage ?? { inputTokens: 0, outputTokens: 0 } };
  }

  public async listModels(): Promise<string[]> {
    const url = `${this.baseUrl}/models`;
    const response = await this.fetchWithRetry(url, { headers: this.headers() });
    const json = await this.readJson(response, url);
    const data = asArray(asRecord(json)?.data) ?? [];
    const ids: string[] = [];
    for (const entry of data) {
      const id = asString(asRecord(entry)?.id);
      if (id !== undefined) ids.push(id);
    }
    return ids;
  }

  public async healthCheck(): Promise<boolean> {
    return this.ping(`${this.baseUrl}/models`, this.headers());
  }
}
