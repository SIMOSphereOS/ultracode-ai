import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import {
  AgentError,
  DEFAULT_CONFIG,
  EventBus,
  type AgentDefinition,
  type AgentRunResult,
  type CompletionChunk,
  type ToolDefinition,
} from "@ultracode/shared";
import type { UltraCodeFacade } from "../context.js";
import { App } from "./App.js";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const ENTER = "\r";
const ESC = "\u001B";
const SHIFT_TAB = "\u001B[Z";
const CTRL_C = "\u0003";

const RESULT: AgentRunResult = {
  text: "final answer",
  toolCallsExecuted: 1,
  usage: { inputTokens: 10, outputTokens: 5 },
  turns: 1,
};

interface RunOpts {
  agent?: string;
  sessionId?: string;
  signal?: AbortSignal;
  onChunk?: (c: CompletionChunk) => void;
}

function agentDef(name: string): AgentDefinition {
  return { name, description: `${name} agent`, type: "default" };
}

function toolDef(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    category: "file",
    parameters: { type: "object" },
    permission: "ask",
  };
}

function makeFacade(over: Record<string, unknown> = {}) {
  const bus = new EventBus();
  const facade = {
    config: structuredClone(DEFAULT_CONFIG),
    events: bus,
    sessions: {},
    versioning: {},
    listAgents: vi.fn(() => [agentDef("default"), agentDef("build")]),
    listTools: vi.fn(() => [toolDef("read"), toolDef("write")]),
    getAgent: vi.fn(),
    run: vi.fn(async (_p: string, _o?: RunOpts) => RESULT),
    dispose: vi.fn(async () => {}),
    ...over,
  };
  return { facade: facade as unknown as UltraCodeFacade, bus };
}

async function type(stdin: { write: (s: string) => void }, text: string): Promise<void> {
  stdin.write(text);
  await tick();
  stdin.write(ENTER);
  await tick();
}

