/**
 * Offline, deterministic tests for the budget module.
 *
 * Filesystem under `os.tmpdir()/mkdtemp`; clock injected; no network. Covers
 * the cost formula (EUR+USD snapshot), policy boundaries (auto/ask/hard-cap),
 * alerts (50/80/100 %), atomic + corrupt-tolerant ledger, period rollover,
 * extreme inputs and local=0 pricing.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Logger } from "ultracode-shared";

import { NoopLogger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type BudgetPlanner, createBudgetPlanner } from "./BudgetPlanner.js";
import {
  DEFAULT_FX_RATE,
  DEFAULT_PLAN_ENVELOPES,
  USD_HIGH_FACTOR,
  USD_LOW_FACTOR,
} from "./defaults.js";
import { BudgetError } from "./errors.js";
import { ledgerFile, planFile } from "./paths.js";
import type { BudgetPlan, EstimateInput } from "./types.js";

/** Lifetime cap seeded for the `learning` envelope by `installDefaultPlan`. */
const LEARNING_TOTAL_USD = DEFAULT_PLAN_ENVELOPES.find((e) => e.category === "learning")!.totalUsd;

const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 } as const;

let homeDir: string;
const logger: Logger = new NoopLogger();

/** Fixed clock for determinism. */
function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}

function makePlanner(now?: () => Date): BudgetPlanner {
  return createBudgetPlanner({
    logger,
    homeDir,
    now: now ?? fixedClock("2026-06-12T10:00:00.000Z"),
  });
}

beforeEach(async () => {
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "ultracode-budget-"));
});

afterEach(async () => {
  await fs.rm(homeDir, RM);
  vi.restoreAllMocks();
});

describe("estimate — cost formula", () => {
  it("produces a deterministic EUR+USD snapshot for a simple single-model run", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "learning",
      perItemTokensIn: 1000,
      perItemTokensOut: 500,
      batch: 10,
      routing: [{ model: "mistral-small", share: 1 }],
    });
    // tokensIn  base = 1000*10 = 10000; *1.2*1.1 = 13200
    // tokensOut base =  500*10 =  5000; *1.2*1.1 =  6600
    expect(est.tokensIn).toBe(13200);
    expect(est.tokensOut).toBe(6600);
    // usd = ((13200/1e6)*0.05 + (6600/1e6)*0.15) * 0.5 * 2.0
    //     = (0.00066 + 0.00099) * 1 = 0.00165
    expect(est.byModel).toHaveLength(1);
    expect(est.byModel[0]!.usd).toBeCloseTo(0.00165, 6);
    expect(est.usdLow).toBeCloseTo(0.00165 * USD_LOW_FACTOR, 5);
    expect(est.usdHigh).toBeCloseTo(0.00165 * USD_HIGH_FACTOR, 5);
    expect(est.eur).toBeCloseTo(0.00165 * DEFAULT_FX_RATE, 5);
    expect(est.fxRate).toBe(DEFAULT_FX_RATE);
  });

  it("splits cost across a routing mix and normalises shares", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "development",
      perItemTokensIn: 1_000_000,
      perItemTokensOut: 0,
      batch: 1,
      routing: [
        { model: "mistral-small", share: 3 },
        { model: "sonnet", share: 1 },
      ],
    });
    // shares normalise to 0.75 / 0.25
    expect(est.byModel.map((m) => m.model)).toEqual(["mistral-small", "sonnet"]);
    const totalUsd = est.byModel.reduce((a, m) => a + m.usd, 0);
    expect(totalUsd).toBeGreaterThan(0);
    // sonnet (1.50/MTok) costs more per token than mistral despite lower share
    expect(est.byModel[1]!.usd).toBeGreaterThan(0);
  });

  it("derives input tokens from texts via the heuristic counter", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "learning",
      texts: ["hello world", "another page of docs"],
      perItemTokensOut: 100,
    });
    expect(est.pages).toBe(2);
    expect(est.tokensIn).toBeGreaterThan(0);
    expect(est.assumptions.some((a) => a.includes("counted from 2 text(s)"))).toBe(true);
  });

  it("local/ollama models cost exactly 0", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "operations",
      perItemTokensIn: 5_000_000,
      perItemTokensOut: 5_000_000,
      batch: 100,
      routing: [{ model: "local", share: 1 }],
    });
    expect(est.byModel[0]!.usd).toBe(0);
    expect(est.usdLow).toBe(0);
    expect(est.usdHigh).toBe(0);
    expect(est.eur).toBe(0);
  });

  it("honours a custom safety factor", () => {
    const planner = makePlanner();
    const base = planner.estimate({
      category: "development",
      perItemTokensIn: 1000,
      perItemTokensOut: 1000,
      batch: 1,
      safetyFactor: 1,
    });
    const doubled = planner.estimate({
      category: "development",
      perItemTokensIn: 1000,
      perItemTokensOut: 1000,
      batch: 1,
      safetyFactor: 2,
    });
    expect(doubled.byModel[0]!.usd).toBeCloseTo(base.byModel[0]!.usd * 2, 8);
  });
});

