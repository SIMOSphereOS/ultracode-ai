import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, EventBus } from "ultracode-shared";
import type { CliContext, UltraCodeFacade } from "../context.js";
import { runCli } from "../program.js";
import { registerLearnCommands } from "./learn.js";
import type { ConfirmIO } from "./learn.js";
import type {
  AuthoringProposal,
  BudgetDecision,
  BudgetStatusView,
  CostEstimate,
  LearnRunPlan,
  LearnRunReport,
  LearnSource,
  LedgerEntry,
  Skill,
  SkillFrontmatter,
  AuthoringTestResult as TestResult,
} from "ultracode-core";

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const estimate: CostEstimate = {
  pages: 12,
  tokensIn: 40_000,
  tokensOut: 8_000,
  byModel: [{ model: "local", tokensIn: 40_000, tokensOut: 8_000, usd: 0 }],
  usdLow: 0.4,
  usdHigh: 0.9,
  eur: 0.75,
  fxRate: 0.92,
  assumptions: ["BM25, de-de default, safety x1.3"],
};

const statusFixture: BudgetStatusView = {
  spentUsd: 3.5,
  capUsd: 50,
  remainingUsd: 46.5,
  entries: 2,
  byCategory: { learning: 2.5, development: 1 },
};

const ledgerFixture: LedgerEntry[] = [
  { ts: "2026-06-12T08:00:00.000Z", category: "learning", model: "local", estimatedUsd: 0.5, actualUsd: 0.4, note: "docs" },
];

const skillFront: SkillFrontmatter = {
  name: "tavily-search",
  description: "Web search via Tavily",
  version: "1.0.0",
  catalog: "web",
  triggers: ["search"],
  sources: ["https://docs.tavily.com"],
  status: "active",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:00.000Z",
};

const skillFull: Skill = { ...skillFront, body: "# Tavily\nUse the API." };

const proposal: AuthoringProposal = {
  kind: "skill",
  name: "tavily-search",
  skill: skillFull,
  rationale: "New docs ingested",
  diffFromExisting: "+ added rate-limit note",
};

const agentProposal: AuthoringProposal = {
  kind: "agent",
  name: "researcher",
  rationale: "Specialized research agent",
};

const testPass: TestResult = { passed: true, checks: [{ name: "frontmatter", passed: true, detail: "ok" }] };
const testFail: TestResult = { passed: false, checks: [{ name: "frontmatter", passed: false, detail: "missing name" }] };

const source: LearnSource = {
  id: "tavily-docs",
  url: "https://docs.tavily.com",
  type: "web-docs",
  catalog: "web",
  schedule: "on-demand",
  localeDefault: "de-de",
};

const learnPlan: LearnRunPlan = { sourceId: "tavily-docs", candidatePages: ["a", "b"], estimate };

const learnReport: LearnRunReport = {
  sourceId: "tavily-docs",
  pagesChecked: 12,
  notModified: 4,
  unchanged: 2,
  processed: 6,
  errors: 0,
  estimatedUsd: 0.6,
  actualUsd: 0.55,
  skillsCreated: 1,
  skillsUpdated: 2,
  startedAt: "2026-06-12T08:00:00.000Z",
  finishedAt: "2026-06-12T08:05:00.000Z",
};

const allowDecision: BudgetDecision = {
  allowed: true,
  requiresApproval: true,
  remainingUsd: 46.5,
  capUsd: 50,
  reason: "within cap",
};

const blockDecision: BudgetDecision = {
  allowed: false,
  requiresApproval: true,
  remainingUsd: 0,
  capUsd: 1,
  reason: "cap exceeded",
};

/* ------------------------------------------------------------------ */
/* facade & context builders                                          */
/* ------------------------------------------------------------------ */

interface ExtOverrides {
  budget?: Partial<Record<string, unknown>>;
  authoring?: Partial<Record<string, unknown>>;
  learning?: Partial<Record<string, unknown>>;
}

