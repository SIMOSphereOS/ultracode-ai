/**
 * End-to-end tests for {@link LearnAgent} with fake budget/author/provider and
 * a fully mocked ingestion provider. No real network, deterministic clock.
 *
 * Covers: plan incurs no LLM/crawl cost, run refuses without approval (no
 * fetch at all), happy-path run with skills authored, checkpoint/resume,
 * hard-stop at the runtime cap, abort, and the `learn.*` events.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLearnAgent } from "./index.js";
import { LearnError } from "./errors.js";
import { createCheckpointStore, defaultSqliteLoader } from "./checkpoint.js";
import type {
  AuthoringProposal,
  BudgetDecision,
  CostEstimate,
  DocIngestionProvider,
  DocPage,
  EstimateInput,
  IBudgetGate,
  ISkillAuthor,
  KnowledgeMaterial,
  LearnSource,
  LedgerEntry,
  PageValidators,
} from "./types.js";

/* --------------------------- fakes --------------------------------------- */

function fakeBudget(overrides: Partial<{ allowed: boolean; record: (e: LedgerEntry) => void }> = {}): IBudgetGate {
  const recorded: LedgerEntry[] = [];
  return {
    estimate(input: EstimateInput): CostEstimate {
      const pages = input.pages ?? 0;
      return {
        pages,
        tokensIn: pages * 1200,
        tokensOut: pages * 300,
        byModel: [{ model: "cheap", tokensIn: pages * 1200, tokensOut: pages * 300, usd: pages * 0.001 }],
        usdLow: pages * 0.0008,
        usdHigh: pages * 0.0012,
        eur: pages * 0.001,
        fxRate: 1,
        assumptions: ["fake"],
      };
    },
    check(estimate: CostEstimate): BudgetDecision {
      return {
        allowed: overrides.allowed ?? true,
        requiresApproval: false,
        remainingUsd: 100,
        capUsd: 100,
        reason: overrides.allowed === false ? "cap exceeded" : "ok",
      };
    },
    async record(entry: LedgerEntry): Promise<void> {
      recorded.push(entry);
      overrides.record?.(entry);
    },
    formatReport: () => "report",
  };
}

function fakeAuthor(): ISkillAuthor & { proposals: AuthoringProposal[]; persisted: AuthoringProposal[] } {
  const proposals: AuthoringProposal[] = [];
  const persisted: AuthoringProposal[] = [];
  return {
    proposals,
    persisted,
    async createOrUpgradeSkill(material: KnowledgeMaterial): Promise<AuthoringProposal> {
      const proposal: AuthoringProposal = {
        kind: "skill",
        name: `${material.catalog}/${material.topic}`,
        rationale: "learned",
        skill: {
          name: material.topic,
          description: material.summary,
          version: "1.0.0",
          catalog: material.catalog,
          triggers: [material.topic],
          sources: material.sources,
          status: "active",
          createdAt: "2026-06-12T00:00:00.000Z",
          updatedAt: "2026-06-12T00:00:00.000Z",
          body: material.facts.join("\n"),
        },
      };
      proposals.push(proposal);
      return proposal;
    },
    async persist(proposal: AuthoringProposal, opts: { approved: boolean }): Promise<void> {
      if (opts.approved) persisted.push(proposal);
    },
  };
}

/** Ingestion provider returning a fixed candidate set and per-URL pages. */
function fakeIngestion(
  candidates: string[],
  pageFor: (url: string, prev: PageValidators) => DocPage,
): DocIngestionProvider & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    async discover(): Promise<string[]> {
      return candidates;
    },
    async fetchPage(url: string, prev: PageValidators): Promise<DocPage> {
      fetched.push(url);
      return pageFor(url, prev);
    },
  };
}

const SOURCE_ID = "azure-docs"; // seeded

let home: string;
const clock = { t: Date.parse("2026-06-12T00:00:00.000Z") };
const now = (): number => clock.t;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "ultracode-agent-"));
  clock.t = Date.parse("2026-06-12T00:00:00.000Z");
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/* --------------------------- tests --------------------------------------- */

