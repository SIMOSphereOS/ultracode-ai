import { describe, expect, it } from "vitest";
import { NoopLogger, ValidationError } from "ultracode-shared";
import type { ToolContext } from "ultracode-shared";
import { TodoTool } from "./TodoTool.js";

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: process.cwd(), env: {}, logger: new NoopLogger(), ...extra };
}

describe("TodoTool", () => {
  it("starts empty and round-trips write/read", async () => {
    const tool = new TodoTool();

    const empty = await tool.execute(tool.validate({ action: "read" }), ctx());
    expect(empty.ok).toBe(true);
    expect(empty.output.todos).toEqual([]);

    const written = await tool.execute(
      tool.validate({
        action: "write",
        todos: [
          { content: "erste Aufgabe 📝", status: "in_progress" },
          { id: "fixed-id", content: "zweite" },
        ],
      }),
      ctx(),
    );
    expect(written.ok).toBe(true);
    expect(written.output.count).toBe(2);
    expect(written.output.todos[0]?.status).toBe("in_progress");
    expect(written.output.todos[0]?.id).toBeTruthy();
    expect(written.output.todos[1]).toEqual({
      id: "fixed-id",
      content: "zweite",
      status: "pending", // default applied
    });

    const read = await tool.execute(tool.validate({ action: "read" }), ctx());
    expect(read.output.todos).toEqual(written.output.todos);
  });

  it("keeps stores isolated per instance", async () => {
    const a = new TodoTool();
    const b = new TodoTool();
    await a.execute(a.validate({ action: "write", todos: [{ content: "only in a" }] }), ctx());
    const result = await b.execute(b.validate({ action: "read" }), ctx());
    expect(result.output.todos).toEqual([]);
  });

  it("write replaces the whole list", async () => {
    const tool = new TodoTool();
    await tool.execute(tool.validate({ action: "write", todos: [{ content: "x" }] }), ctx());
    await tool.execute(tool.validate({ action: "write", todos: [] }), ctx());
    const read = await tool.execute(tool.validate({ action: "read" }), ctx());
    expect(read.output.todos).toEqual([]);
  });

  it("returned lists are defensive copies", async () => {
    const tool = new TodoTool();
    await tool.execute(tool.validate({ action: "write", todos: [{ content: "x" }] }), ctx());
    const first = await tool.execute(tool.validate({ action: "read" }), ctx());
    first.output.todos[0]!.content = "MUTATED";
    const second = await tool.execute(tool.validate({ action: "read" }), ctx());
    expect(second.output.todos[0]?.content).toBe("x");
  });

  it("validates strictly", () => {
    const tool = new TodoTool();
    expect(() => tool.validate({ action: "write" })).toThrow(ValidationError); // todos required
    expect(() => tool.validate({ action: "purge" })).toThrow(ValidationError);
    expect(() => tool.validate({ action: "write", todos: [{ content: "" }] })).toThrow(
      ValidationError,
    );
    expect(() =>
      tool.validate({ action: "write", todos: [{ content: "x", status: "done" }] }),
    ).toThrow(ValidationError);
    expect(() =>
      tool.validate({
        action: "write",
        todos: Array.from({ length: 1001 }, () => ({ content: "x" })),
      }),
    ).toThrow(ValidationError);
    expect(() => tool.validate(undefined)).toThrow(ValidationError);
  });
});