describe("estimate — extreme inputs", () => {
  it("empty / zero input yields zero cost without throwing", () => {
    const planner = makePlanner();
    const est = planner.estimate({ category: "development" });
    expect(est.tokensIn).toBe(0);
    expect(est.tokensOut).toBe(0);
    expect(est.byModel[0]!.usd).toBe(0);
    expect(est.pages).toBe(1);
  });

  it("a >=1MB text never throws and stays finite", () => {
    const planner = makePlanner();
    const big = "lorem ipsum ".repeat(100_000); // ~1.2 MB
    const est = planner.estimate({ category: "learning", texts: [big], perItemTokensOut: 0 });
    expect(Number.isFinite(est.tokensIn)).toBe(true);
    expect(Number.isFinite(est.eur)).toBe(true);
    expect(est.tokensIn).toBeGreaterThan(0);
  });

  it("unicode/emoji/surrogate text is counted without NaN", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "learning",
      texts: ["😀🎉 𝕌𝕝𝕥𝕣𝕒 中文 العربية"],
      perItemTokensOut: 0,
    });
    expect(Number.isFinite(est.tokensIn)).toBe(true);
    expect(est.tokensIn).toBeGreaterThan(0);
  });

  it("negative/non-finite inputs are clamped to 0", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "development",
      perItemTokensIn: -100,
      perItemTokensOut: Number.NaN as unknown as number,
      batch: -5,
    });
    expect(est.tokensIn).toBe(0);
    expect(est.tokensOut).toBe(0);
  });

  it("huge batch stays finite", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "development",
      perItemTokensIn: 1000,
      perItemTokensOut: 1000,
      batch: 1_000_000,
    });
    expect(Number.isFinite(est.usdHigh)).toBe(true);
    expect(est.usdHigh).toBeGreaterThan(0);
  });
});

