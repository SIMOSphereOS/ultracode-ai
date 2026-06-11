/**
 * ToolRegistry — the catalogue of available tools.
 *
 * Holds {@link ITool} instances keyed by their definition name. Registration
 * of a duplicate name throws a {@link ToolError} (the registry is the single
 * source of truth; silent replacement would mask wiring bugs).
 */

import { ToolError } from "@ultracode/shared";
import type { ITool, ToolDefinition } from "@ultracode/shared";

/** Any tool, regardless of its argument/output generics. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ITool<any, any>;

/**
 * Registry of named tools.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  /**
   * Register a tool under its definition name.
   *
   * @throws {ToolError} when the name is empty or already registered.
   */
  register(tool: AnyTool): void {
    const name = tool?.definition?.name;
    if (typeof name !== "string" || name.trim() === "") {
      throw new ToolError("Cannot register a tool without a non-empty name", {
        toolName: String(name ?? ""),
      });
    }
    if (this.tools.has(name)) {
      throw new ToolError(`A tool named "${name}" is already registered`, {
        toolName: name,
      });
    }
    this.tools.set(name, tool);
  }

  /**
   * Remove a tool by name.
   *
   * @returns `true` when a tool was removed, `false` when none was registered.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Look up a tool by name; `undefined` when not registered. */
  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  /** Whether a tool with the given name is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Definitions of all registered tools, sorted by name. */
  list(): ToolDefinition[] {
    return [...this.tools.values()]
      .map((t) => t.definition)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }
}
