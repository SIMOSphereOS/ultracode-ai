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
} from "ultracode-shared";
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
} from "ultracode-shared";
import type { IToolRunner } from "./types.js";
import type { OptimizeResult, PromptPayload } from "../tokens/index.js";

/** Default maximum number of model turns per run. */
export const DEFAULT_MAX_TURNS = 16;

/**
 * Default number of *consecutive* identical tool-call batches that trips the
 * no-progress guard. When the model re-emits the same batch (same tool names +
 * canonical args) this many turns in a row, the loop terminates early with a
 * distinct {@link ExecutionRunResult.finishReason} of `"no_progress"` instead
 * of silently burning the whole turn budget. Must be `>= 2` (a single batch is
 * never "repeated"). No per-module `defaults.ts` exists for this engine, so the
 * limit lives here as a named const.
 */
export const DEFAULT_NO_PROGRESS_LIMIT = 3;

/**
 * Terminal finish reason for an engine run. Superset of the provider-level
 * {@link FinishReason}: adds `"no_progress"`, an engine-synthesised reason that
 * signals the model stalled on identical tool-call batches (see
 * {@link DEFAULT_NO_PROGRESS_LIMIT}).
 */
export type ExecutionFinishReason = FinishReason | "no_progress";

/**
 * Narrow, locally-defined token-optimizer boundary.
 *
 * Mirrors `TokenOptimizer.optimize` from `core/tokens` without importing the
 * concrete class, keeping the engine decoupled. Integrators inject a configured
 * optimizer (e.g. `createDefaultOptimizer({ immutableMarkers })`).
 */
export interface ITokenOptimizer {
  /** Apply the stage chain and report the measured reduction. */
  optimize(
    payload: PromptPayload,
    ctx?: { prompt?: string; tokenBudget?: number },
  ): Promise<OptimizeResult>;
}

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
  /**
   * Number of consecutive identical tool-call batches that trips the
   * no-progress guard and terminates the run early with
   * `finishReason: "no_progress"`. Default {@link DEFAULT_NO_PROGRESS_LIMIT}.
   * Values `< 2` are clamped to `2` (a lone batch can never be a repeat).
   */
  noProgressLimit?: number;
  /** Token cap forwarded to the provider. */
  maxTokens?: number;
  /** Sampling temperature forwarded to the provider. */
  temperature?: number;
  /** Working directory handed to tools. Defaults to `process.cwd()`. */
  cwd?: string;
  /**
   * Environment snapshot handed to tools as `ctx.env`. Defaults to the full
   * `process.env`. Note that `system`-category tools that spawn child
   * processes (notably `bash`) additionally run this through credential
   * sanitisation before exposing it to the child — so even the default never
   * leaks API keys/tokens/passwords into command output. Embedders that need
   * strict isolation should pass a minimal explicit `env` here.
   */
  env?: Readonly<Record<string, string | undefined>>;
  /**
   * Optional token optimizer applied to the prompt **before** the first
   * provider call. Inject a configured {@link ITokenOptimizer} (e.g. from
   * `createDefaultOptimizer`). When omitted, no optimization happens.
   */
  optimizer?: ITokenOptimizer;
  /**
   * Master switch for token optimization. Default `true`, but optimization only
   * runs when an {@link ExecutionEngineOptions.optimizer} is also injected — so
   * the effective default for an engine constructed without an optimizer is
   * "no-op". Set `false` to disable even when an optimizer is present.
   */
  enableTokenOptimization?: boolean;
  /**
   * Token budget forwarded to the optimizer. Lossless stages run regardless;
   * conversation compaction only triggers when this budget is exceeded.
   */
  tokenBudget?: number;
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
  /**
   * Finish reason of the final model turn, or the engine-synthesised
   * `"no_progress"` when the run was terminated early by the no-progress guard.
   */
  finishReason: ExecutionFinishReason;
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