describe("check — policy boundaries", () => {
  async function plannerWithPlan(plan: BudgetPlan): Promise<BudgetPlanner> {
    const planner = makePlanner();
    await planner.setPlan(plan);
    return planner;
  }

  const plan = (
    askThresholdUsd: number | null,
    caps?: Partial<BudgetPlan["envelopes"][number]>,
  ): BudgetPlan => ({
    policy: "ask-threshold",
    fxRate: 0.92,
    updatedAt: "2026-06-12T10:00:00.000Z",
    envelopes: [
      {
        category: "development",
        perRunUsd: caps?.perRunUsd ?? null,
        dailyUsd: caps?.dailyUsd ?? null,
        monthlyUsd: caps?.monthlyUsd ?? null,
        totalUsd: caps?.totalUsd ?? null,
        askThresholdUsd,
      },
    ],
  });

  it("auto-allows below the ask threshold", async () => {
    const planner = await plannerWithPlan(plan(1.0));
    const est = {
      tokensIn: 0,
      tokensOut: 0,
      byModel: [],
      usdLow: 0.1,
      usdHigh: 0.5,
      eur: 0,
      fxRate: 0.92,
      assumptions: [],
    };
    const d = planner.check(est, "development");
    expect(d.allowed).toBe(true);
    expect(d.requiresApproval).toBe(false);
  });

  it("requires approval at/above the ask threshold", async () => {
    const planner = await plannerWithPlan(plan(0.5));
    const est = {
      tokensIn: 0,
      tokensOut: 0,
      byModel: [],
      usdLow: 0.4,
      usdHigh: 0.5,
      eur: 0,
      fxRate: 0.92,
      assumptions: [],
    };
    const d = planner.check(est, "development");
    expect(d.allowed).toBe(true);
    expect(d.requiresApproval).toBe(true);
  });

  it("always requires approval when ask threshold is null", async () => {
    const planner = await plannerWithPlan(plan(null));
    const est = {
      tokensIn: 0,
      tokensOut: 0,
      byModel: [],
      usdLow: 0,
      usdHigh: 0.001,
      eur: 0,
      fxRate: 0.92,
      assumptions: [],
    };
    const d = planner.check(est, "development");
    expect(d.requiresApproval).toBe(true);
  });

  it("refuses on a per-run hard cap breach", async () => {
    const planner = await plannerWithPlan(plan(0.5, { perRunUsd: 1 }));
    const est = {
      tokensIn: 0,
      tokensOut: 0,
      byModel: [],
      usdLow: 1.5,
      usdHigh: 2,
      eur: 0,
      fxRate: 0.92,
      assumptions: [],
    };
    const d = planner.check(est, "development");
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("hard cap");
    expect(d.capUsd).toBe(1);
  });

  it("refuses when a daily cap would be breached by accumulated spend", async () => {
    const planner = await plannerWithPlan(plan(10, { dailyUsd: 5 }));
    await planner.record({
      ts: "2026-06-12T09:00:00.000Z",
      category: "development",
      estimatedUsd: 4,
      actualUsd: 4,
    });
    const est = {
      tokensIn: 0,
      tokensOut: 0,
      byModel: [],
      usdLow: 1.5,
      usdHigh: 2,
      eur: 0,
      fxRate: 0.92,
      assumptions: [],
    };
    const d = planner.check(est, "development");
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("daily");
  });

  it("auto-allows uncapped categories without an envelope", async () => {
    const planner = makePlanner();
    const est = {
      tokensIn: 0,
      tokensOut: 0,
      byModel: [],
      usdLow: 100,
      usdHigh: 999,
      eur: 0,
      fxRate: 0.92,
      assumptions: [],
    };
    const d = planner.check(est, "operations");
    expect(d.allowed).toBe(true);
    expect(d.requiresApproval).toBe(false);
    expect(d.capUsd).toBeNull();
  });
});

describe("alerts — 50/80/100 %", () => {
  it("emits one alert per band crossing as monthly spend grows", async () => {
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    const bus = { emit: (e: unknown) => events.push(e as { type: string }), on: () => () => {} };
    const planner = createBudgetPlanner({
      logger,
      events: bus as never,
      homeDir,
      now: fixedClock("2026-06-12T10:00:00.000Z"),
    });
    await planner.setPlan({
      policy: "ask-threshold",
      fxRate: 0.92,
      updatedAt: "2026-06-12T10:00:00.000Z",
      envelopes: [
        {
          category: "learning",
          perRunUsd: null,
          dailyUsd: null,
          monthlyUsd: 100,
          totalUsd: null,
          askThresholdUsd: null,
        },
      ],
    });
    await planner.record({
      ts: "2026-06-12T10:00:00.000Z",
      category: "learning",
      estimatedUsd: 55,
      actualUsd: 55,
    });
    await planner.record({
      ts: "2026-06-12T11:00:00.000Z",
      category: "learning",
      estimatedUsd: 30,
      actualUsd: 30,
    });
    await planner.record({
      ts: "2026-06-12T12:00:00.000Z",
      category: "learning",
      estimatedUsd: 20,
      actualUsd: 20,
    });

    const alerts = events.filter((e) => e.type === "budget.alert");
    const bands = alerts.map((a) => a.pct).sort((x, y) => Number(x) - Number(y));
    expect(bands).toEqual([50, 80, 100]);
  });
});

