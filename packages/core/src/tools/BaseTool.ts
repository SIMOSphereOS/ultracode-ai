/**
 * BaseTool — shared plumbing for the built-in tools.
 *
 * Implements the {@link ITool} contract on top of a zod schema:
 * - `validate` parses raw input and throws exactly {@link ValidationError}.
 * - `execute` wraps the concrete {@link BaseTool.run} so it **never rejects**;
 *   any thrown error becomes an `ok: false` result via `serializeError`, and
 *   `durationMs` is always populated.
 */

import { ValidationError, serializeError } from "ultracode-shared";
import type { ITool, ToolContext, ToolDefinition, ToolResult } from "ultracode-shared";
import type { z } from "zod";

/** What a concrete tool's {@link BaseTool.run} returns on success. */
export interface ToolRunOutcome<TOut> {
  /** Successful output payload. */
  output: TOut;
  /** Set when the tool already truncated its own output. */
  truncated?: boolean;
}

/**
 * Abstract base class for built-in tools.
 *
 * @typeParam S - zod schema describing the tool's arguments.
 * @typeParam TOut - successful output payload type.
 */
export abstract class BaseTool<S extends z.ZodTypeAny, TOut>
  implements ITool<z.output<S>, TOut>
{
  /** Static tool definition (name, category, parameters, permission). */
  abstract readonly definition: ToolDefinition;
  /** zod schema used by {@link BaseTool.validate}. */
  protected abstract readonly schema: S;

  /**
   * Validate and narrow raw arguments via the zod schema.
   *
   * @throws {ValidationError} when arguments do not satisfy the schema.
   */
  validate(args: unknown): z.output<S> {
    const result = this.schema.safeParse(args);
    if (!result.success) {
      const summary = result.error.issues
        .map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `${where}: ${issue.message}`;
        })
        .join("; ");
      throw new ValidationError(
        `Invalid arguments for tool "${this.definition.name}": ${summary}`,
        { details: { issues: JSON.parse(JSON.stringify(result.error.issues)) as unknown[] } },
      );
    }
    return result.data as z.output<S>;
  }

  /** Execute the tool; resolves with a {@link ToolResult}, never rejects. */
  async execute(args: z.output<S>, ctx: ToolContext): Promise<ToolResult<TOut>> {
    const start = Date.now();
    try {
      const outcome = await this.run(args, ctx);
      const result: ToolResult<TOut> = {
        ok: true,
        output: outcome.output,
        durationMs: Date.now() - start,
      };
      if (outcome.truncated) result.truncated = true;
      return result;
    } catch (err) {
      return {
        ok: false,
        output: null as unknown as TOut,
        error: serializeError(err),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * The tool's actual behaviour. May throw any error — `execute` converts it
   * into an `ok: false` result.
   */
  protected abstract run(args: z.output<S>, ctx: ToolContext): Promise<ToolRunOutcome<TOut>>;

  /** Throw the context's abort reason when the signal is already aborted. */
  protected throwIfAborted(ctx: ToolContext): void {
    if (ctx.signal?.aborted) {
      throw ctx.signal.reason instanceof Error
        ? ctx.signal.reason
        : new Error(`Tool "${this.definition.name}" aborted`);
    }
  }
}
