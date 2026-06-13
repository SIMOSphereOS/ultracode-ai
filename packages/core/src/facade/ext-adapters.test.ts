/**
 * Focused tests for the facade adapters that wrap the concrete Module A/B/C
 * instances ({@link BudgetPlanner}, {@link Authoring}, {@link LearnAgent}) into
 * the thin CLI-facing sub-APIs.
 *
 * Everything is offline and deterministic: real planner/author/agent instances
 * are built against `os.tmpdir()` homes with an injected clock; no network. The
 * tests drive the adapters through the *real* modules so the aggregation,
 * partial source-add materialisation, ledger ENOENT/corrupt branches and error
 * mapping are all exercised end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { NoopLogger } from "ultracode-shared";
import type { Logger } from "ultracode-shared";

import { createBudgetPlanner, type BudgetPlanner } from "../budget/BudgetPlanner.js";
import { ledgerFile } from "../budget/paths.js";
import { createAuthoring, type Authoring } from "../authoring/Authoring.js";
import { createLearnAgent, type LearnAgent } from "../learning/index.js";
import { LearnError } from "../learning/errors.js";
import {
  buildBudgetFacade,
  buildAuthoringFacade,
  buildLearningFacade,
} from "./index.js";

const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 } as const;
const logger: Logger = new NoopLogger();
const now = () => "2026-06-13T10:00:00.000Z";

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "uc-ext-adapters-"));
});

afterEach(async () => {
  await fs.rm(home, RM);
});

/* -------------------------------------------------------------------------- */
/* Budget adapter                                                             */
/* -------------------------------------------------------------------------- */

function makePlanner(): BudgetPlanner {
  return createBudgetPlanner({
    logger,
    homeDir: home,
    now: () => new Date("2026-06-13T10:00:00.000Z"),
  });
}

describe("buildBudgetFacade — status aggregation", () => {
  it("flattens an uncapped planner into a null-cap, zero-remaining status", async () => {
    const facade = buildBudgetFacade(makePlanner(), home, now);
    const status = await facade.status();
    expect(status.capUsd).toBeNull();
    expect(status.remainingUsd).toBe(0);
    expect(status.spentUsd).toBe(0);
    expect(status.entries).toBe(0);
    // No envelopes seen → no per-category breakdown attached.
    expect(status.byCategory).toBeUndefined();
  });

  it("sums per-category envelope caps and exposes per-category spend", async () => {
    const planner = makePlanner();
    await planner.setPlan({
      policy: "ask-threshold",
      fxRate: 0.92,
      updatedAt: now(),
      envelopes: [
        {
          category: "development",
          perRunUsd: null,
          dailyUsd: null,
          monthlyUsd: null,
          totalUsd: 40,
          askThresholdUsd: 1,
        },
        {
          category: "learning",
          perRunUsd: null,
          dailyUsd: null,
          monthlyUsd: null,
          totalUsd: 10,
          askThresholdUsd: 1,
        },
      ],
    });
    await planner.record({
      ts: "2026-06-13T09:00:00.000Z",
      category: "development",
      estimatedUsd: 5,
      actualUsd: 5,
    });
    const facade = buildBudgetFacade(planner, home, now);
    const status = await facade.status();
    // 40 + 10 lifetime caps aggregated.
    expect(status.capUsd).toBe(50);
    expect(status.spentUsd).toBe(5);
    expect(status.remainingUsd).toBe(45);
    expect(status.byCategory).toEqual({ development: 5, learning: 0 });
  });
});