describe("ledger — atomic + corrupt-tolerant", () => {
  it("appends entries as JSON lines and reloads them", async () => {
    const planner = makePlanner();
    await planner.record({
      ts: "2026-06-12T10:00:00.000Z",
      category: "development",
      estimatedUsd: 1,
      actualUsd: 1,
    });
    await planner.record({
      ts: "2026-06-12T10:05:00.000Z",
      category: "development",
      estimatedUsd: 2,
      actualUsd: 2.5,
    });

    const raw = await fs.readFile(ledgerFile(homeDir), "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).actualUsd).toBe(2.5);

    const fresh = makePlanner();
    const count = await fresh.loadLedger();
    expect(count).toBe(2);
    const st = fresh.status();
    expect(st.totalSpentUsd).toBeCloseTo(3.5, 6);
  });

  it("skips corrupt lines on load without throwing", async () => {
    const file = ledgerFile(homeDir);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      [
        JSON.stringify({
          ts: "2026-06-12T10:00:00.000Z",
          category: "learning",
          estimatedUsd: 1,
          actualUsd: 1,
        }),
        "{ this is not json",
        JSON.stringify({ category: "learning" }), // malformed (missing fields)
        JSON.stringify({
          ts: "2026-06-12T11:00:00.000Z",
          category: "learning",
          estimatedUsd: 2,
          actualUsd: 2,
        }),
        "",
      ].join("\n"),
      "utf8",
    );
    const planner = makePlanner();
    const valid = await planner.loadLedger();
    expect(valid).toBe(2);
    expect(planner.status().totalSpentUsd).toBeCloseTo(3, 6);
  });

  it("serialises concurrent appends without losing entries", async () => {
    const planner = makePlanner();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        planner.record({
          ts: "2026-06-12T10:00:00.000Z",
          category: "development",
          estimatedUsd: 1,
          actualUsd: 1,
          note: `n${i}`,
        }),
      ),
    );
    const raw = await fs.readFile(ledgerFile(homeDir), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(8);
  });

  it("wraps a filesystem failure in a BudgetError", async () => {
    const planner = makePlanner();
    const spy = vi
      .spyOn(fs, "mkdir")
      .mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));
    await expect(
      planner.record({
        ts: "2026-06-12T10:00:00.000Z",
        category: "development",
        estimatedUsd: 1,
        actualUsd: 1,
      }),
    ).rejects.toBeInstanceOf(BudgetError);
    spy.mockRestore();
  });
});

