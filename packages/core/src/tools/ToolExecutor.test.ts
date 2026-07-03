import type {
  ITool,
  ToolContext,
  ToolDefinition,
  ToolPermission,
  UltraCodeConfig,
} from "ultracode-shared";
import {
  DEFAULT_CONFIG,
  EventBus,
  MAX_TOOL_OUTPUT_CHARS,
  NoopLogger,
  sleep,
  ValidationError,
} from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { ToolExecutor } from "./ToolExecutor.js";
import { ToolRegistry } from "./ToolRegistry.js";

function makeCtx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: process.cwd(), env: {}, logger: new NoopLogger(), ...extra };
}

function makeConfig(mutate?: (c: UltraCodeConfig) => void): UltraCodeConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  mutate?.(config);
  return config;
}

interface FakeToolOptions {
  permission?: ToolPermission;
  execute?: ITool["execute"];
  validate?: (args: unknown) => Record<string, unknown>;
}

function fakeTool(name: string, options: FakeToolOptions = {}): ITool {
  const definition: ToolDefinition = {
    name,
    description: `fake ${name}`,
    category: "utility",
    parameters: { type: "object" },
    permission: options.permission ?? "always",
  };
  return {
    definition,
    validate: options.validate ?? ((args) => (args ?? {}) as Record<string, unknown>),
    execute: options.execute ?? (async () => ({ ok: true, output: "done", durationMs: 0 })),
  };
}

function makeExecutor(
  tools: ITool[],
  config: UltraCodeConfig = makeConfig(),
  events?: EventBus,
): ToolExecutor {
  const registry = new ToolRegistry();
  for (const tool of tools) registry.register(tool);
  return new ToolExecutor(registry, config, new NoopLogger(), events);
}