function makeFacade(over: ExtOverrides = {}): UltraCodeFacade {
  const budget = {
    status: vi.fn(async () => statusFixture),
    plan: vi.fn(async () => ({ capUsd: 50, approvalThresholdUsd: 5 })),
    setPlan: vi.fn(async () => {}),
    estimate: vi.fn(async () => estimate),
    check: vi.fn(async () => allowDecision),
    history: vi.fn(async () => ledgerFixture),
    formatReport: vi.fn(
      (e: CostEstimate, d: BudgetDecision) =>
        `COST REPORT\n  est ${e.usdLow}-${e.usdHigh} USD\n  decision: ${d.allowed ? "ALLOW" : "BLOCK"} (${d.reason})\n`,
    ),
    ...over.budget,
  };
  const authoring = {
    skills: {
      list: vi.fn(async () => [skillFront]),
      get: vi.fn(async () => skillFull),
    },
    createSkill: vi.fn(async () => proposal),
    createAgent: vi.fn(async () => agentProposal),
    evolveAgent: vi.fn(async () => agentProposal),
    test: vi.fn(async () => testPass),
    persist: vi.fn(async () => {}),
    scoreSkill: vi.fn(() => 82),
    ...over.authoring,
  };
  const learning = {
    sources: {
      list: vi.fn(async () => [source]),
      add: vi.fn(async () => source),
      remove: vi.fn(async () => true),
    },
    plan: vi.fn(async () => learnPlan),
    run: vi.fn(async () => learnReport),
    ...over.learning,
  };
  return {
    config: structuredClone(DEFAULT_CONFIG),
    events: new EventBus(),
    sessions: {},
    versioning: { analyze: vi.fn(), suggest: vi.fn(), plan: vi.fn(), quality: vi.fn() },
    listAgents: vi.fn(() => []),
    listTools: vi.fn(() => []),
    getAgent: vi.fn(),
    run: vi.fn(),
    dispose: vi.fn(async () => {}),
    budget,
    authoring,
    learning,
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
    stdout: { write: (s: string) => { out += s; }, isTTY: false },
    stderr: { write: (s: string) => { err += s; }, isTTY: false },
    stdin: { isTTY: false, on: () => {}, removeListener: () => {} },
    createFacade: vi.fn(async () => facade),
    gitVersion: vi.fn(async () => "git version 2.43.0"),
    ...over,
  };
  return { ctx, out: () => out, err: () => err };
}

function argv(...a: string[]): string[] {
  return ["node", "ultracode-ai", ...a];
}

/**
 * Drive the learn command with an injected ConfirmIO so the prompt is
 * deterministic and offline. Returns the captured stdout/stderr + exit code.
 */