describe("LearnAgent.plan", () => {
  it("produces candidate pages and an estimate without any LLM/author calls", async () => {
    const author = fakeAuthor();
    const completeSpy = vi.fn();
    const ingestion = fakeIngestion(["https://e.com/a", "https://e.com/b"], (url) => ({
      url,
      status: 200,
      changed: true,
      text: "x",
    }));
    const agent = createLearnAgent({
      homeDir: home,
      budget: fakeBudget(),
      author,
      provider: { complete: completeSpy } as never,
      ingestion,
      fetchImpl: (async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => "" })) as never,
      now,
    });
    const plan = await agent.plan(SOURCE_ID);
    expect(plan.candidatePages).toEqual(["https://e.com/a", "https://e.com/b"]);
    expect(plan.estimate.pages).toBe(2);
    expect(plan.estimate.usdHigh).toBeGreaterThan(0);
    expect(completeSpy).not.toHaveBeenCalled();
    expect(author.persisted).toHaveLength(0);
  });

  it("rejects an unknown source", async () => {
    const agent = createLearnAgent({ homeDir: home, ingestion: fakeIngestion([], () => ({ url: "", status: 200, changed: false })) });
    await expect(agent.plan("does-not-exist")).rejects.toBeInstanceOf(LearnError);
  });
});