describe("App — slash commands", () => {
  it("/help lists the slash commands", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "/help");
    expect(lastFrame()).toContain("Slash commands:");
    expect(lastFrame()).toContain("/theme <name>");
  });

  it("/tools lists the registered tools", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "/tools");
    expect(lastFrame()).toContain("read [file] — read tool");
    expect(lastFrame()).toContain("write [file] — write tool");
  });

  it("/agents lists agents and /agents <name> shows details", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "/agents");
    expect(lastFrame()).toContain("default (default) — default agent");
    await type(stdin, "/agents build");
    expect(lastFrame()).toContain("build (default) — build agent");
    await type(stdin, "/agents nope");
    expect(lastFrame()).toContain('Unknown agent "nope"');
  });

  it("/config show prints redacted config JSON", async () => {
    const { facade } = makeFacade();
    (facade.config as unknown as { providers: Record<string, unknown> }).providers["apiKey"] =
      "leaky-secret-42";
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "/config show");
    expect(lastFrame()).toContain('"theme"');
    expect(lastFrame()).not.toContain("leaky-secret-42");
  });

  it("/theme switches the theme and rejects unknown themes", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    expect(lastFrame()).toContain("theme:dark");
    await type(stdin, "/theme dracula");
    expect(lastFrame()).toContain("theme:dracula");
    await type(stdin, "/theme solarized");
    expect(lastFrame()).toContain('Unknown theme "solarized"');
  });

  it("/clear empties the transcript", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "/help");
    expect(lastFrame()).toContain("Slash commands:");
    await type(stdin, "/clear");
    expect(lastFrame()).not.toContain("Slash commands:");
  });

  it("unknown slash commands produce an error entry", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "/wat");
    expect(lastFrame()).toContain("Unknown command /wat — try /help");
  });

  it("/exit invokes onExit", async () => {
    const { facade } = makeFacade();
    const onExit = vi.fn();
    const { stdin } = render(<App facade={facade} onExit={onExit} />);
    await tick();
    await type(stdin, "/exit");
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("App — running prompts", () => {
  it("streams chunks live, then shows the final answer and token usage", async () => {
    let release: (() => void) | undefined;
    const run = vi.fn((_p: string, opts?: RunOpts) => {
      opts?.onChunk?.({ type: "text", text: "Hel" });
      opts?.onChunk?.({ type: "text", text: "lo" });
      return new Promise<AgentRunResult>((resolve) => {
        release = () => resolve(RESULT);
      });
    });
    const { facade } = makeFacade({ run });
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "hi there");
    expect(lastFrame()).toContain("› hi there");
    expect(lastFrame()).toContain("Hello"); // streamed text visible during the run
    release?.();
    await tick();
    expect(lastFrame()).toContain("final answer");
    expect(lastFrame()).toContain("tokens 10/5");
    expect(run).toHaveBeenCalledWith(
      "hi there",
      expect.objectContaining({ agent: "default" }),
    );
  });

  it("shows an error entry when the run rejects", async () => {
    const run = vi.fn(async () => {
      throw new AgentError("provider exploded");
    });
    const { facade } = makeFacade({ run });
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "boom");
    expect(lastFrame()).toContain("AGENT_ERROR: provider exploded");
  });

  it("Esc aborts the in-flight run via the AbortSignal", async () => {
    let captured: AbortSignal | undefined;
    const run = vi.fn(
      (_p: string, opts?: RunOpts) =>
        new Promise<AgentRunResult>((_resolve, reject) => {
          captured = opts?.signal;
          opts?.signal?.addEventListener("abort", () => {
            reject(new AgentError("aborted by user"));
          });
        }),
    );
    const { facade } = makeFacade({ run });
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "long task");
    expect(captured?.aborted).toBe(false);
    stdin.write(ESC);
    await tick();
    expect(captured?.aborted).toBe(true);
    expect(lastFrame()).toContain("AGENT_ERROR: aborted by user");
  });

  it("uses the session id announced via session.started for follow-up runs", async () => {
    const calls: Array<string | undefined> = [];
    const { facade, bus } = makeFacade();
    (facade.run as ReturnType<typeof vi.fn>).mockImplementation(
      async (_p: string, opts?: RunOpts) => {
        calls.push(opts?.sessionId);
        bus.emit({ type: "session.started", sessionId: "sess-abc-123" });
        return RESULT;
      },
    );
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    await type(stdin, "first");
    expect(lastFrame()).toContain("session:sess-abc");
    await type(stdin, "second");
    expect(calls).toEqual([undefined, "sess-abc-123"]);
  });
});

describe("App — keys and events", () => {
  it("Shift+Tab cycles through the agents", async () => {
    const { facade } = makeFacade();
    const { stdin, lastFrame } = render(<App facade={facade} />);
    await tick();
    expect(lastFrame()).toContain("default ·");
    stdin.write(SHIFT_TAB);
    await tick();
    expect(lastFrame()).toContain("build ·");
    stdin.write(SHIFT_TAB);
    await tick();
    expect(lastFrame()).toContain("default ·");
  });

  it("renders tool.executed events from the event bus", async () => {
    const { facade, bus } = makeFacade();
    const { lastFrame } = render(<App facade={facade} />);
    await tick();
    bus.emit({ type: "tool.executed", toolName: "read", ok: true, durationMs: 12 });
    bus.emit({ type: "tool.executed", toolName: "write", ok: false, durationMs: 99.6 });
    await tick();
    expect(lastFrame()).toContain("✓ read (12ms)");
    expect(lastFrame()).toContain("✗ write (100ms)");
  });

  it("first Ctrl+C shows a hint, second Ctrl+C exits", async () => {
    const { facade } = makeFacade();
    const onExit = vi.fn();
    const { stdin, lastFrame } = render(<App facade={facade} onExit={onExit} />);
    await tick();
    stdin.write(CTRL_C);
    await tick();
    expect(lastFrame()).toContain("Press Ctrl+C again to exit");
    expect(onExit).not.toHaveBeenCalled();
    stdin.write(CTRL_C);
    await tick();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("falls back to the configured default agent when no agents are listed", async () => {
    const { facade } = makeFacade({ listAgents: vi.fn(() => []) });
    const { lastFrame } = render(<App facade={facade} />);
    await tick();
    expect(lastFrame()).toContain("default ·");
  });
});
