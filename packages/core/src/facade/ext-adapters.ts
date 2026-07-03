/**
 * Adapter builders that wrap the concrete Module A/B/C instances
 * ({@link BudgetPlanner}, {@link Authoring}, {@link LearnAgent}) into the thin,
 * CLI-facing sub-APIs exposed on the {@link UltraCode} facade
 * ({@link BudgetFacade}, {@link AuthoringFacade}, {@link LearningFacade}).
 *
 * The adapters add no domain logic of their own: they flatten the planner's
 * per-category status into an aggregated view, materialise a partial
 * source-add into a full {@link LearnSource}, and forward everything else
 * straight through. All cross-module wiring stays constructor-injection based.
 */

import { promises as fs } from "node:fs";

import type { Logger } from "ultracode-shared";
import type { Authoring } from "../authoring/Authoring.js";
import type { BudgetPlanner } from "../budget/BudgetPlanner.js";
import type {
  BudgetCategory,
  BudgetDecision,
  BudgetEnvelope,
  BudgetPlan,
  CostEstimate,
  EstimateInput,
  LedgerEntry,
} from "../budget/index.js";
import { ledgerFile } from "../budget/paths.js";
import type { LearnRunOptions, LearnSource } from "../learning/index.js";
import type { LearnAgent } from "../learning/LearnAgent.js";
import { sanitizeId } from "../learning/paths.js";
import type {
  AuthoringFacade,
  BudgetFacade,
  BudgetPlanAnswers,
  BudgetPlanView,
  BudgetStatusView,
  LearningFacade,
  SourceAddInput,
} from "./ext-types.js";

/* -------------------------------------------------------------------------- */
/* Budget                                                                     */
/* -------------------------------------------------------------------------- */

/** Pick the broadest USD cap of an envelope (lifetime → monthly). */
function envelopeCap(env: BudgetEnvelope): number | null {
  if (env.totalUsd !== null && env.totalUsd !== undefined) return env.totalUsd;
  if (env.monthlyUsd !== null && env.monthlyUsd !== undefined) return env.monthlyUsd;
  return null;
}

/** Flatten the planner's structured status into the aggregated CLI view. */
function toStatusView(planner: BudgetPlanner): BudgetStatusView {
  const status = planner.status();
  const byCategory: Record<string, number> = {};
  let cap: number | null = null;
  for (const c of status.categories) {
    byCategory[c.category] = c.spentTotalUsd;
    if (c.envelope) {
      const ec = envelopeCap(c.envelope);
      if (ec !== null) cap = cap === null ? ec : cap + ec;
    }
  }
  const view: BudgetStatusView = {
    spentUsd: status.totalSpentUsd,
    capUsd: cap,
    remainingUsd: cap === null ? 0 : Math.max(0, cap - status.totalSpentUsd),
    entries: status.entryCount,
  };
  if (Object.keys(byCategory).length > 0) view.byCategory = byCategory;
  return view;
}

/** Flatten the real plan into the aggregated CLI plan view. */
function toPlanView(plan: BudgetPlan): BudgetPlanView {
  const categories: Record<string, number> = {};
  let cap: number | null = null;
  let threshold: number | undefined;
  for (const env of plan.envelopes) {
    const ec = envelopeCap(env);
    if (ec !== null) {
      categories[env.category] = ec;
      cap = cap === null ? ec : cap + ec;
    }
    if (env.askThresholdUsd !== null && threshold === undefined) {
      threshold = env.askThresholdUsd;
    }
  }
  const view: BudgetPlanView = { capUsd: cap };
  if (Object.keys(categories).length > 0) view.categories = categories;
  if (threshold !== undefined) view.approvalThresholdUsd = threshold;
  return view;
}

/**
 * Apply a {@link BudgetPlanAnswers}/{@link BudgetPlanView} delta onto the
 * current real plan, distributing a single `capUsd` across the standard
 * envelopes and applying the approval threshold uniformly.
 */
function applyPlanDelta(
  current: BudgetPlan,
  delta: BudgetPlanAnswers | BudgetPlanView,
  now: () => string,
): BudgetPlan {
  const envelopes = current.envelopes.map((e) => ({ ...e }));
  const ensure = (category: BudgetCategory): BudgetEnvelope => {
    let env = envelopes.find((e) => e.category === category);
    if (!env) {
      env = {
        category,
        perRunUsd: null,
        dailyUsd: null,
        monthlyUsd: null,
        totalUsd: null,
        askThresholdUsd: null,
      };
      envelopes.push(env);
    }
    return env;
  };
  if ("capUsd" in delta && delta.capUsd !== undefined) {
    const cap = delta.capUsd;
    for (const category of ["development", "learning", "operations"] as const) {
      ensure(category).monthlyUsd = cap;
    }
  }
  if ("categories" in delta && delta.categories) {
    for (const [category, amount] of Object.entries(delta.categories)) {
      ensure(category).monthlyUsd = Number.isFinite(amount) ? amount : null;
    }
  }
  if ("approvalThresholdUsd" in delta && delta.approvalThresholdUsd !== undefined) {
    for (const env of envelopes) env.askThresholdUsd = delta.approvalThresholdUsd;
  }
  const fxRate =
    "fxRate" in delta && typeof delta.fxRate === "number" && delta.fxRate > 0
      ? delta.fxRate
      : current.fxRate;
  return { policy: "ask-threshold", fxRate, envelopes, updatedAt: now() };
}