async function runLearn(
  facade: UltraCodeFacade,
  io: ConfirmIO,
  args: string[],
  ctxOver: Partial<CliContext> = {},
): Promise<{ code: number; out: string; err: string }> {
  const { ctx, out, err } = makeCtx(facade, ctxOver);
  // Re-implement the minimal program path with an injected ConfirmIO.
  const { Command } = await import("commander");
  const program = new Command();
  program.exitOverride().configureOutput({
    writeOut: (s) => ctx.stdout.write(s),
    writeErr: (s) => ctx.stderr.write(s),
  });
  registerLearnCommands(program, ctx, io);
  let code = 0;
  try {
    await program.parseAsync(["node", "ultracode-ai", ...args]);
    code = typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch {
    code = 1;
  }
  return { code, out: out(), err: err() };
}

afterEach(() => {
  process.exitCode = 0;
});

/* ------------------------------------------------------------------ */
/* budget                                                              */
/* ------------------------------------------------------------------ */

describe("budget commands", () => {
  it("budget show prints the status", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("budget", "show"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("Budget Status");
    expect(out()).toContain("Remaining: $46.50");
  });

  it("budget status --json is valid JSON", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("budget", "status", "--json"), ctx);
    expect(JSON.parse(out())).toEqual(statusFixture);
  });

  it("budget plan with --cap installs a plan via setPlan", async () => {
    const setPlan = vi.fn(async () => {});
    const facade = makeFacade({ budget: { setPlan } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("budget", "plan", "--cap", "100", "--threshold", "5"), ctx);
    expect(code).toBe(0);
    expect(setPlan).toHaveBeenCalled();
    expect(out()).toContain("Budget Plan");
  });

  it("budget plan rejects a non-numeric cap with ValidationError", async () => {
    const { ctx, err } = makeCtx(makeFacade());
    const code = await runCli(argv("budget", "plan", "--cap", "lots"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("VALIDATION_ERROR");
  });

  it("budget history --json roundtrips the ledger", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("budget", "history", "--json"), ctx);
    expect(JSON.parse(out())).toEqual(ledgerFixture);
  });

  it("budget history --limit forwards the numeric limit", async () => {
    const history = vi.fn(async () => ledgerFixture);
    const { ctx } = makeCtx(makeFacade({ budget: { history } }));
    await runCli(argv("budget", "history", "--limit", "5"), ctx);
    expect(history).toHaveBeenCalledWith(5);
  });

  it("budget set loads a plan from a JSON file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-budget-"));
    try {
      const file = path.join(tmp, "plan.json");
      await fs.writeFile(file, JSON.stringify({ capUsd: 25 }), "utf8");
      const setPlan = vi.fn(async () => {});
      const { ctx, out } = makeCtx(makeFacade({ budget: { setPlan } }), { cwd: tmp });
      const code = await runCli(argv("budget", "set", file), ctx);
      expect(code).toBe(0);
      expect(setPlan).toHaveBeenCalledWith({ capUsd: 25 });
      expect(out()).toContain("budget plan loaded");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("budget set rejects corrupt JSON", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-budget-"));
    try {
      const file = path.join(tmp, "broken.json");
      await fs.writeFile(file, "{nope", "utf8");
      const { ctx, err } = makeCtx(makeFacade(), { cwd: tmp });
      const code = await runCli(argv("budget", "set", file), ctx);
      expect(code).toBe(1);
      expect(err()).toContain("Invalid JSON");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
});

/* ------------------------------------------------------------------ */
/* skills                                                              */
/* ------------------------------------------------------------------ */

describe("skills commands", () => {
  it("skills list prints the catalog", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("skills", "list"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("tavily-search");
  });

  it("skills list forwards the catalog argument", async () => {
    const list = vi.fn(async () => [skillFront]);
    const { ctx } = makeCtx(makeFacade({ authoring: { skills: { list, get: vi.fn() } } }));
    await runCli(argv("skills", "list", "web"), ctx);
    expect(list).toHaveBeenCalledWith("web");
  });

  it("skills show prints body and score", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("skills", "show", "tavily-search"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("score: 82");
    expect(out()).toContain("Use the API.");
  });

  it("skills show on unknown name exits 1", async () => {
    const facade = makeFacade({
      authoring: { skills: { list: vi.fn(), get: vi.fn(async () => null) } },
    });
    const { ctx, err } = makeCtx(facade);
    const code = await runCli(argv("skills", "show", "nope"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("VALIDATION_ERROR");
  });

  it("skills create from inline flags prints a proposal but does NOT persist without --yes", async () => {
    const persist = vi.fn(async () => {});
    const facade = makeFacade({ authoring: { persist } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("skills", "create", "--topic", "T", "--catalog", "web"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("Proposal (skill): tavily-search");
    expect(out()).toContain("Run again with --yes");
    expect(persist).not.toHaveBeenCalled();
  });

  it("skills create --yes persists the proposal", async () => {
    const persist = vi.fn(async () => {});
    const facade = makeFacade({ authoring: { persist } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("skills", "create", "--topic", "T", "--catalog", "web", "--yes"), ctx);
    expect(code).toBe(0);
    expect(persist).toHaveBeenCalledWith(proposal, { approved: true });
    expect(out()).toContain("persisted");
  });

  it("skills create without material flags exits 1", async () => {
    const { ctx, err } = makeCtx(makeFacade());
    const code = await runCli(argv("skills", "create"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("VALIDATION_ERROR");
  });

  it("skills create --json emits a valid proposal", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    await runCli(argv("skills", "create", "--topic", "T", "--catalog", "web", "--json"), ctx);
    expect((JSON.parse(out()) as AuthoringProposal).name).toBe("tavily-search");
  });

  it("skills test exits 1 when checks fail", async () => {
    const facade = makeFacade({ authoring: { test: vi.fn(async () => testFail) } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("skills", "test", "--topic", "T", "--catalog", "web"), ctx);
    expect(code).toBe(1);
    expect(out()).toContain("✗ FAILED");
  });

  it("skills create from a unicode material file roundtrips", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-skill-"));
    try {
      const file = path.join(tmp, "m.json");
      await fs.writeFile(file, JSON.stringify({ catalog: "web", topic: "🚀 émoji", summary: "s", facts: [], codeSnippets: [], sources: [] }), "utf8");
      const createSkill = vi.fn(async () => proposal);
      const { ctx } = makeCtx(makeFacade({ authoring: { createSkill } }), { cwd: tmp });
      const code = await runCli(argv("skills", "create", "--file", file), ctx);
      expect(code).toBe(0);
      expect(createSkill).toHaveBeenCalledWith(expect.objectContaining({ topic: "🚀 émoji" }));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
});

/* ------------------------------------------------------------------ */
/* agents (authoring)                                                  */
/* ------------------------------------------------------------------ */

describe("agents authoring commands", () => {
  it("agents create prints an agent proposal, no persist without --yes", async () => {
    const persist = vi.fn(async () => {});
    const facade = makeFacade({ authoring: { persist } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("agents", "create", "--topic", "T", "--catalog", "ops"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("Proposal (agent): researcher");
    expect(persist).not.toHaveBeenCalled();
  });

  it("agents evolve --yes persists", async () => {
    const persist = vi.fn(async () => {});
    const facade = makeFacade({ authoring: { persist } });
    const { ctx } = makeCtx(facade);
    const code = await runCli(argv("agents", "evolve", "--topic", "T", "--catalog", "ops", "--yes"), ctx);
    expect(code).toBe(0);
    expect(persist).toHaveBeenCalledWith(agentProposal, { approved: true });
  });

  it("agents create surfaces a missing core method as ValidationError", async () => {
    const facade = makeFacade({ authoring: { createAgent: undefined } });
    const { ctx, err } = makeCtx(facade);
    const code = await runCli(argv("agents", "create", "--topic", "T", "--catalog", "ops"), ctx);
    expect(code).toBe(1);
    expect(err()).toContain("VALIDATION_ERROR");
  });

  it("agents test exits 1 on failure", async () => {
    const facade = makeFacade({ authoring: { test: vi.fn(async () => testFail) } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("agents", "test", "--topic", "T", "--catalog", "ops"), ctx);
    expect(code).toBe(1);
    expect(out()).toContain("✗ FAILED");
  });

  it("agents list (from ./list.ts) still works alongside authoring subcommands", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("agents", "list"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("(no agents available)");
  });
});

/* ------------------------------------------------------------------ */
/* learn sources                                                       */
/* ------------------------------------------------------------------ */

describe("learn sources commands", () => {
  it("learn sources list prints sources", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("learn", "sources", "list"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("tavily-docs");
  });

  it("learn sources add forwards the url and options", async () => {
    const add = vi.fn(async () => source);
    const { ctx, out } = makeCtx(makeFacade({ learning: { sources: { list: vi.fn(), add, remove: vi.fn() } } }));
    const code = await runCli(argv("learn", "sources", "add", "https://x.dev", "--catalog", "web", "--locale", "en-us"), ctx);
    expect(code).toBe(0);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ url: "https://x.dev", catalog: "web", localeDefault: "en-us" }));
    expect(out()).toContain("added source");
  });

  it("learn sources remove exits 1 when not found", async () => {
    const facade = makeFacade({ learning: { sources: { list: vi.fn(), add: vi.fn(), remove: vi.fn(async () => false) } } });
    const { ctx, out } = makeCtx(facade);
    const code = await runCli(argv("learn", "sources", "remove", "ghost"), ctx);
    expect(code).toBe(1);
    expect(out()).toContain("not found");
  });

  it("learn schedule prints schedules", async () => {
    const { ctx, out } = makeCtx(makeFacade());
    const code = await runCli(argv("learn", "schedule"), ctx);
    expect(code).toBe(0);
    expect(out()).toContain("tavily-docs: on-demand");
  });
});

/* ------------------------------------------------------------------ */
/* learn run — cost report + approval gate                             */
/* ------------------------------------------------------------------ */

describe("learn run", () => {
  it("shows the cost report and does NOT run without approval (no TTY, no --yes)", async () => {
    const run = vi.fn(async () => learnReport);
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(async () => learnPlan), run } });
    const io: ConfirmIO = { interactive: false, confirm: vi.fn(async () => true) };
    const { code, out } = await runLearn(facade, io, ["learn", "run", "tavily-docs"]);
    expect(out).toContain("COST REPORT");
    expect(run).not.toHaveBeenCalled();
    expect(out).toContain("Refusing to start without approval");
    expect(code).toBe(1);
  });

  it("with --yes shows the report THEN runs", async () => {
    const run = vi.fn(async () => learnReport);
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(async () => learnPlan), run } });
    const io: ConfirmIO = { interactive: false, confirm: vi.fn(async () => false) };
    const { code, out } = await runLearn(facade, io, ["learn", "run", "tavily-docs", "--yes"]);
    expect(out).toContain("COST REPORT");
    expect(run).toHaveBeenCalledWith("tavily-docs", expect.objectContaining({ approved: true }));
    expect(out).toContain("Learn Run — tavily-docs");
    expect(code).toBe(0);
  });

  it("interactive YES approves the run; the report comes first", async () => {
    const run = vi.fn(async () => learnReport);
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(async () => learnPlan), run } });
    const confirm = vi.fn(async () => true);
    const io: ConfirmIO = { interactive: true, confirm };
    const { code } = await runLearn(facade, io, ["learn", "run", "tavily-docs"]);
    expect(confirm).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it("interactive NO aborts the run before any network/LLM work", async () => {
    const run = vi.fn(async () => learnReport);
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(async () => learnPlan), run } });
    const io: ConfirmIO = { interactive: true, confirm: vi.fn(async () => false) };
    const { code, out } = await runLearn(facade, io, ["learn", "run", "tavily-docs"]);
    expect(run).not.toHaveBeenCalled();
    expect(out).toContain("Aborted.");
    expect(code).toBe(1);
  });

  it("a budget block prevents the run even with --yes", async () => {
    const run = vi.fn(async () => learnReport);
    const facade = makeFacade({
      budget: { check: vi.fn(async () => blockDecision) },
      learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(async () => learnPlan), run },
    });
    const io: ConfirmIO = { interactive: false, confirm: vi.fn() };
    const { code, out } = await runLearn(facade, io, ["learn", "run", "tavily-docs", "--yes"]);
    expect(out).toContain("blocked by budget");
    expect(run).not.toHaveBeenCalled();
    expect(code).toBe(1);
  });

  it("defaults to the single source when no id is given", async () => {
    const run = vi.fn(async () => learnReport);
    const plan = vi.fn(async () => learnPlan);
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan, run } });
    const io: ConfirmIO = { interactive: false, confirm: vi.fn() };
    const { code } = await runLearn(facade, io, ["learn", "run", "--yes"]);
    expect(plan).toHaveBeenCalledWith("tavily-docs");
    expect(code).toBe(0);
  });

  it("ambiguous (multiple sources, no id) fails with ValidationError", async () => {
    const second: LearnSource = { ...source, id: "other" };
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source, second]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(), run: vi.fn() } });
    const io: ConfirmIO = { interactive: false, confirm: vi.fn() };
    const { code } = await runLearn(facade, io, ["learn", "run", "--yes"]);
    expect(code).toBe(1);
  });

  it("learn run --json emits the report as JSON after the cost report", async () => {
    const facade = makeFacade({ learning: { sources: { list: vi.fn(async () => [source]), add: vi.fn(), remove: vi.fn() }, plan: vi.fn(async () => learnPlan), run: vi.fn(async () => learnReport) } });
    const io: ConfirmIO = { interactive: false, confirm: vi.fn() };
    const { code, out } = await runLearn(facade, io, ["learn", "run", "tavily-docs", "--yes", "--json"]);
    expect(code).toBe(0);
    const jsonStart = out.indexOf("{");
    expect(JSON.parse(out.slice(jsonStart))).toEqual(learnReport);
  });
});
