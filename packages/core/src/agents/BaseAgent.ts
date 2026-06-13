/**
 * {@link BaseAgent} — the standard {@link IAgent} implementation.
 *
 * A BaseAgent pairs an {@link AgentDefinition} (and its system prompt) with
 * an {@link ExecutionEngine}, applying the definition's tool restrictions
 * via a {@link FilteredToolRunner}. All collaborators are injected.
 */

import { AgentError, NoopLogger, UltraCodeError } from "@ultracode/shared";
import type {
  AgentDefinition,
  AgentRunInput,
  AgentRunResult,
  ChatMessage,
  CompletionChunk,
  IAgent,
  IEventBus,
  ILLMProvider,
  Logger,
  ToolDefinition,
} from "@ultracode/shared";
import { ExecutionEngine, isAbortError } from "../execution/ExecutionEngine.js";
import type { ExecutionFinishReason } from "../execution/ExecutionEngine.js";
import type { IToolRunner } from "../execution/types.js";
import { FilteredToolRunner, toolPredicateFor } from "./toolFilter.js";

/**
 * {@link AgentRunResult} augmented with the optional terminal `finishReason`.
 *
 * Added back-compatibly: the field is **optional**, so every existing
 * {@link AgentRunResult} consumer keeps working unchanged, while callers that
 * care can detect a silently-truncated answer (`finishReason: "length"`) or an
 * early no-progress termination (`"no_progress"`).
 */
export interface AgentRunResultWithFinish extends AgentRunResult {
  /** Terminal finish reason of the underlying engine run. */
  finishReason?: ExecutionFinishReason;
}

/** Collects an injected context string for a prompt (e.g. the ContextEngine). */
export type ContextCollector = (prompt: string) => Promise<string>;

/** Construction options for {@link BaseAgent}. */
export interface BaseAgentOptions {
  /** Static agent definition (tool restrictions, overrides, metadata). */
  definition: AgentDefinition;
  /** Resolved system prompt text for this agent. */
  systemPrompt: string;
  /** Provider used for completions. */
  provider: ILLMProvider;
  /** Unfiltered tool runner; the agent applies its own tool restrictions. */
  tools: IToolRunner;
  /** Model identifier (definition/config overrides already resolved). */
  model: string;
  /** Structured logger; defaults to a no-op logger. */
  logger?: Logger;
  /** Optional event bus forwarded to the execution engine. */
  events?: IEventBus;
  /** Maximum model turns per run (engine default: 16). */
  maxTurns?: number;
  /** Token cap forwarded to the provider. */
  maxTokens?: number;
  /** Sampling temperature forwarded to the provider. */
  temperature?: number;
  /** Working directory for tool execution. */
  cwd?: string;
  /** Environment snapshot for tool execution (defaults to `process.env`). */
  env?: Readonly<Record<string, string | undefined>>;
  /** Optional context collector invoked once per run with the prompt. */
  contextCollector?: ContextCollector;
}

/** Extended run input supported by {@link BaseAgent} (superset of {@link AgentRunInput}). */
export interface BaseAgentRunInput extends AgentRunInput {
  /** Prior conversation history to replay before the prompt. */
  history?: ChatMessage[];
  /** Optional streaming callback for incremental output. */
  onChunk?: (chunk: CompletionChunk) => void;
}

/**
 * Standard agent implementation.
 *
 * Failure model (per the shared agent contract):
 * - Unrecoverable failures reject with {@link AgentError} (the original
 *   error preserved as `cause`).
 * - Cancellation rejects with the abort-derived error unchanged.
 */
export class BaseAgent implements IAgent {
  /** Static definition of this agent. */
  public readonly definition: AgentDefinition;

  private readonly systemPrompt: string;
  private readonly tools: FilteredToolRunner;
  private readonly engine: ExecutionEngine;
  private readonly logger: Logger;
  private readonly contextCollector?: ContextCollector;

  constructor(options: BaseAgentOptions) {
    this.definition = options.definition;
    this.systemPrompt = options.systemPrompt;
    this.logger = options.logger ?? new NoopLogger();
    this.contextCollector = options.contextCollector;
    this.tools = new FilteredToolRunner(options.tools, toolPredicateFor(options.definition));

    const engineOptions: ConstructorParameters<typeof ExecutionEngine>[0] = {
      provider: options.provider,
      tools: this.tools,
      model: options.model,
      logger: this.logger,
    };
    if (options.events !== undefined) engineOptions.events = options.events;
    if (options.maxTurns !== undefined) engineOptions.maxTurns = options.maxTurns;
    if (options.maxTokens !== undefined) engineOptions.maxTokens = options.maxTokens;
    if (options.temperature !== undefined) engineOptions.temperature = options.temperature;
    if (options.cwd !== undefined) engineOptions.cwd = options.cwd;
    if (options.env !== undefined) engineOptions.env = options.env;
    this.engine = new ExecutionEngine(engineOptions);
  }

  /** Effective tool definitions available to this agent. */
  listTools(): ToolDefinition[] {
    return this.tools.list();
  }

  /**
   * Run the agent.
   *
   * Resolves with an {@link AgentRunResultWithFinish} — a back-compatible
   * superset of {@link AgentRunResult} that also carries the engine's terminal
   * `finishReason`. A `"length"` finish (provider token-cap truncation) is
   * surfaced on the result **and** logged loudly via `logger.warn` so callers
   * can detect a silently-truncated answer.
   *
   * @throws {AgentError} on unrecoverable failure (cause preserved).
   */
  async run(input: BaseAgentRunInput): Promise<AgentRunResultWithFinish> {
    try {
      let context = "";
      if (this.contextCollector) {
        try {
          context = await this.contextCollector(input.prompt);
        } catch (err) {
          if (isAbortError(err)) throw err;
          this.logger.warn("context collection failed; continuing without context", {
            agent: this.definition.name,
          });
        }
      }

      const engineInput: Parameters<ExecutionEngine["run"]>[0] = {
        prompt: input.prompt,
        systemPrompt: this.systemPrompt,
        context,
      };
      if (input.history !== undefined) engineInput.history = input.history;
      if (input.sessionId !== undefined) engineInput.sessionId = input.sessionId;
      if (input.signal !== undefined) engineInput.signal = input.signal;
      if (input.onChunk !== undefined) engineInput.onChunk = input.onChunk;

      const result = await this.engine.run(engineInput);

      if (result.finishReason === "length") {
        this.logger.warn(
          "model response was truncated by the token cap (finishReason: length); the answer may be incomplete",
          {
            agent: this.definition.name,
            turns: result.turns,
            outputTokens: result.usage.outputTokens,
          },
        );
      }

      return {
        text: result.text,
        toolCallsExecuted: result.toolCallsExecuted,
        usage: result.usage,
        turns: result.turns,
        finishReason: result.finishReason,
      };
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (err instanceof AgentError) throw err;
      const message =
        err instanceof UltraCodeError
          ? `Agent "${this.definition.name}" failed: ${err.message}`
          : `Agent "${this.definition.name}" failed`;
      throw new AgentError(message, {
        cause: err,
        details: { agent: this.definition.name },
      });
    }
  }
}
