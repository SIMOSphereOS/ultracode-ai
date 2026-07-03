/**
 * Anthropic provider (`https://api.anthropic.com/v1/messages`).
 *
 * Wire-format specifics handled here:
 * - Auth via `x-api-key` plus `anthropic-version: 2023-06-01`.
 * - `system` messages are lifted into the top-level `system` field.
 * - Content is block-based: `text`, `tool_use` (assistant tool calls) and
 *   `tool_result` (mapping of the contract's `tool` role onto a `user`
 *   message carrying a `tool_result` block).
 * - Consecutive same-role messages are merged (the Messages API requires
 *   alternating roles).
 * - Streaming uses SSE with `content_block_start` / `content_block_delta`
 *   (`text_delta` / `input_json_delta`) / `content_block_stop` events;
 *   tool-use inputs are assembled from `input_json_delta` fragments and
 *   emitted as soon as their block stops.
 */

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
} from "ultracode-shared";
import { ProviderError } from "ultracode-shared";
import type { ProviderRequestInit } from "./BaseProvider.js";
import { BaseProvider } from "./BaseProvider.js";
import { ANTHROPIC_BASE_URL } from "./catalog.js";
import { asArray, asNumber, asRecord, asString, safeParseArgs } from "./openaiCompat.js";
import type { TerminalCompletionChunk } from "./sse.js";
import { parseSSEJson } from "./sse.js";

/** Re-exported for backwards compatibility; canonical home is the catalog. */
export { ANTHROPIC_BASE_URL };

/** Pinned Anthropic API version header. */
export const ANTHROPIC_VERSION = "2023-06-01";

/** `max_tokens` is mandatory for the Messages API; used when the request omits it. */
const DEFAULT_MAX_TOKENS = 4_096;

/**
 * Optional, core-local prompt-cache hint readable structurally off a
 * {@link CompletionRequest}.
 *
 * The shared `CompletionRequest` contract is frozen at 1.0 and does **not**
 * declare this field; providers read it defensively. With no hint, the wire
 * format is byte-identical to before (the default path).
 *
 * Caching rule: **"static first, variable last; put the breakpoint on the last
 * stable block."** The stable prefix is `system + tools`. When `cachePrefix` is
 * set, Anthropic marks the *last* stable block (the last tool if present, else
 * the system block) with `cache_control: { type: "ephemeral" }`. Anthropic
 * permits at most four breakpoints; we use exactly one.
 */
export interface RequestCacheHint {
  /** Mark the stable `system + tools` prefix as cacheable. */
  cachePrefix?: boolean;
}

/** Read the optional core-local cache hint off a request without widening the contract. */
export function readCacheHint(req: CompletionRequest): RequestCacheHint | undefined {
  const hint = (req as { cacheHint?: unknown }).cacheHint;
  return typeof hint === "object" && hint !== null ? (hint as RequestCacheHint) : undefined;
}

type WireBlock = Record<string, unknown>;
interface WireMessage {
  role: "user" | "assistant";
  content: WireBlock[];
}

/** Map ChatMessages to the Messages API shape (top-level system + block content). */
export function toAnthropicMessages(messages: ChatMessage[]): {
  system: string | undefined;
  messages: WireMessage[];
} {
  const systemParts: string[] = [];
  const wire: WireMessage[] = [];

  const push = (role: "user" | "assistant", blocks: WireBlock[]): void => {
    if (blocks.length === 0) return;
    const last = wire[wire.length - 1];
    if (last !== undefined && last.role === role) {
      last.content.push(...blocks);
    } else {
      wire.push({ role, content: blocks });
    }
  };

  for (const m of messages) {
    switch (m.role) {
      case "system":
        if (m.content !== "") systemParts.push(m.content);
        break;
      case "user":
        push("user", m.content === "" ? [] : [{ type: "text", text: m.content }]);
        break;
      case "assistant": {
        const blocks: WireBlock[] = [];
        if (m.content !== "") blocks.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls ?? []) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
        }
        push("assistant", blocks);
        break;
      }
      case "tool":
        push("user", [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId ?? "",
            content: m.content,
          },
        ]);
        break;
    }
  }
  return { system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, messages: wire };
}

/** Map ToolDefinitions onto Anthropic's tool shape (`input_schema`). */
export function toAnthropicTools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Map an Anthropic `stop_reason` onto the contract {@link FinishReason}. */
export function mapAnthropicStopReason(
  reason: string | undefined,
  hasToolCalls: boolean,
): FinishReason {
  if (hasToolCalls) return "tool_calls";
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
    case undefined:
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    default:
      return "error";
  }
}

