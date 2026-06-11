import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentError,
  ConfigError,
  DEFAULT_CONFIG,
  EventBus,
  type AgentDefinition,
  type ChangeAnalysis,
  type QualityReport,
  type ReleasePlan,
  type ToolDefinition,
  type VersionSuggestion,
} from "@ultracode/shared";
import type { CliContext, UltraCodeFacade } from "./context.js";
import { runCli } from "./program.js";

/* ------------------------------------------------------------------ */
/* fixtures & helpers                                                   */
/* ------------------------------------------------------------------ */

const analysisFixture: ChangeAnalysis = {
  files: [{ path: "src/a.ts", status: "modified", additions: 5, deletions: 1 }],
  commits: [{ hash: "abc1234", type: "feat", scope: null, subject: "add a", breaking: false }],
  breakingChanges: [],
  categories: { feat: 1, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 },
  securityFindings: [],
};

const suggestionFixture: VersionSuggestion = {
  currentVersion: "0.1.0",
  suggestedVersion: "0.2.0",
  bump: "minor",
  confidence: 0.9,
  reasons: ["one new feature"],
};

const planFixture: ReleasePlan = {
  version: "v0.2.0",
  milestones: [{ title: "Ship it", items: ["build"], done: false }],
  risks: [],
  changelogDraft: "### Added\n- a",
};

const qualityPass: QualityReport = {
  passed: true,
  overallScore: 95,
  gates: [{ gate: "coverage", passed: true, score: 95, details: "ok" }],
};

const qualityFail: QualityReport = {
  passed: false,
  overallScore: 40,
  gates: [{ gate: "coverage", passed: false, score: 40, details: "below threshold" }],
};

function makeTool(i: number): ToolDefinition {
  return {
    name: `tool${i}`,
    description: `does thing ${i}`,
    category: "utility",
    parameters: { type: "object" },
    permission: "ask",
  };
}

function makeAgent(name: string): AgentDefinition {
  return { name, description: `${name} agent`, type: "default" };
}

type FacadeOverrides = Partial<Record<keyof UltraCodeFacade | "configManager", unknown>>;

function makeFacade(overrides: FacadeOverrides = {}): UltraCodeFacade {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    events: new EventBus(),
    sessions: {},
    versioning: {
      analyze: vi.fn(async () => analysisFixture),
      suggest: vi.fn(async () => suggestionFixture),
      plan: vi.fn(async () => planFixture),
      quality: vi.fn(async () => qualityPass),
    },
    listAgents: vi.fn(() => [makeAgent("default")]),
    listTools: vi.fn(() => [makeTool(0)]),
    getAgent: vi.fn(),
    run: vi.fn(async () => ({
      text: "answer",
      toolCallsExecuted: 0,
      usage: { inputTokens: 3, outputTokens: 7 },
      turns: 1,
    })),
    dispose: vi.fn(async () => {}),
    ...overrides,
  } as unknown as UltraCodeFacade;
}

function makeCtx(facade: UltraCodeFacade, over: Partial<CliContext> = {}) {
  let out = "";
  let err = "";
  const ctx: CliContext = {
    cwd: os.tmpdir(),
    env: {},
    homedir: os.tmpdir(),
    nodeVersion: "20.0.0",
    stdout: {
      write: (s: string) => {
        out += s;
      },
      isTTY: false,
    },
    stderr: {
      write: (s: string) => {
        err += s;
      },
      isTTY: false,
    },
    stdin: {
      isTTY: false,
      on: () => {},
      removeListener: () => {},
    },
    createFacade: vi.fn(async () => facade),
    gitVersion: vi.fn(async () => "git version 2.43.0"),
    ...over,
  };
  return { ctx, out: () => out, err: () => err };
}

function argv(...args: string[]): string[] {
  return ["node", "ultracode", ...args];
}

afterEach(() => {
  process.exitCode = 0;
});

/* ------------------------------------------------------------------ */
/* global behaviour                                                     */
/* ------------------------------------------------------------------ */