describe("buildBudgetFacade — plan read/build/persist", () => {
  it("reads the active plan as an aggregated view", async () => {
    const planner = makePlanner();
    await planner.installDefaultPlan();
    const facade = buildBudgetFacade(planner, home, now);
    const view = await facade.plan();
    expect(view.capUsd).not.toBeNull();
    expect(view.categories).toBeDefined();
  });

  it("builds a view from answers without mutating the stored plan", async () => {
    const planner = makePlanner();
    const facade = buildBudgetFacade(planner, home, now);
    const view = await facade.plan({ capUsd: 99, approvalThresholdUsd: 3 });
    // capUsd is distributed across the three standard envelopes (3 × 99).
    expect(view.capUsd).toBe(297);
    expect(view.approvalThresholdUsd).toBe(3);
    // The planner itself is untouched (empty plan → null cap).
    expect((await facade.plan()).capUsd).toBeNull();
  });

  it("setPlan distributes a single cap and persists it", async () => {
    const planner = makePlanner();
    const facade = buildBudgetFacade(planner, home, now);
    await facade.setPlan({ capUsd: 30, approvalThresholdUsd: 2 });
    const reloaded = await facade.plan();
    expect(reloaded.capUsd).toBe(90); // 3 × 30
    expect(reloaded.approvalThresholdUsd).toBe(2);
    // Round-trips through plan.toml on disk.
    const persisted = createBudgetPlanner({
      logger,
      homeDir: home,
      now: () => new Date("2026-06-13T10:00:00.000Z"),
    });
    await persisted.loadPlan();
    expect(persisted.getPlan().envelopes.length).toBeGreaterThanOrEqual(3);
  });

  it("setPlan with explicit per-category caps round-trips", async () => {
    const planner = makePlanner();
    const facade = buildBudgetFacade(planner, home, now);
    await facade.setPlan({ capUsd: null, categories: { development: 12, learning: 8 } });
    const view = await facade.plan();
    expect(view.categories).toMatchObject({ development: 12, learning: 8 });
    expect(view.capUsd).toBe(20);
  });
});

describe("buildBudgetFacade — estimate/check/report passthrough", () => {
  it("forwards estimate, check and formatReport to the planner", async () => {
    const planner = makePlanner();
    const facade = buildBudgetFacade(planner, home, now);
    const estimate = facade.estimate({
      category: "learning",
      perItemTokensIn: 1000,
      perItemTokensOut: 500,
      batch: 4,
    });
    expect(estimate.tokensIn).toBeGreaterThan(0);
    const decision = facade.check(estimate, "learning");
    expect(decision.allowed).toBe(true);
    const report = facade.formatReport(estimate, decision);
    expect(report).toContain("Kostenschaetzung / Cost estimate");
  });
});

describe("buildBudgetFacade — history (ledger) branches", () => {
  it("returns [] when the ledger file is absent (ENOENT branch)", async () => {
    const facade = buildBudgetFacade(makePlanner(), home, now);
    expect(await facade.history()).toEqual([]);
  });

  it("reads the ledger newest-first and honours the limit", async () => {
    const planner = makePlanner();
    await planner.record({
      ts: "2026-06-13T08:00:00.000Z",
      category: "development",
      estimatedUsd: 1,
      actualUsd: 1,
      note: "first",
    });
    await planner.record({
      ts: "2026-06-13T09:00:00.000Z",
      category: "learning",
      estimatedUsd: 2,
      actualUsd: 2,
      note: "second",
    });
    const facade = buildBudgetFacade(planner, home, now);
    const all = await facade.history();
    expect(all).toHaveLength(2);
    // Newest-first.
    expect(all[0]!.note).toBe("second");
    expect(all[1]!.note).toBe("first");
    const capped = await facade.history(1);
    expect(capped).toHaveLength(1);
    expect(capped[0]!.note).toBe("second");
  });

  it("skips corrupt rows without throwing", async () => {
    const file = ledgerFile(home);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const good = JSON.stringify({
      ts: "2026-06-13T09:00:00.000Z",
      category: "learning",
      estimatedUsd: 2,
      actualUsd: 2,
      note: "kept",
    });
    await fs.writeFile(file, `${good}\nnot-json-at-all\n   \n`, "utf8");
    const facade = buildBudgetFacade(planner(), home, now);
    const entries = await facade.history();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.note).toBe("kept");
  });

  it("falls back to the default home when homeDir is empty", async () => {
    // Empty homeDir routes through `ledgerFile()` (default home), exercising the
    // `homeDir ? … : …` branch. We assert only that the read resolves to an
    // array (never throws) — the real default-home ledger may or may not exist
    // on the host, so its contents are not asserted.
    const facade = buildBudgetFacade(makePlanner(), "", now);
    const entries = await facade.history(0);
    expect(Array.isArray(entries)).toBe(true);
  });
});

/** Helper for the corrupt-row test (separate planner over the same home). */
function planner(): BudgetPlanner {
  return makePlanner();
}

/* -------------------------------------------------------------------------- */
/* Authoring adapter                                                          */
/* -------------------------------------------------------------------------- */

function makeAuthoring(): Authoring {
  return createAuthoring({
    logger,
    homeDir: home,
    now: () => new Date("2026-06-13T10:00:00.000Z"),
  });
}