/**
 * A promise that never resolves and rejects with the abort-derived error the
 * moment `signal` fires (or immediately, if it is already aborted). Used to
 * race long-running work against cancellation so the engine rejects *promptly*
 * on abort instead of blocking until the work settles. The listener is removed
 * via the provided `cleanup` once the race is decided, so no handler leaks.
 */
function abortRace(signal: AbortSignal): { promise: Promise<never>; cleanup: () => void } {
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(abortErrorOf(signal));
      return;
    }
    onAbort = () => reject(abortErrorOf(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  // Swallow the eventual rejection when the race is won by the other side, so an
  // unobserved abort promise never surfaces as an unhandled rejection.
  promise.catch(() => undefined);
  const cleanup = (): void => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  };
  return { promise, cleanup };
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
 * Canonical, order-stable JSON of an arbitrary value: object keys are sorted
 * recursively so that `{a,b}` and `{b,a}` serialise identically. Arrays keep
 * their order (positional). Never throws (circular structures, BigInt, …) —
 * falls back to {@link safeJson}. Used to fingerprint tool-call arguments for
 * the no-progress guard, where semantically-identical batches must compare
 * equal regardless of key ordering.
 */
function canonicalJson(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const normalize = (val: unknown): unknown => {
      if (val === null || typeof val !== "object") return val;
      if (seen.has(val as object)) return "[Circular]";
      seen.add(val as object);
      if (Array.isArray(val)) return val.map(normalize);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(val as Record<string, unknown>).sort()) {
        out[key] = normalize((val as Record<string, unknown>)[key]);
      }
      return out;
    };
    const json = JSON.stringify(normalize(value));
    return json === undefined ? String(value) : json;
  } catch {
    return safeJson(value);
  }
}

/**
 * Order-independent fingerprint of a turn's tool-call batch: each call is
 * reduced to `name` + {@link canonicalJson} of its arguments, and the per-call
 * signatures are sorted so the batch signature does not depend on the order the
 * model emitted the calls. Two turns requesting the same tools with the same
 * args therefore produce an identical signature.
 */