describe("runCli — global behaviour", () => {
  it("--version prints the CLI version and exits 0", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("--version"), ctx);
    expect(code).toBe(0);
    expect(out()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--help exits 0 and lists commands", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("--help"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("run");
    expect(out()).toContain("doctor");
  });

  it("unknown commands exit non-zero with a commander error", async () => {
    const { ctx, err } = makeCtx(makeFacade());
    const code = await runCli(argv("frobnicate"), ctx);
    expect(code).not.toBe(0);
    expect(err()).toContain("unknown command");
  });

  it("without TTY and without arguments prints a hint plus help and exits 1", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv(), ctx);
    expect(code).toBe(1);
    expect(out()).toContain("No interactive terminal detected");
    expect(out()).toContain("Usage:");
  });

  it("maps UltraCodeError from facade creation to exit 1 with the error code", async () => {
    const { ctx, err } = makeCtx(makeFacade(), {
      createFacade: vi.fn(async () => {
        throw new ConfigError("bad toml at line 3");
      }),
    });
    const code = await runCli(argv("tools", "list"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("CONFIG_ERROR");
    expect(err()).toContain("bad toml at line 3");
    expect(err()).not.toContain("\u001B["); // no ANSI on non-TTY stderr
  });

  it("colours UltraCodeError output on a TTY stderr", async () => {
    let err = "";
    const { ctx } = makeCtx(makeFacade(), {
      createFacade: vi.fn(async () => {
        throw new ConfigError("boom");
      }),
      stderr: {
        write: (s: string) => {
          err += s;
        },
        isTTY: true,
      },
    });
    await runCli(argv("tools", "list"), ctx);
    expect(err).toContain("\u001B[31m");
  });

  it("unknown errors print a --debug hint and exit 1", async () => {
    const { ctx, err } = makeCtx(makeFacade(), {
      createFacade: vi.fn(async () => {
        throw new TypeError("kaputt");
      }),
    });
    const code = await runCli(argv("tools", "list"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("Unexpected error: kaputt");
    expect(err()).toContain("--debug");
  });

  it("prints the stack with --debug for unknown errors", async () => {
    const { ctx, err } = makeCtx(makeFacade(), {
      createFacade: vi.fn(async () => {
        throw new TypeError("kaputt");
      }),
    });
    await runCli(argv("tools", "list", "--debug"), ctx);
    expect(err()).toContain("TypeError: kaputt");
    expect(err()).not.toContain("Run again with --debug");
  });
});

/* ------------------------------------------------------------------ */
/* run                                                                  */
/* ------------------------------------------------------------------ */

describe("runCli — run command", () => {
  it("streams chunks live to stdout in order and exits 0", async () => {
    const facade = makeFacade({
      run: vi.fn(async (_p: string, opts?: { onChunk?: (t: string) => void }) => {
        opts?.onChunk?.("Hello ");
        opts?.onChunk?.("World");
        return { text: "Hello World", toolCallsExecuted: 0, usage: { inputTokens: 1, outputTokens: 1 }, turns: 1 };
      }),
    });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("run", "-p", "hi"), ctx);
    expect(code).toBe(0);
    expect(out()).toBe("Hello World\n");
  });

  it("prints result.text when the provider does not stream", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("run", "--print", "hi"), ctx);
    expect(code).toBe(0);
    expect(out()).toBe("answer\n");
  });

  it("forwards the agent option and a >= 1 MB unicode prompt unchanged", async () => {
    const run = vi.fn(async () => ({
      text: "",
      toolCallsExecuted: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      turns: 1,
    }));
    const { ctx } = makeCtx(makeFacade({ run }));
    const huge = `🚀${"x".repeat(1_100_000)}é`;
    const code = await runCli(argv("run", "-p", huge, "--agent", "build"), ctx);
    expect(code).toBe(0);
    expect(run).toHaveBeenCalledWith(huge, expect.objectContaining({ agent: "build" }));
  });

  it("--json prints the full result as valid JSON", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("run", "-p", "hi", "--json"), ctx);
    expect(code).toBe(0);
    const parsed = JSON.parse(out()) as { text: string; usage: { inputTokens: number } };
    expect(parsed.text).toBe("answer");
    expect(parsed.usage.inputTokens).toBe(3);
  });

  it("exits 1 and reports the AgentError when the run fails — facade still disposed", async () => {
    const facade = makeFacade({
      run: vi.fn(async () => {
        throw new AgentError("model exploded");
      }),
    });
    const { ctx, err } = makeCtx(facade);
    const code = await runCli(argv("run", "-p", "hi"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("AGENT_ERROR");
    expect(err()).toContain("model exploded");
    expect(facade.dispose).toHaveBeenCalled();
  });

  it("requires the -p option", async () => {
    const { ctx } = makeCtx(makeFacade());
    const code = await runCli(argv("run"), ctx);
    expect(code).not.toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* tools / agents list                                                  */
/* ------------------------------------------------------------------ */

describe("runCli — tools/agents list", () => {
  it("tools list with zero entries", async () => {
    const { ctx, out } = makeCtx(makeFacade({ listTools: vi.fn(() => []) }));
    const code = await runCli(argv("tools", "list"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("(no tools registered)");
  });

  it("tools list with 100 entries renders a full table", async () => {
    const tools = Array.from({ length: 100 }, (_, i) => makeTool(i));
    const { ctx, out } = makeCtx(makeFacade({ listTools: vi.fn(() => tools) }));
    const code = await runCli(argv("tools", "list"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("tool0");
    expect(out()).toContain("tool99");
    expect(out()).toContain("Permission");
  });

  it("tools list --json emits valid JSON with 100 entries", async () => {
    const tools = Array.from({ length: 100 }, (_, i) => makeTool(i));
    const { ctx, out } = makeCtx(makeFacade({ listTools: vi.fn(() => tools) }));
    await runCli(argv("tools", "list", "--json"), ctx);
    const parsed = JSON.parse(out()) as ToolDefinition[];
    expect(parsed).toHaveLength(100);
    expect(parsed[0]?.name).toBe("tool0");
  });

  it("agents list with zero entries", async () => {
    const { ctx, out } = makeCtx(makeFacade({ listAgents: vi.fn(() => []) }));
    await runCli(argv("agents", "list"), ctx);
    expect(out()).toContain("(no agents available)");
  });

  it("agents list renders names, types and emoji descriptions", async () => {
    const agents: AgentDefinition[] = [
      { name: "build", description: "🚧 builds stuff", type: "specialized", model: "m-large" },
      { name: "review", description: "reviews", type: "subagent" },
    ];
    const { ctx, out } = makeCtx(makeFacade({ listAgents: vi.fn(() => agents) }));
    const code = await runCli(argv("agents", "list"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("build");
    expect(out()).toContain("🚧 builds stuff");
    expect(out()).toContain("m-large");
    expect(out()).toContain("(active model)");
  });

  it("agents list --json is valid JSON", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("agents", "list", "--json"), ctx);
    expect(JSON.parse(out())).toEqual([makeAgent("default")]);
  });
});

/* ------------------------------------------------------------------ */
/* config                                                               */
/* ------------------------------------------------------------------ */

interface ManagerMock {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function makeManager(initial: Record<string, unknown> = {}): ManagerMock {
  const store = { ...initial };
  return {
    store,
    get: vi.fn((p: string) => store[p]),
    set: vi.fn((p: string, v: unknown) => {
      store[p] = v;
    }),
    validate: vi.fn(),
    save: vi.fn(async () => {}),
  };
}

describe("runCli — config", () => {
  it("config get reads through the mocked manager", async () => {
    const manager = makeManager({ "core.activeModel": "mistral-large" });
    const { ctx, out } = makeCtx(makeFacade({ configManager: manager }));
    const code = await runCli(argv("config", "get", "core.activeModel"), ctx);
    expect(code).toBe(0);
    expect(out()).toBe("mistral-large\n");
    expect(manager.get).toHaveBeenCalledWith("core.activeModel");
  });

  it("config get falls back to the config object without a manager", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("config", "get", "ui.theme"), ctx);
    expect(code).toBe(0);
    expect(out()).toBe("dark\n");
  });

  it("config get --json wraps path and value", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("config", "get", "core.maxTokens", "--json"), ctx);
    expect(JSON.parse(out())).toEqual({ path: "core.maxTokens", value: 32000 });
  });

  it("config get on an unknown path exits 1 with CONFIG_ERROR", async () => {
    const { ctx, err } = makeCtx(makeFacade());
    const code = await runCli(argv("config", "get", "no.such.path"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("CONFIG_ERROR");
  });

  it("config set/get roundtrip against the mocked manager (typed values, save to user)", async () => {
    const manager = makeManager();
    const facade = makeFacade({ configManager: manager });
    const { ctx, out } = makeCtx(facade);

    expect(await runCli(argv("config", "set", "core.debug", "true"), ctx)).toBe(0);
    expect(manager.set).toHaveBeenCalledWith("core.debug", true);
    expect(manager.save).toHaveBeenCalledWith("user");

    const code = await runCli(argv("config", "get", "core.debug", "--json"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain('{"path":"core.debug","value":true}');
  });

  it("config set parses numbers and JSON arrays", async () => {
    const manager = makeManager();
    const { ctx } = makeCtx(makeFacade({ configManager: manager }));
    await runCli(argv("config", "set", "core.maxTokens", "16000"), ctx);
    expect(manager.set).toHaveBeenCalledWith("core.maxTokens", 16000);
    await runCli(argv("config", "set", "tools.disabled", '["web_search"]'), ctx);
    expect(manager.set).toHaveBeenCalledWith("tools.disabled", ["web_search"]);
  });

  it("config set without a ConfigManager exits 1 with CONFIG_ERROR", async () => {
    const { ctx, err } = makeCtx(makeFacade());
    const code = await runCli(argv("config", "set", "ui.theme", "light"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("CONFIG_ERROR");
  });

  it("config show masks secrets and prefers core's redacted view", async () => {
    const facade = makeFacade();
    (facade.config as unknown as Record<string, unknown>)["providers"] = {
      ...facade.config.providers,
      apiKey: "leaky-secret-9999",
    };
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("config", "show"), ctx);
    expect(code).toBe(0);
    expect(out()).not.toContain("leaky-secret-9999");
    expect(out()).toContain("ui.theme = \"dark\"");
  });

  it("config show --json is valid JSON", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("config", "show", "--json"), ctx);
    const parsed = JSON.parse(out()) as { core: { language: string } };
    expect(parsed.core.language).toBe("en");
  });

  it("config show uses manager.redacted() when available", async () => {
    const manager = {
      ...makeManager(),
      redacted: vi.fn(() => ({ marker: "from-core-redacted" })),
    };
    const { ctx, out } = makeCtx(makeFacade({ configManager: manager }));
    await runCli(argv("config", "show", "--json"), ctx);
    expect(out()).toContain("from-core-redacted");
    expect(manager.redacted).toHaveBeenCalled();
  });

  it("config validate reports success", async () => {
    const manager = makeManager();
    const { ctx, out } = makeCtx(makeFacade({ configManager: manager }));
    const code = await runCli(argv("config", "validate"), ctx);
    expect(code).toBe(0);
    expect(manager.validate).toHaveBeenCalled();
    expect(out()).toContain("✓ configuration is valid");
  });

  it("config validate surfaces validation failures as exit 1", async () => {
    const manager = makeManager();
    manager.validate.mockImplementation(() => {
      throw new ConfigError("temperature out of range");
    });
    const { ctx, err } = makeCtx(makeFacade({ configManager: manager }));
    const code = await runCli(argv("config", "validate"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("temperature out of range");
  });

  it("config export writes a JSON file and import feeds it back through the manager", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-config-"));
    try {
      const manager = makeManager();
      const facade = makeFacade({ configManager: manager });
      const { ctx, out } = makeCtx(facade, { cwd: tmp });

      const file = path.join(tmp, "export.json");
      expect(await runCli(argv("config", "export", file), ctx)).toBe(0);
      const exported = JSON.parse(await fs.readFile(file, "utf8")) as { ui: { theme: string } };
      expect(exported.ui.theme).toBe("dark");
      expect(out()).toContain("exported");

      expect(await runCli(argv("config", "import", file), ctx)).toBe(0);
      expect(manager.set).toHaveBeenCalledWith("ui.theme", "dark");
      expect(manager.save).toHaveBeenCalledWith("user");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("config export without a file prints JSON to stdout", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("config", "export"), ctx);
    expect((JSON.parse(out()) as { core: { maxTokens: number } }).core.maxTokens).toBe(32000);
  });

  it("config import rejects corrupt JSON files with exit 1", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-config-"));
    try {
      const file = path.join(tmp, "broken.json");
      await fs.writeFile(file, "{not json", "utf8");
      const { ctx, err } = makeCtx(makeFacade({ configManager: makeManager() }), { cwd: tmp });
      const code = await runCli(argv("config", "import", file), ctx);
      expect(code).toBe(1);
      expect(err()).toContain("Invalid JSON");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("config import on a missing file exits 1", async () => {
    const { ctx, err } = makeCtx(makeFacade({ configManager: makeManager() }));
    const code = await runCli(argv("config", "import", "does-not-exist.json"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("Cannot read config file");
  });
});

/* ------------------------------------------------------------------ */
/* versioning / release / quality                                       */
/* ------------------------------------------------------------------ */

describe("runCli — versioning", () => {
  it("version analyze prints the formatted analysis and forwards the range", async () => {
    const facade = makeFacade();
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("version", "analyze", "v0.1.0..HEAD"), ctx);
    expect(code).toBe(0);
    expect(facade.versioning.analyze).toHaveBeenCalledWith("v0.1.0..HEAD");
    expect(out()).toContain("Change Analysis");
    expect(out()).toContain("feat 1");
  });

  it("version analyze --json roundtrips", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("version", "analyze", "--json"), ctx);
    expect(JSON.parse(out())).toEqual(analysisFixture);
  });

  it("version suggest prints the formatted suggestion", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("version", "suggest"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("0.1.0 → 0.2.0 (minor bump, confidence 90%)");
  });

  it("version suggest --json roundtrips", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("version", "suggest", "--json"), ctx);
    expect(JSON.parse(out())).toEqual(suggestionFixture);
  });

  it("release plan prints milestones and forwards the version argument", async () => {
    const facade = makeFacade();
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("release", "plan", "v0.2.0"), ctx);
    expect(code).toBe(0);
    expect(facade.versioning.plan).toHaveBeenCalledWith("v0.2.0");
    expect(out()).toContain("Release Plan v0.2.0");
    expect(out()).toContain("[ ] Ship it");
  });

  it("quality exits 0 and shows ✓ when gates pass", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("quality"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("✓ PASSED");
  });

  it("quality exits 1 and shows ✗ when gates fail", async () => {
    const facade = makeFacade({
      versioning: {
        analyze: vi.fn(),
        suggest: vi.fn(),
        plan: vi.fn(),
        quality: vi.fn(async () => qualityFail),
      },
    });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("quality"), ctx);
    expect(code).toBe(1);
    expect(out()).toContain("✗ FAILED");
    expect(out()).toContain("✗ coverage (40) — below threshold");
  });

  it("quality --json is valid JSON", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("quality", "--json"), ctx);
    expect(JSON.parse(out())).toEqual(qualityPass);
  });
});

/* ------------------------------------------------------------------ */
/* doctor (through the program)                                         */
/* ------------------------------------------------------------------ */

describe("runCli — doctor", () => {
  it("passes in a healthy environment and prints the checklist", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-doctor-prog-"));
    try {
      const { ctx, out } = makeCtx(makeFacade(), {
        homedir: tmp,
        env: { ANTHROPIC_API_KEY: "sk-ant-very-secret" },
      });
      const code = await runCli(argv("doctor"), ctx);
      expect(code).toBe(0);
      expect(out()).toContain("✓ node:");
      expect(out()).toContain("✓ git:");
      expect(out()).toContain("✓ api-keys:");
      expect(out()).not.toContain("sk-ant-very-secret");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("exits 1 on an unsupported Node version but still reports git", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-doctor-prog-"));
    try {
      const { ctx, out } = makeCtx(makeFacade(), {
        homedir: tmp,
        nodeVersion: "18.19.0",
        gitVersion: vi.fn(async () => null),
      });
      const code = await runCli(argv("doctor"), ctx);
      expect(code).toBe(1);
      expect(out()).toContain("✗ node:");
      expect(out()).toContain("✗ git:");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("doctor --json emits a machine-readable report", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-doctor-prog-"));
    try {
      const { ctx, out } = makeCtx(makeFacade(), { homedir: tmp });
      await runCli(argv("doctor", "--json"), ctx);
      const parsed = JSON.parse(out()) as { ok: boolean; checks: Array<{ name: string }> };
      expect(parsed.ok).toBe(true);
      expect(parsed.checks.map((c) => c.name)).toContain("config");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