/**
 * Classify an Anthropic error `type` (from a top-level error response or a
 * mid-stream `error` event) as retryable or not.
 *
 * Retryable (transient backend pressure): `overloaded_error` (the streamed
 * form of an HTTP 529), `api_error`, `rate_limit_error`. Non-retryable (client
 * fault): `invalid_request_error`, `authentication_error`, `permission_error`,
 * `not_found_error`. Unknown/absent types default to non-retryable so a genuine
 * client bug is not retried in a tight loop. Exposed for focused tests.
 */
export function isRetryableAnthropicErrorType(type: string | undefined): boolean {
  switch (type) {
    case "overloaded_error":
    case "api_error":
    case "rate_limit_error":
      return true;
    default:
      return false;
  }
}

function parseAnthropicUsage(usage: unknown): Partial<TokenUsage> {
  const rec = asRecord(usage);
  const out: Partial<TokenUsage> = {};
  const input = asNumber(rec?.input_tokens);
  const output = asNumber(rec?.output_tokens);
  if (input !== undefined) out.inputTokens = input;
  if (output !== undefined) out.outputTokens = output;
  return out;
}

/** LLM provider for the Anthropic Messages API. */
export class AnthropicProvider extends BaseProvider {
  public readonly name = "anthropic";
  private readonly baseUrl: string;

  constructor(options: ProviderOptions, logger?: Logger) {
    super(options, logger);
    this.baseUrl = (options.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.options.apiKey ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }

  private buildBody(req: CompletionRequest, stream: boolean): string {
    const { system, messages } = toAnthropicMessages(req.messages);
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
      stream,
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    const tools =
      req.tools !== undefined && req.tools.length > 0 ? toAnthropicTools(req.tools) : undefined;

    // Default path: plain string `system` + untouched tools (byte-identical
    // to the pre-cache wire format). Cache path: mark exactly one breakpoint on
    // the LAST stable block — the last tool if any, else the system block.
    const cache = readCacheHint(req);
    if (cache?.cachePrefix === true && (system !== undefined || tools !== undefined)) {
      if (tools !== undefined) {
        const last = tools[tools.length - 1];
        if (last !== undefined) last.cache_control = { type: "ephemeral" };
        body.tools = tools;
        if (system !== undefined) body.system = system; // breakpoint sits on the tool
      } else if (system !== undefined) {
        body.system = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
      }
    } else {
      if (system !== undefined) body.system = system;
      if (tools !== undefined) body.tools = tools;
    }
    return JSON.stringify(body);
  }

  public async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = `${this.baseUrl}/messages`;
    const init: ProviderRequestInit = {
      method: "POST",
      headers: this.headers(),
      body: this.buildBody(req, false),
    };
    if (req.signal !== undefined) init.signal = req.signal;
    const response = await this.fetchWithRetry(url, init);
    const json = await this.readJson(response, url);
    const root = asRecord(json);
    const content = asArray(root?.content);
    if (root === undefined || content === undefined) {
      throw new ProviderError(`${this.name} returned an invalid completion response`, {
        provider: this.name,
        retryable: false,
        details: { url },
      });
    }
    let text = "";
    const toolCalls: ToolCallRequest[] = [];
    for (const block of content) {
      const rec = asRecord(block);
      if (rec === undefined) continue;
      if (rec.type === "text") text += asString(rec.text) ?? "";
      else if (rec.type === "tool_use") {
        toolCalls.push({
          id: asString(rec.id) ?? `toolu_${toolCalls.length}`,
          name: asString(rec.name) ?? "",
          arguments: asRecord(rec.input) ?? {},
        });
      }
    }
    const usage = parseAnthropicUsage(root.usage);
    return {
      text,
      toolCalls,
      usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
      finishReason: mapAnthropicStopReason(asString(root.stop_reason), toolCalls.length > 0),
    };
  }