describe("ToolExecutor", () => {
  it("executes a tool and always sets durationMs", async () => {
    const executor = makeExecutor([fakeTool("ok")]);
    const result = await executor.execute("ok", {}, makeCtx());
    expect(result.ok).toBe(true);
    expect(result.output).toBe("done");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns TOOL_NOT_FOUND for unknown tools", async () => {
    const executor = makeExecutor([]);
    const result = await executor.execute("ghost", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_NOT_FOUND");
  });

  it("denies tools with permission 'never'", async () => {
    const executor = makeExecutor([fakeTool("blocked", { permission: "never" })]);
    const result = await executor.execute("blocked", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("denies 'ask' tools when no confirm callback exists", async () => {
    const executor = makeExecutor([fakeTool("asky", { permission: "ask" })]);
    const result = await executor.execute("asky", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("denies 'ask' tools when confirm resolves false", async () => {
    const executor = makeExecutor([fakeTool("asky", { permission: "ask" })]);
    const result = await executor.execute("asky", {}, makeCtx({ confirm: async () => false }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("runs 'ask' tools when confirm resolves true", async () => {
    const executor = makeExecutor([fakeTool("asky", { permission: "ask" })]);
    const result = await executor.execute("asky", {}, makeCtx({ confirm: async () => true }));
    expect(result.ok).toBe(true);
  });

  it("denies when confirm itself throws", async () => {
    const executor = makeExecutor([fakeTool("asky", { permission: "ask" })]);
    const result = await executor.execute(
      "asky",
      {},
      makeCtx({
        confirm: async () => {
          throw new Error("UI crashed");
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("respects tools.disabled and tools.enabled overrides", async () => {
    const config = makeConfig((c) => {
      c.tools.disabled = ["a", "b"];
      c.tools.enabled = ["b"];
    });
    const executor = makeExecutor([fakeTool("a"), fakeTool("b")], config);

    const denied = await executor.execute("a", {}, makeCtx());
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("TOOL_PERMISSION_DENIED");

    const allowed = await executor.execute("b", {}, makeCtx());
    expect(allowed.ok).toBe(true);
  });

  it("applies perTool permission overrides over the definition default", async () => {
    const config = makeConfig((c) => {
      c.tools.perTool["asky"] = { permission: "always" };
      c.tools.perTool["freely"] = { permission: "never" };
    });
    const executor = makeExecutor(
      [fakeTool("asky", { permission: "ask" }), fakeTool("freely", { permission: "always" })],
      config,
    );

    expect((await executor.execute("asky", {}, makeCtx())).ok).toBe(true);
    const denied = await executor.execute("freely", {}, makeCtx());
    expect(denied.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("converts ValidationError from validate into an ok:false result", async () => {
    const executor = makeExecutor([
      fakeTool("strict", {
        validate: () => {
          throw new ValidationError("bad args");
        },
      }),
    ]);
    const result = await executor.execute("strict", { junk: true }, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("catches tools that throw synchronously and asynchronously", async () => {
    const thrower = fakeTool("boom", {
      execute: () => {
        throw new TypeError("sync explosion");
      },
    });
    const rejecter = fakeTool("doom", {
      execute: async () => {
        throw new RangeError("async explosion");
      },
    });
    const executor = makeExecutor([thrower, rejecter]);

    const r1 = await executor.execute("boom", {}, makeCtx());
    expect(r1.ok).toBe(false);
    expect(r1.error?.message).toContain("sync explosion");

    const r2 = await executor.execute("doom", {}, makeCtx());
    expect(r2.ok).toBe(false);
    expect(r2.error?.message).toContain("async explosion");
  });

  it("rejects malformed results from misbehaving tools", async () => {
    const executor = makeExecutor([
      fakeTool("weird", {
        execute: async () => undefined as never,
      }),
    ]);
    const result = await executor.execute("weird", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("malformed");
  });

  it("enforces the perTool timeout via AbortSignal", async () => {
    const config = makeConfig((c) => {
      c.tools.perTool["slow"] = { timeout: 0.05 };
    });
    const slow = fakeTool("slow", {
      execute: async (_args, ctx) => {
        await sleep(5000, ctx.signal); // honours abort
        return { ok: true, output: "never", durationMs: 0 };
      },
    });
    const executor = makeExecutor([slow], config);

    const started = Date.now();
    const result = await executor.execute("slow", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(4000);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("times out even when the tool ignores the abort signal", async () => {
    const config = makeConfig((c) => {
      c.tools.perTool["stubborn"] = { timeout: 0.05 };
    });
    const stubborn = fakeTool("stubborn", {
      execute: () => new Promise(() => undefined), // never settles
    });
    const executor = makeExecutor([stubborn], config);
    const result = await executor.execute("stubborn", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_TIMEOUT");
  });

  it("fails fast when the upstream signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("user cancelled"));
    const executor = makeExecutor([fakeTool("ok")]);
    const result = await executor.execute("ok", {}, makeCtx({ signal: controller.signal }));
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("aborted");
  });

  it("propagates an upstream abort during execution", async () => {
    const controller = new AbortController();
    const slow = fakeTool("slow", {
      execute: async (_args, ctx) => {
        await sleep(5000, ctx.signal);
        return { ok: true, output: "never", durationMs: 0 };
      },
    });
    const executor = makeExecutor([slow]);
    const pending = executor.execute("slow", {}, makeCtx({ signal: controller.signal }));
    controller.abort(new Error("stop it"));
    const result = await pending;
    expect(result.ok).toBe(false);
  });

  it("truncates huge string outputs to MAX_TOOL_OUTPUT_CHARS", async () => {
    const huge = "x".repeat(1_500_000); // 1.5 MB
    const executor = makeExecutor([
      fakeTool("big", { execute: async () => ({ ok: true, output: huge, durationMs: 0 }) }),
    ]);
    const result = await executor.execute<string>("big", {}, makeCtx());
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS);
  });

  it("truncates huge top-level string properties of object outputs", async () => {
    const huge = "🚀".repeat(200_000); // astral-plane heavy
    const executor = makeExecutor([
      fakeTool("bigobj", {
        execute: async () => ({
          ok: true,
          output: { content: huge, small: "ok" },
          durationMs: 0,
        }),
      }),
    ]);
    const result = await executor.execute<{ content: string; small: string }>(
      "bigobj",
      {},
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect([...result.output.content].length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS);
    expect(result.output.small).toBe("ok");
    // never split a surrogate pair
    expect(result.output.content).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("leaves small outputs untouched", async () => {
    const executor = makeExecutor([
      fakeTool("small", {
        execute: async () => ({ ok: true, output: { a: "b" }, durationMs: 0 }),
      }),
    ]);
    const result = await executor.execute("small", {}, makeCtx());
    expect(result.truncated).toBeUndefined();
    expect(result.output).toEqual({ a: "b" });
  });

  it("emits tool.executed events on success and failure", async () => {
    const events = new EventBus();
    const seen: Array<{ toolName: string; ok: boolean }> = [];
    events.on("tool.executed", (e) => seen.push({ toolName: e.toolName, ok: e.ok }));

    const executor = makeExecutor(
      [fakeTool("ok"), fakeTool("blocked", { permission: "never" })],
      makeConfig(),
      events,
    );
    await executor.execute("ok", {}, makeCtx());
    await executor.execute("blocked", {}, makeCtx());
    await executor.execute("ghost", {}, makeCtx());

    expect(seen).toEqual([
      { toolName: "ok", ok: true },
      { toolName: "blocked", ok: false },
      { toolName: "ghost", ok: false },
    ]);
  });

  it("normalises ok:false results missing an error", async () => {
    const executor = makeExecutor([
      fakeTool("sloppy", {
        execute: async () => ({ ok: false, output: null, durationMs: 0 }),
      }),
    ]);
    const result = await executor.execute("sloppy", {}, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
