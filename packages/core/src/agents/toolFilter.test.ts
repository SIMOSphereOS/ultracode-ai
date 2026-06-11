import { describe, expect, it } from "vitest";
import { NoopLogger } from "@ultracode/shared";
import type { ToolContext, ToolDefinition, ToolResult } from "@ultracode/shared";
import type { IToolRunner } from "../execution/types.js";
import {
  FilteredToolRunner,
  matchesToolPattern,
  resolveEffectiveTools,
  toolPredicateFor,
} from "./toolFilter.js";

const def = (name: string): ToolDefinition => ({
  name,
  description: name,
  category: "utility",
  parameters: { type: "object" },
  permission: "always",
});

const ALL = ["read", "write_file", "edit", "delete_file", "bash", "grep", "glob", "git_status", "git_commit"].map(def);

class RecordingRunner implements IToolRunner {
  readonly executed: string[] = [];
  list(): ToolDefinition[] {
    return ALL;
  }
  async execute(name: string): Promise<ToolResult> {
    this.executed.push(name);
    return { ok: true, output: name, durationMs: 1 };
  }
}

const ctx: ToolContext = { cwd: "/tmp", env: {}, logger: new NoopLogger() };

describe("matchesToolPattern", () => {
  it("matches exact names without wildcards", () => {
    expect(matchesToolPattern("read", "read")).toBe(true);
    expect(matchesToolPattern("read", "reader")).toBe(false);
    expect(matchesToolPattern("git", "git_status")).toBe(false);
  });

  it("supports * wildcards", () => {
    expect(matchesToolPattern("git_*", "git_status")).toBe(true);
    expect(matchesToolPattern("git_*", "git_")).toBe(true);
    expect(matchesToolPattern("git_*", "git")).toBe(false);
    expect(matchesToolPattern("git_*", "digit_status")).toBe(false);
    expect(matchesToolPattern("*", "anything")).toBe(true);
  });

  it("escapes regex metacharacters in patterns", () => {
    expect(matchesToolPattern("read.file", "read.file")).toBe(true);
    expect(matchesToolPattern("read.file", "readXfile")).toBe(false);
    expect(matchesToolPattern("a+b", "a+b")).toBe(true);
    expect(matchesToolPattern("a(b)*", "a(b)_suffix")).toBe(true);
  });
});

describe("toolPredicateFor / resolveEffectiveTools", () => {
  it("uses disabledTools as a deny-list when no allow-list is set", () => {
    const names = resolveEffectiveTools(
      { disabledTools: ["write_file", "edit", "delete_file", "bash"] },
      ALL,
    ).map((t) => t.name);
    expect(names).toEqual(["read", "grep", "glob", "git_status", "git_commit"]);
  });

  it("lets enabledTools (allow-list, with wildcards) override disabledTools", () => {
    const names = resolveEffectiveTools(
      { enabledTools: ["read", "grep", "glob", "git_*"], disabledTools: ["git_status", "read"] },
      ALL,
    ).map((t) => t.name);
    expect(names).toEqual(["read", "grep", "glob", "git_status", "git_commit"]);
  });

  it("returns everything when neither list is set", () => {
    expect(resolveEffectiveTools({}, ALL)).toHaveLength(ALL.length);
  });

  it("supports wildcard deny-lists", () => {
    const allowed = toolPredicateFor({ disabledTools: ["git_*"] });
    expect(allowed("git_status")).toBe(false);
    expect(allowed("read")).toBe(true);
  });
});

describe("FilteredToolRunner", () => {
  it("filters list() to allowed tools", () => {
    const runner = new FilteredToolRunner(
      new RecordingRunner(),
      toolPredicateFor({ enabledTools: ["read", "git_*"] }),
    );
    expect(runner.list().map((t) => t.name)).toEqual(["read", "git_status", "git_commit"]);
  });

  it("executes allowed tools through the inner runner", async () => {
    const inner = new RecordingRunner();
    const runner = new FilteredToolRunner(inner, toolPredicateFor({}));
    const result = await runner.execute("read", {}, ctx);
    expect(result.ok).toBe(true);
    expect(inner.executed).toEqual(["read"]);
  });

  it("refuses disallowed tools with ok:false TOOL_NOT_FOUND and never throws", async () => {
    const inner = new RecordingRunner();
    const runner = new FilteredToolRunner(inner, toolPredicateFor({ disabledTools: ["bash"] }));
    const result = await runner.execute("bash", { command: "rm -rf /" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_NOT_FOUND");
    expect(inner.executed).toEqual([]);
  });
});
