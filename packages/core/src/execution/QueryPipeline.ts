/**
 * Small, testable query pipeline with four explicit stages:
 * `parse` → `validate` → `execute` → `format`.
 *
 * The pipeline owns no model or tool logic itself — the `execute` stage
 * delegates to an injected executor (typically an agent run), keeping every
 * stage unit-testable in isolation.
 */

import { AgentError, UltraCodeError, ValidationError, NoopLogger } from "ultracode-shared";
import type { AgentRunResult, Logger } from "ultracode-shared";
import { isAbortError } from "./ExecutionEngine.js";

/** Result of the `parse` stage. */
export interface ParsedQuery {
  /** The cleaned prompt text (line endings normalised, trimmed). */
  prompt: string;
  /** Agent addressed via a leading `@agent` mention, when present. */
  agent?: string;
  /** The original raw input. */
  raw: string;
}

/** Executor invoked by the `execute` stage. */
export type QueryExecutor = (query: ParsedQuery) => Promise<AgentRunResult>;

/** Construction options for {@link QueryPipeline}. */
export interface QueryPipelineOptions {
  /** Performs the actual run (usually `agentManager.get(...).run(...)`). */
  execute: QueryExecutor;
  /** Upper bound on prompt length in characters; unlimited when omitted. */
  maxPromptLength?: number;
  /** Structured logger; defaults to a no-op logger. */
  logger?: Logger;
}

/** Aggregated outcome of {@link QueryPipeline.run}. */
export interface QueryPipelineResult {
  /** The parsed and validated query. */
  query: ParsedQuery;
  /** The raw run result. */
  result: AgentRunResult;
  /** Human-readable formatted output. */
  formatted: string;
}

/** Matches a leading `@agent-name` mention followed by whitespace. */
const AGENT_MENTION = /^@([A-Za-z0-9_-]+)\s+/;

/**
 * Stage-based query pipeline. All stages are public so they can be tested
 * (and reused) independently; {@link QueryPipeline.run} chains them.
 */
export class QueryPipeline {
  private readonly executor: QueryExecutor;
  private readonly maxPromptLength: number;
  private readonly logger: Logger;

  constructor(options: QueryPipelineOptions) {
    this.executor = options.execute;
    this.maxPromptLength =
      typeof options.maxPromptLength === "number" &&
      Number.isFinite(options.maxPromptLength) &&
      options.maxPromptLength > 0
        ? Math.floor(options.maxPromptLength)
        : Number.POSITIVE_INFINITY;
    this.logger = options.logger ?? new NoopLogger();
  }

  /**
   * Parse raw user input into a {@link ParsedQuery}.
   *
   * Normalises `\r\n`/`\r` line endings, trims surrounding whitespace and
   * extracts a leading `@agent` mention.
   *
   * @throws {ValidationError} when the input is not a string.
   */
  parse(raw: unknown): ParsedQuery {
    if (typeof raw !== "string") {
      throw new ValidationError("Query input must be a string", {
        details: { receivedType: typeof raw },
      });
    }
    let prompt = raw.replace(/\r\n?/g, "\n").trim();
    const query: ParsedQuery = { prompt, raw };
    const mention = AGENT_MENTION.exec(prompt);
    if (mention?.[1]) {
      query.agent = mention[1];
      prompt = prompt.slice(mention[0].length).trim();
      query.prompt = prompt;
    }
    return query;
  }

  /**
   * Validate a parsed query.
   *
   * @throws {ValidationError} when the prompt is empty or exceeds the
   *   configured maximum length.
   */
  validate(query: ParsedQuery): ParsedQuery {
    if (query.prompt.trim().length === 0) {
      throw new ValidationError("Query prompt must not be empty");
    }
    if (query.prompt.length > this.maxPromptLength) {
      throw new ValidationError(
        `Query prompt exceeds the maximum length of ${this.maxPromptLength} characters`,
        { details: { length: query.prompt.length, maxPromptLength: this.maxPromptLength } },
      );
    }
    return query;
  }

  /**
   * Execute a validated query via the injected executor.
   *
   * UltraCode errors and abort-derived errors pass through unchanged; any
   * other failure is wrapped in an {@link AgentError}.
   */
  async execute(query: ParsedQuery): Promise<AgentRunResult> {
    try {
      return await this.executor(query);
    } catch (err) {
      if (err instanceof UltraCodeError || isAbortError(err)) throw err;
      this.logger.error("query execution failed", { agent: query.agent });
      throw new AgentError("Query execution failed", { cause: err });
    }
  }

  /** Format a run result for display. */
  format(result: AgentRunResult): string {
    const text = result.text.trim();
    return text.length > 0 ? text : "(no output)";
  }

  /** Run all four stages in order. */
  async run(raw: unknown): Promise<QueryPipelineResult> {
    const query = this.validate(this.parse(raw));
    const result = await this.execute(query);
    return { query, result, formatted: this.format(result) };
  }
}
