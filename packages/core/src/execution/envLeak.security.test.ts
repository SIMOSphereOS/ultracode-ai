/**
 * SEC-001 (real wiring) — credential leak through the bash tool.
 *
 * The previous regression test handed the BashTool a pre-cleaned `ctx.env`, so
 * it never exercised the actual data path that leaks secrets:
 *
 *   ExecutionEngine.env (defaults to process.env) → ctx.env
 *     → ToolExecutor → BashTool childEnv → spawn → stdout → LLM
 *
 * These tests build the REAL `ExecutionEngine` + real tool system (via
 * `createToolSystem`) with NO `env` override, set a marker on `process.env`,
 * and drive a genuine `bash` tool call that prints the environment back. The
 * marker must never appear in the tool output that the model would see; a
 * benign variable (PATH) must.
 */

import { describe, expect, it } from "vitest";
import { EventBus, NoopLogger, DEFAULT_CONFIG } from "@ultracode/shared";
import type {
  CompletionRequest,
  CompletionResult,
  ChatMessage,
  ILLMProvider,
  UltraCodeConfig,
} from "@ultracode/shared";
import { ExecutionEngine } from "./ExecutionEngine.js";
import type { IToolRunner } from "./types.js";
import { createToolSystem } from "../tools/createToolSystem.js";

/** Cross-platform: print a few env vars via the running node binary. */
function printEnvCommand(): string {
  // Joined with '|' so we can assert presence/absence of each piece.
  const code =
    "process.stdout.write([" +
    "process.env.ANTHROPIC_API_KEY||''," +
    "process.env.OPENAI_API_KEY||''," +
    "process.env.UC_LEAK_BENIGN||''," +
    "process.env.PATH?'has-path':''" +
    "].join('|'))";
  return `"${process.execPath}" -e "${code}"`;
}

/**
 * A provider that, on the first turn, requests a single `bash` tool call, then
 * stops on the second turn echoing the tool output it received.
 */
class BashRequestingProvider implements ILLMProvider {
  readonly name = "fake";
  private turn = 0;
  /** The content of the `tool` message fed back after the bash call. */
  toolOutputSeen = "";

  async listModels(): Promise<string[]> {
    return ["fake-model"];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.turn += 1;
    if (this.turn === 1) {
      return {
        text: "",
        toolCalls: [
          { id: "c1", name: "bash", arguments: { command: printEnvCommand() } },
        ],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "tool_calls",
      };
    }
    // Second turn: capture what the engine fed back as the tool result.
    const toolMsg = req.messages.find((m: ChatMessage) => m.role === "tool");
    this.toolOutputSeen = typeof toolMsg?.content === "string" ? toolMsg.content : "";
    return {
      text: "done",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    };
  }

  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<never> {
    throw new Error("stream not used");
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/** DEFAULT_CONFIG clone with bash auto-runnable and an anthropic key configured. */
function configWithBashAlways(): UltraCodeConfig {
  const config = structuredClone(DEFAULT_CONFIG) as unknown as UltraCodeConfig;
  config.tools.perTool["bash"] = { permission: "always" };
  // Also populate the in-memory provider key store so the explicit denylist
  // (provider-derived ANTHROPIC_API_KEY / ULTRACODE_ANTHROPIC_API_KEY) is built.
  (config.providers as { apiKeys?: Record<string, string> }).apiKeys = {
    anthropic: "sk-test-not-used-here",
  };
  return config;
}

describe("SEC-001 env leak (real ExecutionEngine + tool system wiring)", () => {
  it("does not leak process.env credentials into bash tool output, with NO env override", async () => {
    const marker = "uc-e2e-secret-must-not-leak-abc123";
    const openaiMarker = "uc-e2e-openai-secret-xyz789";
    process.env.ANTHROPIC_API_KEY = marker;
    process.env.OPENAI_API_KEY = openaiMarker;
    process.env.UC_LEAK_BENIGN = "benign-visible";
    try {
      const config = configWithBashAlways();
      const logger = new NoopLogger();
      const events = new EventBus();
      const { registry, executor } = createToolSystem(config, logger, events);
      const tools: IToolRunner = {
        execute: (name, args, ctx) => executor.execute(name, args, ctx),
        list: () => registry.list(),
      };

      const provider = new BashRequestingProvider();
      // No `env` option: the engine defaults to the full process.env.
      const engine = new ExecutionEngine({ provider, tools, model: "fake-model", logger });

      const result = await engine.run({ prompt: "inspect the environment" });

      expect(result.finishReason).toBe("stop");
      // The model saw exactly one tool result — inspect it.
      const seen = provider.toolOutputSeen;
      expect(seen.length).toBeGreaterThan(0);
      // Credentials from process.env must NOT have reached the child process.
      expect(seen).not.toContain(marker);
      expect(seen).not.toContain(openaiMarker);
      // A benign variable and PATH must still be present (env still usable).
      expect(seen).toContain("benign-visible");
      expect(seen).toContain("has-path");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.UC_LEAK_BENIGN;
    }
  });
});