describe("LearnAgent.run approval gate", () => {
  it("refuses without approved:true and never touches the network", async () => {
    const discover = vi.fn(async () => ["https://e.com/a"]);
    const fetchPage = vi.fn(async () => ({ url: "x", status: 200, changed: false }) as DocPage);
    const ingestion: DocIngestionProvider = { discover, fetchPage };
    const agent = createLearnAgent({ homeDir: home, ingestion, now });
    await expect(agent.run(SOURCE_ID, { approved: false })).rejects.toBeInstanceOf(LearnError);
    expect(discover).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("refuses when the budget gate denies the run", async () => {
    const ingestion = fakeIngestion(["https://e.com/a"], (url) => ({ url, status: 200, changed: true, text: "t" }));
    const agent = createLearnAgent({ homeDir: home, budget: fakeBudget({ allowed: false }), ingestion, now });
    await expect(agent.run(SOURCE_ID, { approved: true })).rejects.toBeInstanceOf(LearnError);
  });
});

describe("LearnAgent.run end-to-end", () => {
  it("crawls, distils changed pages, authors skills and records spend", async () => {
    const author = fakeAuthor();
    const budgetRecords: LedgerEntry[] = [];
    const pages: Record<string, DocPage> = {
      "https://e.com/a": { url: "https://e.com/a", status: 200, changed: true, text: "Azure A. Detail.", contentHash: "ha" },
      "https://e.com/b": { url: "https://e.com/b", status: 200, changed: false, text: "B", contentHash: "hb" },
      "https://e.com/c": { url: "https://e.com/c", status: 304, changed: false },
    };
    const ingestion = fakeIngestion(Object.keys(pages), (url) => pages[url]!);
    const events: Array<{ type: string }> = [];
    const agent = createLearnAgent({
      homeDir: home,
      budget: fakeBudget({ record: (e) => budgetRecords.push(e) }),
      author,
      ingestion,
      events: { emit: (e: { type: string }) => events.push(e), on: () => () => {} } as never,
      now,
      sqliteLoader: async () => { throw new Error("force json"); },
    });

    const report = await agent.run(SOURCE_ID, { approved: true, concurrency: 2 });

    expect(report.pagesChecked).toBe(3);
    expect(report.processed).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.notModified).toBe(1);
    expect(report.skillsCreated).toBe(1);
    expect(author.persisted).toHaveLength(1);
    expect(budgetRecords).toHaveLength(1);
    expect(report.startedAt).toBe("2026-06-12T00:00:00.000Z");
    // Lifecycle events emitted.
    expect(events.map((e) => e.type)).toContain("learn.started");
    expect(events.map((e) => e.type)).toContain("learn.completed");
  });

  it("resumes from a pre-seeded checkpoint, skipping already-processed pages", async () => {
    const urls = ["https://e.com/a", "https://e.com/b", "https://e.com/c"];
    // Pre-seed a checkpoint marking the first page as already processed.
    const store = await createCheckpointStore(SOURCE_ID, home, undefined, async () => {
      throw new Error("json");
    });
    await store.save({
      sourceId: SOURCE_ID,
      updatedAt: "2026-06-12T00:00:00.000Z",
      processed: ["https://e.com/a"],
      validators: {},
      usage: { tokensIn: 0, tokensOut: 0, actualUsd: 0 },
    });
    store.close();

    const ingestion = fakeIngestion(urls, (url) => ({ url, status: 200, changed: true, text: `text ${url}`, contentHash: url }));
    const agent = createLearnAgent({
      homeDir: home,
      budget: fakeBudget(),
      author: fakeAuthor(),
      ingestion,
      now,
      sqliteLoader: async () => { throw new Error("json"); },
    });
    const report = await agent.run(SOURCE_ID, { approved: true, concurrency: 1 });
    // Only the two un-processed pages were fetched this run.
    expect(ingestion.fetched.sort()).toEqual(["https://e.com/b", "https://e.com/c"]);
    expect(report.processed).toBe(2);
  });

  it("hard-stops at the runtime cap and can throw LearnCapError", async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://e.com/${i}`);
    const ingestion = fakeIngestion(urls, (url) => ({ url, status: 200, changed: true, text: "t", contentHash: url }));
    // Clock advances by 1000ms each read so the very first page is already past a 1ms cap.
    let ticks = 0;
    const tickingNow = (): number => {
      ticks++;
      return clock.t + ticks * 1000;
    };
    const agent = createLearnAgent({
      homeDir: home,
      budget: fakeBudget(),
      author: fakeAuthor(),
      ingestion,
      now: tickingNow,
      sqliteLoader: async () => { throw new Error("json"); },
    });
    await expect(
      agent.run(SOURCE_ID, { approved: true, maxRuntimeMs: 1, throwOnCap: true, concurrency: 1 }),
    ).rejects.toMatchObject({ code: "LEARN_CAP_EXCEEDED" });
    // Nothing (or very little) processed because the cap tripped immediately.
    expect(ingestion.fetched.length).toBeLessThan(urls.length);
  });

  it("aborts the run when the signal fires", async () => {
    const controller = new AbortController();
    const urls = ["https://e.com/a"];
    const ingestion: DocIngestionProvider = {
      discover: async () => urls,
      fetchPage: async () => {
        controller.abort();
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      },
    };
    const agent = createLearnAgent({ homeDir: home, budget: fakeBudget(), author: fakeAuthor(), ingestion, now });
    await expect(
      agent.run(SOURCE_ID, { approved: true, signal: controller.signal, concurrency: 1 }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("works without budget/author/provider (deterministic, zero-cost)", async () => {
    const ingestion = fakeIngestion(["https://e.com/a"], (url) => ({
      url,
      status: 200,
      changed: true,
      text: "Some doc text. Another sentence.",
      contentHash: "h",
    }));
    const agent = createLearnAgent({ homeDir: home, ingestion, now, sqliteLoader: async () => { throw new Error("json"); } });
    const plan = await agent.plan(SOURCE_ID);
    expect(plan.estimate.usdHigh).toBe(0);
    const report = await agent.run(SOURCE_ID, { approved: true });
    expect(report.processed).toBe(1);
    expect(report.actualUsd).toBe(0);
  });
});

describe("module wiring", () => {
  it("createLearnAgent exposes the seeded library", async () => {
    const agent = createLearnAgent({ homeDir: home });
    const sources = await agent.library.list();
    expect(sources.map((s: LearnSource) => s.id).sort()).toEqual([
      "azure-docs",
      "azure-training",
      "pytest-docs",
    ]);
  });

  it("defaultSqliteLoader is exported and is a function", () => {
    expect(typeof defaultSqliteLoader).toBe("function");
  });
});