function batchSignature(calls: ToolCallRequest[]): string {
  return calls
    .map((c) => `${c.name} ${canonicalJson(c.arguments)}`)
    .sort()
    .join("");
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
  private readonly noProgressLimit: number;
  private readonly maxTokens?: number;
  private readonly temperature?: number;
  private readonly cwd: string;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly optimizer?: ITokenOptimizer;
  private readonly tokenOptimizationEnabled: boolean;
  private readonly tokenBudget?: number;

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
    const noProgressLimit = options.noProgressLimit;
    this.noProgressLimit =
      typeof noProgressLimit === "number" && Number.isFinite(noProgressLimit)
        ? Math.max(2, Math.floor(noProgressLimit))
        : DEFAULT_NO_PROGRESS_LIMIT;
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? (process.env as Readonly<Record<string, string | undefined>>);
    if (options.optimizer !== undefined) this.optimizer = options.optimizer;
    this.tokenOptimizationEnabled = options.enableTokenOptimization !== false;
    if (options.tokenBudget !== undefined) this.tokenBudget = options.tokenBudget;
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

    await this.maybeOptimize(messages, input.prompt);

    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let toolCallsExecuted = 0;

    // No-progress guard: the signature of the previous turn's tool batch and how
    // many consecutive turns have produced that identical batch (the first
    // occurrence counts as 1).
    let prevBatchSignature: string | undefined;
    let repeatCount = 0;

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

      // No-progress / duplicate-batch guard. A model re-emitting the same tool
      // batch every turn would otherwise burn the entire budget and then error;
      // terminate early with a distinct `"no_progress"` result instead.
      const signature = batchSignature(toolCalls);
      if (signature === prevBatchSignature) {
        repeatCount += 1;
      } else {
        prevBatchSignature = signature;
        repeatCount = 1;
      }
      if (repeatCount >= this.noProgressLimit) {
        this.logger.warn("agent loop stalled on identical tool batches; terminating early", {
          turn,
          repeatCount,
          noProgressLimit: this.noProgressLimit,
          model: this.model,
        });
        return {
          text: result.text ?? "",
          toolCallsExecuted,
          usage,
          turns: turn,
          messages,
          finishReason: "no_progress",
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

  /**
   * Apply the injected token optimizer to the assembled prompt, in place.
   *
   * Splits the message array into a {@link PromptPayload} (system + history),
   * runs the optimizer (lossless stages always; compaction only when over the
   * configured budget), writes the optimized system/history back into
   * `messages`, and publishes the reduction report. Never throws: any optimizer
   * failure is logged and the original prompt is used unchanged.
   *
   * Tool definitions are taken from the runner and only *measured* here (the
   * engine sends `this.tools.list()` per turn, so slimming them would not
   * survive). System-prompt safety is the optimizer's responsibility via its
   * immutable-marker-aware minify stage.
   */
  private async maybeOptimize(messages: ChatMessage[], prompt: string): Promise<void> {
    if (this.optimizer === undefined || !this.tokenOptimizationEnabled) return;
    try {
      const first = messages[0];
      const hasSystem = first !== undefined && first.role === "system";
      const system = hasSystem ? (first as ChatMessage).content : "";
      const history = hasSystem ? messages.slice(1) : messages.slice(0);

      const payload: PromptPayload = {
        system,
        tools: this.tools.list(),
        messages: history,
      };
      const ctx: { prompt?: string; tokenBudget?: number } = { prompt };
      if (this.tokenBudget !== undefined) ctx.tokenBudget = this.tokenBudget;

      const result = await this.optimizer.optimize(payload, ctx);

      // Write back: replace system content and the history slice.
      const next: ChatMessage[] = [];
      if (hasSystem) next.push({ ...(first as ChatMessage), content: result.payload.system });
      next.push(...result.payload.messages);
      messages.length = 0;
      messages.push(...next);

      this.emitTokensOptimized(result);
    } catch (err) {
      this.logger.warn("token optimization skipped after error", {
        error: serializeError(err),
      });
    }
  }

  /** Publish the core-local `tokens.optimized` event (structural) + a log line. */
  private emitTokensOptimized(result: OptimizeResult): void {
    try {
      (this.events as { emit?: (e: unknown) => void } | undefined)?.emit?.({
        type: "tokens.optimized",
        before: result.before.total,
        after: result.after.total,
        reductionPct: result.reductionPct,
        perStage: result.perStage,
      });
    } catch {
      /* the bus isolates handler errors; belt-and-braces */
    }
    this.logger.info("tokens.optimized", {
      before: result.before.total,
      after: result.after.total,
      reductionPct: result.reductionPct,
    });
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
   *
   * An abort signalled *during* the batch is honoured promptly: the in-flight
   * batch is raced against the abort signal, so the run rejects as soon as the
   * signal fires rather than blocking until every (possibly slow) tool settles.
   * The individual tool promises keep running to completion in the background —
   * `executeOne` never throws, so they can never surface as unhandled
   * rejections — but the engine no longer waits on them once aborted.
   */
  private async executeToolCalls(
    calls: ToolCallRequest[],
    signal?: AbortSignal,
  ): Promise<ChatMessage[]> {
    const batch = Promise.all(calls.map((call) => this.executeOne(call, signal)));
    // Keep the batch observed even if the abort branch wins the race, so a slow
    // tool settling later never triggers an unhandled rejection (it can't, since
    // `executeOne` never throws, but this is belt-and-braces).
    batch.catch(() => undefined);

    let results: ToolResult[];
    if (signal) {
      const { promise: aborted, cleanup } = abortRace(signal);
      try {
        results = await Promise.race([batch, aborted]);
      } finally {
        cleanup();
      }
    } else {
      results = await batch;
    }

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