/** Read the JSON-Lines ledger from disk, newest-first, optionally capped. */
async function readLedger(homeDir: string, limit?: number): Promise<LedgerEntry[]> {
  const file = homeDir ? ledgerFile(homeDir) : ledgerFile();
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    return [];
  }
  const out: LedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      out.push(JSON.parse(trimmed) as LedgerEntry);
    } catch {
      // Skip corrupt rows; never throw from a read-only history view.
    }
  }
  out.reverse();
  if (limit !== undefined && Number.isFinite(limit) && limit >= 0) {
    return out.slice(0, Math.floor(limit));
  }
  return out;
}

/**
 * Build the {@link BudgetFacade} sub-API over a real {@link BudgetPlanner}.
 *
 * @param planner - The wired budget planner (plan + ledger already loaded).
 * @param homeDir - Home directory for ledger reads (`""` → default home).
 * @param now - Injectable clock for plan `updatedAt` stamping.
 */
export function buildBudgetFacade(
  planner: BudgetPlanner,
  homeDir: string,
  now: () => string,
): BudgetFacade {
  return {
    async status(): Promise<BudgetStatusView> {
      return toStatusView(planner);
    },
    async plan(answers?: BudgetPlanAnswers): Promise<BudgetPlanView> {
      if (answers === undefined || Object.keys(answers).length === 0) {
        return toPlanView(planner.getPlan());
      }
      return toPlanView(applyPlanDelta(planner.getPlan(), answers, now));
    },
    async setPlan(view: BudgetPlanView): Promise<void> {
      await planner.setPlan(applyPlanDelta(planner.getPlan(), view, now));
    },
    estimate(input: EstimateInput): CostEstimate {
      return planner.estimate(input);
    },
    check(estimate: CostEstimate, category: BudgetCategory): BudgetDecision {
      return planner.check(estimate, category);
    },
    formatReport(estimate: CostEstimate, decision: BudgetDecision): string {
      return planner.formatReport(estimate, decision);
    },
    history(limit?: number): Promise<LedgerEntry[]> {
      return readLedger(homeDir, limit);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Authoring                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the {@link AuthoringFacade} sub-API over a real {@link Authoring}.
 *
 * @param authoring - The wired authoring instance.
 */
export function buildAuthoringFacade(authoring: Authoring): AuthoringFacade {
  return {
    skills: {
      list: (catalog?: string) => authoring.registry.list(catalog),
      get: (name: string) => authoring.registry.get(name),
    },
    createSkill: (material) => authoring.createOrUpgradeSkill(material),
    createAgent: (material) => authoring.createOrEvolveAgent(material),
    evolveAgent: (material) => authoring.createOrEvolveAgent(material),
    test: (proposal) => authoring.test(proposal),
    persist: (proposal, opts) => authoring.persist(proposal, opts),
    scoreSkill: (skill) => authoring.scoreSkill(skill),
  };
}

/* -------------------------------------------------------------------------- */
/* Learning                                                                   */
/* -------------------------------------------------------------------------- */

/** Materialise a partial source-add into a full, validated {@link LearnSource}. */
function toLearnSource(input: SourceAddInput): LearnSource {
  const id = input.id && input.id.trim() !== "" ? sanitizeId(input.id) : idFromUrl(input.url);
  const source: LearnSource = {
    id,
    url: input.url,
    type: "web-docs",
    catalog: input.catalog && input.catalog.trim() !== "" ? input.catalog : id,
    schedule: input.schedule && input.schedule.trim() !== "" ? input.schedule : "on-demand",
    localeDefault:
      input.localeDefault && input.localeDefault.trim() !== "" ? input.localeDefault : "de-de",
  };
  if (input.scope !== undefined && input.scope.trim() !== "") source.scope = input.scope;
  return source;
}

/** Derive a stable slug id from a URL host + first path segment. */
function idFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const seg = u.pathname.split("/").filter((s) => s !== "")[0] ?? "";
    return sanitizeId(seg ? `${host}-${seg}` : host);
  } catch {
    return sanitizeId(url) || "source";
  }
}

/**
 * Build the {@link LearningFacade} sub-API over a real {@link LearnAgent}.
 *
 * @param learn - The wired learn agent.
 * @param logger - Logger for diagnostics on the add path.
 */
export function buildLearningFacade(learn: LearnAgent, logger: Logger): LearningFacade {
  return {
    sources: {
      list: () => learn.library.list(),
      async add(input: SourceAddInput): Promise<LearnSource> {
        const source = toLearnSource(input);
        await learn.library.add(source);
        logger.debug("learning: source added", { id: source.id, url: source.url });
        return source;
      },
      remove: (id: string) => learn.library.remove(id),
    },
    plan: (sourceId: string) => learn.plan(sourceId),
    run(sourceId, opts) {
      const runOpts: LearnRunOptions = { approved: opts.approved };
      if (opts.signal !== undefined) runOpts.signal = opts.signal;
      if (opts.onProgress !== undefined) runOpts.onProgress = opts.onProgress;
      return learn.run(sourceId, runOpts);
    },
  };
}