describe("buildAuthoringFacade", () => {
  it("creates, tests, scores and persists a skill through the real authoring engine", async () => {
    const authoring = makeAuthoring();
    const facade = buildAuthoringFacade(authoring);

    const proposal = await facade.createSkill({
      catalog: "compliance",
      topic: "DORA Operational Resilience",
      summary: "DORA mandates ICT risk management for financial entities.",
      facts: ["Article 5 covers governance.", "Testing under Article 24."],
      codeSnippets: ["git status"],
      sources: ["https://example.test/dora"],
    });
    expect(proposal.kind).toBe("skill");
    expect(proposal.skill).toBeDefined();

    const score = facade.scoreSkill(proposal.skill!);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);

    const test = await facade.test(proposal);
    expect(test.passed).toBe(true);

    // Unapproved persist is a no-op (nothing written), approved persists.
    await facade.persist(proposal, { approved: false });
    expect(await facade.skills.get(proposal.skill!.name)).toBeNull();

    await facade.persist(proposal, { approved: true });
    const fetched = await facade.skills.get(proposal.skill!.name);
    expect(fetched).not.toBeNull();

    const listed = await facade.skills.list();
    expect(listed.some((s) => s.name === proposal.skill!.name)).toBe(true);
  });

  it("creates and evolves an agent proposal through the adapter", async () => {
    const facade = buildAuthoringFacade(makeAuthoring());
    const material = {
      catalog: "ops",
      topic: "Release Helper",
      summary: "Assists with release planning and changelog drafting.",
      facts: ["Reads git history."],
      codeSnippets: [],
      sources: ["https://example.test/release"],
    };
    const created = await facade.createAgent(material);
    expect(created.kind).toBe("agent");
    const evolved = await facade.evolveAgent(material);
    expect(evolved.kind).toBe("agent");
  });
});

/* -------------------------------------------------------------------------- */
/* Learning adapter                                                           */
/* -------------------------------------------------------------------------- */

function makeLearn(): LearnAgent {
  return createLearnAgent({ logger, homeDir: home });
}

describe("buildLearningFacade — source library", () => {
  it("materialises a partial add into a full source (id derived from URL)", async () => {
    const facade = buildLearningFacade(makeLearn(), logger);
    const source = await facade.sources.add({ url: "https://docs.example.com/guide/intro" });
    // Id derived from host + first path segment; sanitizeId maps dots to `_`
    // and keeps the host/segment hyphen.
    expect(source.id).toBe("docs_example_com-guide");
    expect(source.type).toBe("web-docs");
    expect(source.catalog).toBe(source.id);
    expect(source.schedule).toBe("on-demand");
    expect(source.localeDefault).toBe("de-de");
    // Persisted and listable.
    const listed = await facade.sources.list();
    expect(listed.some((s) => s.id === source.id)).toBe(true);
  });

  it("honours explicit id/catalog/schedule/scope/locale fields", async () => {
    const facade = buildLearningFacade(makeLearn(), logger);
    const source = await facade.sources.add({
      url: "https://docs.example.org/",
      id: "My Source",
      catalog: "guides",
      schedule: "weekly",
      scope: "/docs",
      localeDefault: "en-us",
    });
    expect(source.id).toBe("My_Source"); // sanitised (space → `_`, case preserved)
    expect(source.catalog).toBe("guides");
    expect(source.schedule).toBe("weekly");
    expect(source.scope).toBe("/docs");
    expect(source.localeDefault).toBe("en-us");
  });

  it("removes a source by id", async () => {
    const facade = buildLearningFacade(makeLearn(), logger);
    const source = await facade.sources.add({ url: "https://docs.example.net/ref" });
    expect(await facade.sources.remove(source.id)).toBe(true);
    expect(await facade.sources.remove(source.id)).toBe(false);
  });

  it("rejects a non-http(s) URL at add time (scheme guard)", async () => {
    const facade = buildLearningFacade(makeLearn(), logger);
    await expect(facade.sources.add({ url: "ftp://example.com/docs" })).rejects.toBeInstanceOf(
      LearnError,
    );
  });

  it("rejects an SSRF-blocked host literal at add time", async () => {
    const facade = buildLearningFacade(makeLearn(), logger);
    await expect(
      facade.sources.add({ url: "http://127.0.0.1/internal" }),
    ).rejects.toBeInstanceOf(LearnError);
  });
});

describe("buildLearningFacade — run refuses without approval", () => {
  it("refuses an unapproved run with no network/LLM (LearnError)", async () => {
    const facade = buildLearningFacade(makeLearn(), logger);
    const source = await facade.sources.add({ url: "https://docs.example.com/api" });
    await expect(facade.run(source.id, { approved: false })).rejects.toBeInstanceOf(LearnError);
  });
});
