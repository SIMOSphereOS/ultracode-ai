/**
 * The agentic execution loop.
 *
 * The {@link ExecutionEngine} drives a multi-turn conversation against an
 * injected {@link ILLMProvider}: system prompt + injected context + history
 * are sent to the model together with the available tool definitions; when
 * the model requests tool calls they are executed (in parallel, with stable
 * result ordering) through an injected {@link IToolRunner}, appended to the
 * transcript as `tool` messages, and the loop continues until the model
 * stops or the configured turn budget is exhausted.
 */

import {
  AgentError,
  isPlainObject,
  serializeError,
  truncate,
  generateId,
  NoopLogger,
  MAX_TOOL_OUTPUT_CHARS,
} from "@ultracode/shared";
import type {
  ChatMessage,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  FinishReason,
  IEventBus,
  ILLMProvider,
  Logger,
  TokenUsage,
  ToolCallRequest,
  ToolContext,
  ToolResult,
} from "@ultracode/shared";
import type { IToolRunner } from "./types.js";

/** Default maximum number of model turns per run. */
export const DEFAULT_MAX_TURNS = 16;

/** Construction options for {@link ExecutionEngine}. */
export interface ExecutionEngineOptions {
  /** LLM provider used for completions. */
  provider: ILLMProvider;
  /** Tool runner used to execute model-requested tool calls. */
  tools: IToolRunner;
  /** Model identifier passed to the provider. */
  model: string;
  /** Structured logger; defaults to a no-op logger. */
  logger?: Logger;
  /** Optional event bus for `session.started` / `tool.executed` / `error`. */
  events?: IEventBus;
  /** Maximum model turns before the run fails with `AgentError`. Default 16. */
  maxTurns?: number;
  /** Token cap forwarded to the provider. */
  maxTokens?: number;
  /** Sampling temperature forwarded to the provider. */
  temperature?: number;
  /** Working directory handed to tools. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Environment snapshot handed to tools. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Input to a single {@link ExecutionEngine.run} invocation. */
export interface ExecutionRunInput {
  /** The user's prompt for this run. */
  prompt: string;
  /** System prompt to prepend (agent persona / instructions). */
  systemPrompt?: string;
  /** Injected context string (project/file context), appended to the system prompt. */
  context?: string;
  /** Prior conversation history to replay before the new prompt. */
  history?: ChatMessage[];
  /** Session identifier for event correlation; generated when omitted. */
  sessionId?: string;
  /** Cancellation signal; aborts the run promptly and cleanly. */
  signal?: AbortSignal;
  /** Optional streaming callback. When set, the provider's `stream` API is used. */
  onChunk?: (chunk: CompletionChunk) => void;
}

/** Aggregated outcome of an engine run. */
export interface ExecutionRunResult {
  /** Final assistant text. */
  text: string;
  /** Total number of tool executions across all turns. */
  toolCallsExecuted: number;
  /** Cumulative token usage across all model calls. */
  usage: TokenUsage;
  /** Number of model turns taken. */
  turns: number;
  /** Full transcript of the run (system, user, assistant and tool messages). */
  messages: ChatMessage[];
  /** Finish reason of the final model turn. */
  finishReason: FinishReason;
}

/** `true` when `err` is an abort-derived error (AbortError / ABORT_ERR). */
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return err.name === "AbortError" || code === "ABORT_ERR";
}

/** Derive an abort error from an aborted signal (uses `signal.reason` when set). */
function abortErrorOf(signal: AbortSignal): unknown {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason instanceof Error) return reason;
  const err = new Error(
    typeof reason === "string" && reason.length > 0 ? reason : "The operation was aborted",
  );
  err.name = "AbortError";
  return err;
}

/** Throw an abort-derived error when the signal is already aborted. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortErrorOf(signal);
}

/** JSON-stringify that never throws (circular structures, BigInt, …). */
function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/** Add `b` (when finite) to `a`. */
function addFinite(a: number, b: unknown): number {
  return typeof b === "number" && Number.isFinite(b) ? a + b : a;
}

