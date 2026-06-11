/**
 * `todo` — in-memory task list (read/write).
 *
 * Category: utility • Default permission: always (architecture tool table —
 * grouped with the always-on analysis/utility tools).
 *
 * The store lives in the tool instance — one list per tool system.
 */

import { z } from "zod";
import { ValidationError, generateId } from "@ultracode/shared";
import type { ToolContext, ToolDefinition } from "@ultracode/shared";
import { BaseTool } from "../BaseTool.js";
import type { ToolRunOutcome } from "../BaseTool.js";

/** Allowed todo states. */
export type TodoStatus = "pending" | "in_progress" | "completed";

/** A single todo item. */
export interface TodoItem {
  /** Stable identifier (generated when omitted on write). */
  id: string;
  /** Task description. */
  content: string;
  /** Current state. */
  status: TodoStatus;
}

const todoItemSchema = z.object({
  id: z.string().min(1).optional(),
  content: z.string().min(1).max(10_000),
  status: z.enum(["pending", "in_progress", "completed"]).default("pending"),
});

const schema = z.object({
  /** `"read"` returns the list; `"write"` replaces it. */
  action: z.enum(["read", "write"]),
  /** New list contents (required for `"write"`). */
  todos: z.array(todoItemSchema).max(1000).optional(),
});

/** Successful output of the `todo` tool. */
export interface TodoToolOutput {
  /** The current todo list. */
  todos: TodoItem[];
  /** Number of items. */
  count: number;
}

/** In-memory todo list with validated read/write actions. */
export class TodoTool extends BaseTool<typeof schema, TodoToolOutput> {
  readonly definition: ToolDefinition = {
    name: "todo",
    description: "Read or replace the in-memory todo list",
    category: "utility",
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["read", "write"], description: "read or write" },
        todos: {
          type: "array",
          description: "New list contents (write only)",
          items: {
            type: "object",
            required: ["content"],
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
                default: "pending",
              },
            },
          },
        },
      },
    },
    permission: "always",
  };
  protected readonly schema = schema;

  private todos: TodoItem[] = [];

  override validate(args: unknown): z.output<typeof schema> {
    const parsed = super.validate(args);
    if (parsed.action === "write" && parsed.todos === undefined) {
      throw new ValidationError('Tool "todo": action "write" requires a "todos" array');
    }
    return parsed;
  }

  protected async run(
    args: z.output<typeof schema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<TodoToolOutput>> {
    this.throwIfAborted(ctx);
    if (args.action === "write") {
      this.todos = (args.todos ?? []).map((t) => ({
        id: t.id ?? generateId("todo"),
        content: t.content,
        status: t.status,
      }));
    }
    // Return a defensive copy so callers cannot mutate the store.
    const todos = this.todos.map((t) => ({ ...t }));
    return { output: { todos, count: todos.length } };
  }
}