  public async *stream(req: CompletionRequest): AsyncIterable<CompletionChunk> {
    const url = `${this.baseUrl}/messages`;
    const init: ProviderRequestInit = {
      method: "POST",
      headers: this.headers(),
      body: this.buildBody(req, true),
    };
    if (req.signal !== undefined) init.signal = req.signal;
    const response = await this.fetchWithRetry(url, init);
    const body = this.requireBody(response, url);

    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    /** Tool-use blocks currently being assembled, keyed by content-block index. */
    const pendingToolUse = new Map<number, { id: string; name: string; json: string }>();
    /**
     * Whether a proper terminal signal was observed (`message_delta` carrying
     * the final `stop_reason`/usage, or `message_stop`). Its absence at
     * end-of-stream means the body was cut off mid-turn.
     */
    let sawTerminal = false;
    /** Best-known finish reason, taken from the terminal `message_delta`. */
    let finishReason: FinishReason | undefined;
    let hadToolCalls = false;

    try {
      for await (const evt of parseSSEJson(
        body,
        this.logger,
        req.signal,
        this.streamIdleTimeoutMs(),
      )) {
        const root = asRecord(evt.json);
        if (root === undefined) continue;
        const type = asString(root.type);
        switch (type) {
          case "message_start": {
            const u = parseAnthropicUsage(asRecord(root.message)?.usage);
            if (u.inputTokens !== undefined) usage.inputTokens = u.inputTokens;
            if (u.outputTokens !== undefined) usage.outputTokens = u.outputTokens;
            break;
          }
          case "content_block_start": {
            const index = asNumber(root.index);
            const block = asRecord(root.content_block);
            if (index !== undefined && block !== undefined && block.type === "tool_use") {
              pendingToolUse.set(index, {
                id: asString(block.id) ?? `toolu_${index}`,
                name: asString(block.name) ?? "",
                json: "",
              });
            }
            break;
          }
          case "content_block_delta": {
            const index = asNumber(root.index);
            const delta = asRecord(root.delta);
            if (delta === undefined) break;
            if (delta.type === "text_delta") {
              const text = asString(delta.text);
              if (text !== undefined && text !== "") yield { type: "text", text };
            } else if (delta.type === "input_json_delta" && index !== undefined) {
              const slot = pendingToolUse.get(index);
              if (slot !== undefined) slot.json += asString(delta.partial_json) ?? "";
            }
            break;
          }
          case "content_block_stop": {
            const index = asNumber(root.index);
            if (index === undefined) break;
            const slot = pendingToolUse.get(index);
            if (slot !== undefined) {
              pendingToolUse.delete(index);
              hadToolCalls = true;
              yield {
                type: "tool_call",
                toolCall: {
                  id: slot.id,
                  name: slot.name,
                  arguments: safeParseArgs(slot.json, this.logger),
                },
              };
            }
            break;
          }
          case "message_delta": {
            sawTerminal = true;
            const u = parseAnthropicUsage(root.usage);
            if (u.inputTokens !== undefined) usage.inputTokens = u.inputTokens;
            if (u.outputTokens !== undefined) usage.outputTokens = u.outputTokens;
            const stopReason = asString(asRecord(root.delta)?.stop_reason);
            if (stopReason !== undefined) {
              finishReason = mapAnthropicStopReason(stopReason, hadToolCalls);
            }
            break;
          }
          case "message_stop": {
            sawTerminal = true;
            break;
          }
          case "error": {
            const err = asRecord(root.error);
            // Mid-stream error events carry an `error.type`. Transient backend
            // conditions (overloaded_error / 529, api_error, rate_limit_error)
            // are retryable; client-fault types (invalid_request,
            // authentication) are not. NOTE: a retry restarts the whole turn —
            // a partial assistant response may already have streamed to the
            // consumer before this event arrived, so the caller must treat the
            // retried turn as a fresh generation rather than a continuation.
            throw new ProviderError(
              `${this.name} stream error: ${asString(err?.message) ?? "unknown error"}`,
              {
                provider: this.name,
                retryable: isRetryableAnthropicErrorType(asString(err?.type)),
                details: { error: err },
              },
            );
          }
          default:
            break; // ping / unknown events
        }
      }
    } catch (err) {
      throw this.toProviderError(err, `Streaming from ${this.name} failed`, req.signal);
    }
    // A stream that ended without a terminal `message_delta`/`message_stop` was
    // cut off mid-turn: flag the terminal chunk `incomplete` and carry the
    // best-known finishReason rather than implying a clean stop with this usage.
    const done: TerminalCompletionChunk = { type: "done", usage };
    if (!sawTerminal) {
      // Clean completion stays byte-identical (`{ type, usage }`); only the
      // cut-off path annotates the terminal chunk.
      done.incomplete = true;
      done.finishReason = finishReason ?? (hadToolCalls ? "tool_calls" : "error");
    }
    yield done;
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