describe("period rollover", () => {
  it("separates spend across UTC days and months", async () => {
    const planner = createBudgetPlanner({
      logger,
      homeDir,
      now: fixedClock("2026-07-01T10:00:00.000Z"),
    });
    // entries in different periods, loaded with a July clock
    const file = ledgerFile(homeDir);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      [
        JSON.stringify({
          ts: "2026-06-30T10:00:00.000Z",
          category: "development",
          estimatedUsd: 5,
          actualUsd: 5,
        }),
        JSON.stringify({
          ts: "2026-07-01T08:00:00.000Z",
          category: "development",
          estimatedUsd: 3,
          actualUsd: 3,
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    await planner.loadLedger();
    const st = planner.status();
    const dev = st.categories.find((c) => c.category === "development")!;
    expect(dev.spentTotalUsd).toBeCloseTo(8, 6);
    expect(dev.spentTodayUsd).toBeCloseTo(3, 6); // only July 1
    expect(dev.spentMonthUsd).toBeCloseTo(3, 6); // only July
  });
});

describe("plan management", () => {
  it("installDefaultPlan writes a learning pot and persists plan.toml", async () => {
    const planner = makePlanner();
    await planner.installDefaultPlan();
    const plan = planner.getPlan();
    expect(plan.envelopes.map((e) => e.category)).toEqual([
      "development",
      "learning",
      "operations",
    ]);
    const learning = plan.envelopes.find((e) => e.category === "learning")!;
    expect(learning.totalUsd).toBe(LEARNING_TOTAL_USD);

    const raw = await fs.readFile(planFile(homeDir), "utf8");
    expect(raw).toContain("learning");

    const reloaded = makePlanner();
    const loaded = await reloaded.loadPlan();
    expect(loaded.envelopes.find((e) => e.category === "learning")!.totalUsd).toBe(
      LEARNING_TOTAL_USD,
    );
  });

  it("setPlan round-trips through TOML persistence", async () => {
    const planner = makePlanner();
    await planner.setPlan({
      policy: "ask-threshold",
      fxRate: 0.9,
      updatedAt: "x",
      envelopes: [
        {
          category: "development",
          perRunUsd: 3,
          dailyUsd: null,
          monthlyUsd: 50,
          totalUsd: null,
          askThresholdUsd: 1,
        },
      ],
    });
    const reloaded = makePlanner();
    const loaded = await reloaded.loadPlan();
    const dev = loaded.envelopes.find((e) => e.category === "development")!;
    expect(dev.perRunUsd).toBe(3);
    expect(dev.dailyUsd).toBeNull();
    expect(dev.monthlyUsd).toBe(50);
    expect(loaded.fxRate).toBe(0.9);
  });

  it("loadPlan tolerates a corrupt plan.toml", async () => {
    const file = planFile(homeDir);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "this is = = not valid toml [[[", "utf8");
    const planner = makePlanner();
    const plan = await planner.loadPlan();
    expect(plan.policy).toBe("ask-threshold"); // falls back to in-memory empty plan
  });

  it("loadPlan returns the in-memory plan when no file exists", async () => {
    const planner = makePlanner();
    const plan = await planner.loadPlan();
    expect(plan.envelopes).toEqual([]);
  });

  it("planInteractive builds envelopes from wizard answers", () => {
    const planner = makePlanner();
    const plan = planner.planInteractive({
      developmentMonthlyUsd: 200,
      learningMonthlyUsd: null,
      askThresholdUsd: 2,
    });
    const dev = plan.envelopes.find((e) => e.category === "development")!;
    expect(dev.monthlyUsd).toBe(200);
    expect(dev.askThresholdUsd).toBe(2);
    const learning = plan.envelopes.find((e) => e.category === "learning")!;
    expect(learning.monthlyUsd).toBeNull();
  });
});

describe("formatReport", () => {
  it("renders EUR-first with USD band and a JA confirmation when auto-approved", () => {
    const planner = makePlanner();
    const est = planner.estimate({
      category: "learning",
      perItemTokensIn: 1000,
      perItemTokensOut: 500,
      batch: 1,
    });
    const decision = {
      allowed: true,
      requiresApproval: false,
      remainingUsd: 50,
      capUsd: 100,
      reason: "auto-allow",
    };
    const report = planner.formatReport(est, decision);
    expect(report).toContain("EUR");
    expect(report).toContain("USD");
    expect(report).toContain("[JA / NEIN]: JA");
  });

  it("ends with an open JA/NEIN prompt when approval is required", () => {
    const planner = makePlanner();
    const est = planner.estimate({ category: "learning", perItemTokensIn: 1, perItemTokensOut: 1 });
    const report = planner.formatReport(est, {
      allowed: true,
      requiresApproval: true,
      remainingUsd: 5,
      capUsd: 10,
      reason: "approval required",
    });
    expect(report.trimEnd().endsWith("[JA / NEIN]:")).toBe(true);
  });

  it("shows BLOCKED + NEIN when the spend is refused", () => {
    const planner = makePlanner();
    const est = planner.estimate({ category: "learning", perItemTokensIn: 1, perItemTokensOut: 1 });
    const report = planner.formatReport(est, {
      allowed: false,
      requiresApproval: false,
      remainingUsd: -5,
      capUsd: 10,
      reason: "hard cap exceeded",
    });
    expect(report).toContain("BLOCKED");
    expect(report).toContain("[JA / NEIN]: NEIN");
  });
});

describe("events", () => {
  it("emits budget.checked and budget.spent on the bus", async () => {
    const events: Array<{ type: string }> = [];
    const bus = { emit: (e: unknown) => events.push(e as { type: string }), on: () => () => {} };
    const planner = createBudgetPlanner({
      logger,
      events: bus as never,
      homeDir,
      now: fixedClock("2026-06-12T10:00:00.000Z"),
    });
    const est: EstimateInput = {
      category: "development",
      perItemTokensIn: 100,
      perItemTokensOut: 100,
    };
    const estimate = planner.estimate(est);
    planner.check(estimate, "development");
    await planner.record({
      ts: "2026-06-12T10:00:00.000Z",
      category: "development",
      estimatedUsd: 1,
      actualUsd: 1,
    });
    expect(events.some((e) => e.type === "budget.checked")).toBe(true);
    expect(events.some((e) => e.type === "budget.spent")).toBe(true);
  });

  it("never throws when the bus handler throws", () => {
    const bus = {
      emit: () => {
        throw new Error("boom");
      },
      on: () => () => {},
    };
    const planner = createBudgetPlanner({
      logger,
      events: bus as never,
      homeDir,
      now: fixedClock("2026-06-12T10:00:00.000Z"),
    });
    const est = planner.estimate({
      category: "development",
      perItemTokensIn: 1,
      perItemTokensOut: 1,
    });
    expect(() => planner.check(est, "development")).not.toThrow();
  });
});