/**
 * Multi-turn agentic execution loop over an injected provider and tool runner.
 *
 * Failure model:
 * - Provider failures (`ProviderError`) propagate to the caller.
 * - A failed tool execution does **not** abort the run — the failure is fed
 *   back to the model as a `tool` message so it can recover.
 * - Exceeding `maxTurns`, or a `finishReason: "error"` turn, rejects with
 *   {@link AgentError}.
 * - Cancellation via {@link ExecutionRunInput.signal} rejects with an
 *   abort-derived error (name `"AbortError"`).
 */
export class ExecutionEngine {
  private readonly provider: ILLMProvider;
  private readonly tools: IToolRunner;
  private readonly model: string;
  private readonly logger: Logger;
  private readonly events?: IEventBus;
  private readonly maxTurns: number;
  private readonly maxTokens?: number;
  private readonly temperature?: number;
  private readonly cwd: string;
  private readonly env: Readonly<Record<string, string | undefined>>;

  constructor(options: ExecutionEngineOptions) {
    this.provider = options.provider;
    this.tools = options.tools;
    this.model = options.model;
    this.logger = options.logger ?? new NoopLogger();
    this.events = options.events;
    const maxTurns = options.maxTurns;
    this.maxTurns =
      typeof maxTurns === "number" && Number.isFinite(maxTurns) && maxTurns >= 1
        ? Math.floor(maxTurns)
        : DEFAULT_MAX_TURNS;
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? (process.env as Readonly<Record<string, string | undefined>>);
  }

  /**
   * Run the agentic loop until the model stops or `maxTurns` is exceeded.
   *
   * @throws {AgentError} when the turn budget is exhausted or the model
   *   reports `finishReason: "error"`.
   */
  async run(input: ExecutionRunInput): Promise<ExecutionRunResult> {
    const { signal, onChunk } = input;
    throwIfAborted(signal);

    const sessionId = input.sessionId ?? generateId("session");
    this.events?.emit({ type: "session.started", sessionId });

    const messages: ChatMessage[] = [];
    const systemContent = [input.systemPrompt, input.context]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .join("\n\n");
    if (systemContent.length > 0) {
      messages.push({ role: "system", content: systemContent });
    }
    if (input.history) messages.push(...input.history);
    messages.push({ role: "user", content: input.prompt });

    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let toolCallsExecuted = 0;

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      throwIfAborted(signal);

      const request: CompletionRequest = {
        messages: [...messages],
        model: this.model,
        tools: this.tools.list(),
        signal,
      };
      if (this.maxTokens !== undefined) request.maxTokens = this.maxTokens;
      if (this.temperature !== undefined) request.temperature = this.temperature;

      let result: CompletionResult;
      try {
        result = onChunk
          ? await this.streamTurn(request, onChunk, signal)
          : await this.provider.complete(request);
      } catch (err) {
        if (!isAbortError(err)) this.emitError(err);
        throw err;
      }

      usage.inputTokens = addFinite(usage.inputTokens, result.usage?.inputTokens);
      usage.outputTokens = addFinite(usage.outputTokens, result.usage?.outputTokens);

      const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.text ?? "",
      };
      if (toolCalls.length > 0) assistantMessage.toolCalls = toolCalls;
      messages.push(assistantMessage);

      const wantsTools = result.finishReason === "tool_calls" && toolCalls.length > 0;
      if (!wantsTools) {
        if (result.finishReason === "error") {
          const err = new AgentError("Model reported an error finish reason", {
            details: { turn, model: this.model },
          });
          this.emitError(err);
          throw err;
        }
        return {
          text: result.text ?? "",
          toolCallsExecuted,
          usage,
          turns: turn,
          messages,
          finishReason: result.finishReason,
        };
      }

      throwIfAborted(signal);
      const toolMessages = await this.executeToolCalls(toolCalls, signal);
      toolCallsExecuted += toolCalls.length;
      messages.push(...toolMessages);
      throwIfAborted(signal);
    }

    const err = new AgentError(
      `Agentic loop exceeded the maximum number of turns (${this.maxTurns})`,
      { details: { maxTurns: this.maxTurns, toolCallsExecuted } },
    );
    this.emitError(err);
    throw err;
  }

  /** Consume the provider stream, forwarding chunks, and aggregate the turn. */
  private async streamTurn(
    request: CompletionRequest,
    onChunk: (chunk: CompletionChunk) => void,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    let text = "";
    const callsById = new Map<string, ToolCallRequest>();
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of this.provider.stream(request)) {
      throwIfAborted(signal);
      onChunk(chunk);
      if (chunk.type === "text" && typeof chunk.text === "string") {
        text += chunk.text;
      } else if (chunk.type === "tool_call" && chunk.toolCall) {
        // Partial tool calls share an id; the latest version wins, the
        // original arrival order is preserved (Map insertion order).
        callsById.set(chunk.toolCall.id, chunk.toolCall);
      } else if (chunk.type === "done") {
        usage.inputTokens = addFinite(usage.inputTokens, chunk.usage?.inputTokens);
        usage.outputTokens = addFinite(usage.outputTokens, chunk.usage?.outputTokens);
      }
    }
    throwIfAborted(signal);

    const toolCalls = [...callsById.values()];
    return {
      text,
      toolCalls,
      usage,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    };
  }

  /**
   * Execute all tool calls of a turn in parallel. The returned `tool`
   * messages preserve the order of the requests regardless of completion
   * order. Never rejects for tool-level failures.
   */
  private async executeToolCalls(
    calls: ToolCallRequest[],
    signal?: AbortSignal,
  ): Promise<ChatMessage[]> {
    const results = await Promise.all(calls.map((call) => this.executeOne(call, signal)));
    return results.map((result, i) => {
      // `calls` and `results` are index-aligned by construction.
      const call = calls[i] as ToolCallRequest;
      return {
        role: "tool" as const,
        content: this.toolMessageContent(result),
        toolCallId: call.id,
        name: call.name,
      };
    });
  }

  /** Execute a single tool call defensively; never throws. */
  private async executeOne(call: ToolCallRequest, signal?: AbortSignal): Promise<ToolResult> {
    const args = this.normalizeToolArgs(call);
    const ctx: ToolContext = { cwd: this.cwd, env: this.env, logger: this.logger };
    if (signal) ctx.signal = signal;

    const start = Date.now();
    let result: ToolResult;
    try {
      result = await this.tools.execute(call.name, args, ctx);
    } catch (err) {
      // The runner contract says it never rejects; guard anyway.
      this.logger.warn("tool runner rejected unexpectedly", {
        toolName: call.name,
        error: serializeError(err),
      });
      result = {
        ok: false,
        output: null,
        error: serializeError(err),
        durationMs: Date.now() - start,
      };
    }
    const durationMs =
      typeof result.durationMs === "number" && Number.isFinite(result.durationMs)
        ? result.durationMs
        : Date.now() - start;
    this.events?.emit({
      type: "tool.executed",
      toolName: call.name,
      ok: result.ok === true,
      durationMs,
    });
    return result;
  }

  /** Coerce untrusted tool-call arguments into a plain object. */
  private normalizeToolArgs(call: ToolCallRequest): Record<string, unknown> {
    const raw: unknown = call.arguments;
    if (isPlainObject(raw)) return raw as Record<string, unknown>;
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isPlainObject(parsed)) return parsed as Record<string, unknown>;
      } catch {
        /* fall through to empty object */
      }
    }
    if (raw !== undefined && raw !== null) {
      this.logger.warn("tool call arguments were not an object; using {}", {
        toolName: call.name,
        argumentsType: typeof raw,
      });
    }
    return {};
  }

  /** Serialise a tool result into the `tool` message content (truncated). */
  private toolMessageContent(result: ToolResult): string {
    let content: string;
    if (result.ok) {
      content = typeof result.output === "string" ? result.output : safeJson(result.output);
    } else {
      content = safeJson({ ok: false, error: result.error ?? null });
    }
    return truncate(content, MAX_TOOL_OUTPUT_CHARS);
  }

  /** Publish an `error` event with a serialised error; never throws. */
  private emitError(err: unknown): void {
    try {
      this.events?.emit({ type: "error", error: serializeError(err) });
    } catch {
      /* the bus isolates handler errors; this is belt-and-braces */
    }
  }
}
