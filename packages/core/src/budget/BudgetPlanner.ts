/**
 * Deterministic, offline budget planner for LLM-backed work.
 *
 * The {@link BudgetPlanner} answers three questions for a unit of work:
 *
 * 1. **estimate** — how much will it cost (USD point estimate + low/high band,
 *    EUR-first via a configurable fx rate)?
 * 2. **check** — does the active plan permit it, and does it need human
 *    approval? The default `"ask-threshold"` policy auto-approves cheap runs,
 *    asks for approval above a threshold, and refuses (hard cap) when a period
 *    limit would be breached. Crossing 50/80/100 % of a limit emits an alert.
 * 3. **record** — append the (estimated/actual) spend to an atomic, append-only
 *    JSON-Lines ledger.
 *
 * Everything is deterministic and offline: the cost formula is pure arithmetic
 * over a configurable price table, the clock is injectable, and token counts
 * derive from the offline {@link HeuristicTokenCounter}. Persistence is under
 * `~/.ultracode/budget/` (`plan.toml` via `smol-toml`, `ledger.jsonl`).
 *
 * ### Cost formula
 *
 * For each model `m` with routing share `s_m`:
 *
 * ```text
 * items_m   = batch × s_m
 * tokensIn  = items_m × perItemTokensIn  × O_sys(1.2) × R(1.1)
 * tokensOut = items_m × perItemTokensOut × O_sys(1.2) × R(1.1)
 * batchFac  = 0.5                                  (batch discount)
 * usd_m     = ((tokensIn/1e6)·Pin + (tokensOut/1e6)·Pout) × batchFac × Safety(2.0)
 * total     = Σ usd_m
 * ```
 */

import type { IEventBus, Logger } from "@ultracode/shared";

import { HeuristicTokenCounter } from "../tokens/index.js";
import type { TokenCounter } from "../tokens/index.js";
import { atomicWriteFile } from "../config/paths.js";
import { BudgetError } from "./errors.js";
import { priceFor } from "./pricing.js";
import {
  ALERT_BANDS,
  BATCH_FACTOR,
  DAY_KEY_LENGTH,
  DEFAULT_FX_RATE,
  DEFAULT_MODEL,
  DEFAULT_PLAN_ENVELOPES,
  DEFAULT_PLAN_POLICY,
  DEFAULT_PRICE_TABLE,
  DEFAULT_SAFETY_FACTOR,
  MONTH_KEY_LENGTH,
  OVERHEAD_FACTOR,
  RETRY_FACTOR,
  ROUND_SCALE,
  TOKENS_PER_MILLION,
  USD_HIGH_FACTOR,
  USD_LOW_FACTOR,
  WIZARD_DAILY_FROM_MONTHLY_DIVISOR,
  WIZARD_DEFAULT_ASK_THRESHOLD_USD,
  WIZARD_DEVELOPMENT_MONTHLY_USD,
  WIZARD_DEVELOPMENT_PER_RUN_USD,
  WIZARD_LEARNING_MONTHLY_USD,
  WIZARD_LEARNING_PER_RUN_USD,
  WIZARD_OPERATIONS_MONTHLY_USD,
  WIZARD_OPERATIONS_PER_RUN_USD,
} from "./defaults.js";
import {
  BUDGET_CHECKED_EVENT,
  BUDGET_EXCEEDED_EVENT,
  BUDGET_SPENT_EVENT,
  emitBudgetEvent,
} from "./events.js";
import type { BudgetAlertEvent } from "./events.js";
import { budgetDir, ledgerFile, planFile, resolveHome } from "./paths.js";
import type {
  BudgetCategory,
  BudgetDecision,
  BudgetEnvelope,
  BudgetPlan,
  BudgetStatus,
  CategoryStatus,
  CostEstimate,
  EstimateInput,
  IBudgetGate,
  LedgerEntry,
  ModelSpend,
  PlanWizardAnswers,
  PriceTable,
  RoutingShare,
} from "./types.js";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import fs from "node:fs/promises";

/** Construction options for {@link createBudgetPlanner}. */
export interface BudgetPlannerOptions {
  /** Logger for warnings and one-line event summaries. */
  logger: Logger;
  /** Optional event bus for core-local budget events. */
  events?: IEventBus;
  /** Home directory override (defaults to `os.homedir()`). */
  homeDir?: string;
  /** Injectable clock (defaults to `() => new Date()`). */
  now?: () => Date;
  /** Price table override (merged over {@link DEFAULT_PRICE_TABLE}). */
  priceTable?: PriceTable;
  /** EUR-per-USD fx rate override. */
  fxRate?: number;
  /** Token counter override (defaults to {@link HeuristicTokenCounter}). */
  counter?: TokenCounter;
}

/**
 * Round a USD/EUR figure to 6 decimal places. Six places keep sub-cent
 * micro-estimates (fractions of a cent for cheap models) honest while still
 * collapsing floating-point noise.
 */
function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * ROUND_SCALE) / ROUND_SCALE;
}

/** Clamp to a non-negative finite number. */
function nonNeg(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * UTC day key (`YYYY-MM-DD`) and month key (`YYYY-MM`) for an ISO timestamp.
 * Returns empty keys for unparseable timestamps so corrupt rows never crash.
 */
function periodKeys(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "", month: "" };
  const day = d.toISOString().slice(0, DAY_KEY_LENGTH);
  const month = day.slice(0, MONTH_KEY_LENGTH);
  return { day, month };
}

/**
 * The planner. Construct via {@link createBudgetPlanner}.
 */
export class BudgetPlanner implements IBudgetGate {
  private readonly logger: Logger;
  private readonly events?: IEventBus;
  private readonly home: string;
  private readonly now: () => Date;
  private readonly priceTable: PriceTable;
  private fxRate: number;
  private readonly counter: TokenCounter;

  /** In-memory plan; loaded lazily and kept in sync with `plan.toml`. */
  private plan: BudgetPlan;
  /** Serialises ledger appends to avoid interleaved writes. */
  private writeChain: Promise<unknown> = Promise.resolve();
  /** Cached, monotonically-growing alert bands already fired per key. */
  private readonly firedAlerts = new Set<string>();

  /** @internal Use {@link createBudgetPlanner}. */
  constructor(opts: BudgetPlannerOptions) {
    this.logger = opts.logger;
    this.events = opts.events;
    this.home = opts.homeDir ?? "";
    this.now = opts.now ?? (() => new Date());
    this.priceTable = { ...DEFAULT_PRICE_TABLE, ...(opts.priceTable ?? {}) };
    this.fxRate = nonNeg(opts.fxRate) || DEFAULT_FX_RATE;
    this.counter = opts.counter ?? new HeuristicTokenCounter();
    this.plan = this.emptyPlan();
  }

  /** Resolve a home-relative budget path, honouring the home override. */
  private planPath(): string {
    return this.home ? planFile(this.home) : planFile();
  }

  private ledgerPath(): string {
    return this.home ? ledgerFile(this.home) : ledgerFile();
  }

  private dirPath(): string {
    return resolveHome(this.home ? budgetDir(this.home) : budgetDir());
  }

  /** A plan with no envelopes (uncapped: every spend auto-approves). */
  private emptyPlan(): BudgetPlan {
    return {
      policy: DEFAULT_PLAN_POLICY,
      fxRate: this.fxRate,
      envelopes: [],
      updatedAt: this.now().toISOString(),
    };
  }

  // ----------------------------- Estimate --------------------------------

  /**
   * Estimate the cost of a unit of work using the documented cost formula.
   *
   * @param input - The work description (tokens/routing/batch or `texts`).
   * @returns A {@link CostEstimate} with USD band, EUR point estimate and a
   *   per-model breakdown. Pure: no I/O, no plan mutation.
   */
  estimate(input: EstimateInput): CostEstimate {
    const assumptions: string[] = [];
    const routing = this.normaliseRouting(input.routing, assumptions);

    // Derive the per-item input token count from `texts` when provided.
    let perItemIn = nonNeg(input.perItemTokensIn);
    const texts = Array.isArray(input.texts) ? input.texts : undefined;
    let textTotalIn = 0;
    if (texts) {
      for (const t of texts) textTotalIn += this.counter.count(typeof t === "string" ? t : "");
      assumptions.push(`input tokens counted from ${texts.length} text(s) = ${textTotalIn}`);
    }

    const batch = this.resolveBatch(input, texts);
    const pages = nonNeg(input.pages) || batch;

    // When texts drive the estimate, the counted total IS the whole batch's
    // input; otherwise multiply the per-item figure by the batch size.
    const totalInBase = texts ? textTotalIn : perItemIn * batch;
    if (!texts) {
      assumptions.push(`perItemTokensIn=${perItemIn} × batch=${batch}`);
    }
    const perItemOut = nonNeg(input.perItemTokensOut);
    const totalOutBase = perItemOut * batch;
    assumptions.push(`perItemTokensOut=${perItemOut} × batch=${batch}`);

    const safety =
      input.safetyFactor !== undefined && Number.isFinite(input.safetyFactor) && input.safetyFactor >= 0
        ? input.safetyFactor
        : DEFAULT_SAFETY_FACTOR;
    assumptions.push(
      `factors: overhead=${OVERHEAD_FACTOR}, retry=${RETRY_FACTOR}, batch=${BATCH_FACTOR}, safety=${safety}`,
    );

    // Effective token totals after overhead+retry inflation.
    const inflate = OVERHEAD_FACTOR * RETRY_FACTOR;
    const totalIn = totalInBase * inflate;
    const totalOut = totalOutBase * inflate;

    const byModel: ModelSpend[] = [];
    let usd = 0;
    let tokensInSum = 0;
    let tokensOutSum = 0;
    for (const leg of routing) {
      const price = priceFor(leg.model, this.priceTable);
      const mIn = totalIn * leg.share;
      const mOut = totalOut * leg.share;
      const mUsd =
        ((mIn / TOKENS_PER_MILLION) * price.inputPerMTok +
          (mOut / TOKENS_PER_MILLION) * price.outputPerMTok) *
        BATCH_FACTOR *
        safety;
      const spend: ModelSpend = {
        model: leg.model,
        tokensIn: Math.round(mIn),
        tokensOut: Math.round(mOut),
        usd: round4(mUsd),
      };
      byModel.push(spend);
      usd += mUsd;
      tokensInSum += spend.tokensIn;
      tokensOutSum += spend.tokensOut;
    }

    const usdPoint = round4(usd);
    return {
      pages,
      tokensIn: tokensInSum,
      tokensOut: tokensOutSum,
      byModel,
      usdLow: round4(usdPoint * USD_LOW_FACTOR),
      usdHigh: round4(usdPoint * USD_HIGH_FACTOR),
      eur: round4(usdPoint * this.fxRate),
      fxRate: this.fxRate,
      assumptions,
    };
  }

  /** Normalise/validate a routing split; defaults to 100 % of the default model. */
  private normaliseRouting(
    routing: RoutingShare[] | undefined,
    assumptions: string[],
  ): RoutingShare[] {
    const legs = (routing ?? []).filter(
      (r): r is RoutingShare =>
        !!r && typeof r.model === "string" && Number.isFinite(r.share) && r.share > 0,
    );
    if (legs.length === 0) {
      assumptions.push(`routing: 100% ${DEFAULT_MODEL} (default)`);
      return [{ model: DEFAULT_MODEL, share: 1 }];
    }
    const sum = legs.reduce((acc, r) => acc + r.share, 0);
    const normalised = legs.map((r) => ({ model: r.model, share: r.share / sum }));
    assumptions.push(
      `routing: ${normalised.map((r) => `${Math.round(r.share * 100)}% ${r.model}`).join(", ")}`,
    );
    return normalised;
  }

  /** Resolve the batch size from explicit `batch`, `texts`, `pages`, or `1`. */
  private resolveBatch(input: EstimateInput, texts: string[] | undefined): number {
    if (input.batch !== undefined && Number.isFinite(input.batch) && input.batch >= 0) {
      return Math.floor(input.batch);
    }
    if (texts) return texts.length;
    if (input.pages !== undefined && Number.isFinite(input.pages) && input.pages >= 0) {
      return Math.floor(input.pages);
    }
    return 1;
  }

  // ------------------------------- Check ---------------------------------

  /**
   * Check an estimate against the active plan for `category`.
   *
   * Loads the plan lazily on first use is *not* done here (sync method); call
   * {@link installDefaultPlan}/{@link setPlan}/{@link getPlan} first if you rely
   * on persisted limits. Uses the in-memory plan as-is. The synchronous
   * spend totals are read from an in-memory cache populated by {@link record}.
   *
   * @param estimate - A {@link CostEstimate} from {@link estimate}.
   * @param category - The envelope to bill against.
   */
  check(estimate: CostEstimate, category: BudgetCategory): BudgetDecision {
    const usd = nonNeg(estimate.usdHigh) || nonNeg(estimate.byModel.reduce((a, m) => a + m.usd, 0));
    const env = this.envelopeFor(category);

    // No envelope → uncapped, auto-allow.
    if (!env) {
      const decision: BudgetDecision = {
        allowed: true,
        requiresApproval: false,
        remainingUsd: Number.POSITIVE_INFINITY,
        capUsd: null,
        reason: `no envelope for "${category}" — auto-allow`,
      };
      emitBudgetEvent(
        { type: BUDGET_CHECKED_EVENT, category, estimatedUsd: usd, decision },
        this.events,
        this.logger,
      );
      return decision;
    }

    const spent = this.spendCache.get(category) ?? { day: 0, month: 0, total: 0 };

    // Hard caps: a spend that would push any period over its limit is refused.
    const breaches: Array<{ scope: "run" | "daily" | "monthly" | "total"; cap: number; after: number }> = [];
    if (env.perRunUsd !== null && usd > env.perRunUsd) {
      breaches.push({ scope: "run", cap: env.perRunUsd, after: usd });
    }
    if (env.dailyUsd !== null && spent.day + usd > env.dailyUsd) {
      breaches.push({ scope: "daily", cap: env.dailyUsd, after: spent.day + usd });
    }
    if (env.monthlyUsd !== null && spent.month + usd > env.monthlyUsd) {
      breaches.push({ scope: "monthly", cap: env.monthlyUsd, after: spent.month + usd });
    }
    if (env.totalUsd !== null && spent.total + usd > env.totalUsd) {
      breaches.push({ scope: "total", cap: env.totalUsd, after: spent.total + usd });
    }

    // The tightest cap drives `remainingUsd`/`capUsd`.
    const cap = this.tightestCap(env);
    const remaining = this.remainingFor(env, spent, usd);

    if (breaches.length > 0) {
      const first = breaches[0]!;
      const decision: BudgetDecision = {
        allowed: false,
        requiresApproval: false,
        remainingUsd: round4(remaining),
        capUsd: cap,
        reason: `hard cap exceeded (${first.scope}): ${round4(first.after)} > ${first.cap} USD`,
      };
      emitBudgetEvent(
        {
          type: BUDGET_EXCEEDED_EVENT,
          category,
          estimatedUsd: usd,
          capUsd: first.cap,
          scope: first.scope,
        },
        this.events,
        this.logger,
      );
      emitBudgetEvent(
        { type: BUDGET_CHECKED_EVENT, category, estimatedUsd: usd, decision },
        this.events,
        this.logger,
      );
      return decision;
    }

    // Ask-threshold policy: below threshold auto-allow; at/above require approval.
    const threshold = env.askThresholdUsd;
    const requiresApproval = threshold === null ? true : usd >= threshold;
    const decision: BudgetDecision = {
      allowed: true,
      requiresApproval,
      remainingUsd: round4(remaining),
      capUsd: cap,
      reason: requiresApproval
        ? threshold === null
          ? "approval always required (no ask threshold)"
          : `estimate ${round4(usd)} USD >= ask threshold ${threshold} USD — approval required`
        : `estimate ${round4(usd)} USD < ask threshold ${threshold} USD — auto-allow`,
    };
    emitBudgetEvent(
      { type: BUDGET_CHECKED_EVENT, category, estimatedUsd: usd, decision },
      this.events,
      this.logger,
    );
    return decision;
  }

  /** Tightest (smallest, non-null) cap across the envelope's periods. */
  private tightestCap(env: BudgetEnvelope): number | null {
    const caps = [env.perRunUsd, env.dailyUsd, env.monthlyUsd, env.totalUsd].filter(
      (c): c is number => c !== null,
    );
    if (caps.length === 0) return null;
    return Math.min(...caps);
  }

  /** Remaining USD under the binding cap after a hypothetical `usd` spend. */
  private remainingFor(
    env: BudgetEnvelope,
    spent: { day: number; month: number; total: number },
    usd: number,
  ): number {
    const candidates: number[] = [];
    if (env.perRunUsd !== null) candidates.push(env.perRunUsd - usd);
    if (env.dailyUsd !== null) candidates.push(env.dailyUsd - spent.day - usd);
    if (env.monthlyUsd !== null) candidates.push(env.monthlyUsd - spent.month - usd);
    if (env.totalUsd !== null) candidates.push(env.totalUsd - spent.total - usd);
    if (candidates.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...candidates);
  }

  /** In-memory rolling spend per category (period totals), refreshed on record/load. */
  private readonly spendCache = new Map<
    BudgetCategory,
    { day: number; month: number; total: number }
  >();

  // ------------------------------ Record ---------------------------------

  /**
   * Append a spend record to the ledger atomically and update spend caches.
   *
   * Writes are serialised; the ledger is rewritten atomically (read existing,
   * append the new line, write to a temp file, rename) so a reader never sees a
   * half-written file. Crossing a 50/80/100 % limit band emits an alert.
   *
   * @param entry - The spend to record. `ts` defaults to the injected clock.
   * @throws {BudgetError} when the ledger cannot be persisted.
   */
  async record(entry: LedgerEntry): Promise<void> {
    const normalised: LedgerEntry = {
      ts: entry.ts && !Number.isNaN(new Date(entry.ts).getTime()) ? entry.ts : this.now().toISOString(),
      category: entry.category,
      ...(entry.model !== undefined ? { model: entry.model } : {}),
      estimatedUsd: nonNeg(entry.estimatedUsd),
      actualUsd: nonNeg(entry.actualUsd),
      ...(entry.note !== undefined ? { note: entry.note } : {}),
    };

    await (this.writeChain = this.writeChain.then(
      () => this.appendLedgerLine(normalised),
      () => this.appendLedgerLine(normalised),
    ));

    // Update the in-memory spend cache and fire alerts after a durable write.
    this.applyToCache(normalised);
    const total = this.spendCache.get(normalised.category)?.total ?? 0;
    emitBudgetEvent(
      { type: BUDGET_SPENT_EVENT, entry: normalised, categoryTotalUsd: round4(total) },
      this.events,
      this.logger,
    );
    this.maybeAlert(normalised.category);
  }

  /** Append one JSON line to the ledger atomically (rewrite tmp + rename). */
  private async appendLedgerLine(entry: LedgerEntry): Promise<void> {
    const file = this.ledgerPath();
    try {
      await fs.mkdir(this.dirPath(), { recursive: true });
      let existing = "";
      try {
        existing = await fs.readFile(file, "utf8");
      } catch (err) {
        if (!hasCode(err, "ENOENT")) throw err;
      }
      const line = JSON.stringify(entry) + "\n";
      const next = existing.length > 0 && !existing.endsWith("\n") ? existing + "\n" + line : existing + line;
      await atomicWriteFile(file, next);
    } catch (cause) {
      throw new BudgetError(`Failed to append budget ledger entry`, {
        cause,
        details: { file },
      });
    }
  }

  /** Fold a single entry into the per-category spend cache. */
  private applyToCache(entry: LedgerEntry): void {
    const now = this.now();
    const today = now.toISOString().slice(0, DAY_KEY_LENGTH);
    const month = today.slice(0, MONTH_KEY_LENGTH);
    const keys = periodKeys(entry.ts);
    const cur = this.spendCache.get(entry.category) ?? { day: 0, month: 0, total: 0 };
    cur.total += entry.actualUsd;
    if (keys.day === today) cur.day += entry.actualUsd;
    if (keys.month === month) cur.month += entry.actualUsd;
    this.spendCache.set(entry.category, cur);
  }

  /** Emit alert events when cumulative spend crosses 50/80/100 % of any limit. */
  private maybeAlert(category: BudgetCategory): void {
    const env = this.envelopeFor(category);
    if (!env) return;
    const spent = this.spendCache.get(category) ?? { day: 0, month: 0, total: 0 };
    const scopes: Array<{ scope: "daily" | "monthly" | "total"; spent: number; limit: number | null }> = [
      { scope: "daily", spent: spent.day, limit: env.dailyUsd },
      { scope: "monthly", spent: spent.month, limit: env.monthlyUsd },
      { scope: "total", spent: spent.total, limit: env.totalUsd },
    ];
    for (const s of scopes) {
      if (s.limit === null || s.limit <= 0) continue;
      const pctValue = (s.spent / s.limit) * 100;
      for (const band of ALERT_BANDS) {
        if (pctValue >= band) {
          const key = `${category}:${s.scope}:${band}`;
          if (this.firedAlerts.has(key)) continue;
          this.firedAlerts.add(key);
          const alert: BudgetAlertEvent = {
            type: "budget.alert",
            category,
            scope: s.scope,
            pct: band,
            spentUsd: round4(s.spent),
            limitUsd: s.limit,
          };
          emitBudgetEvent(alert, this.events, this.logger);
        }
      }
    }
  }

  // ------------------------------ Status ---------------------------------

  /**
   * In-memory spend snapshot for every known category. Reflects entries seen by
   * {@link record} and {@link loadLedger} since construction.
   */
  status(): BudgetStatus {
    const categories: CategoryStatus[] = [];
    let totalSpent = 0;
    const seen = new Set<BudgetCategory>([
      ...this.spendCache.keys(),
      ...this.plan.envelopes.map((e) => e.category),
    ]);
    for (const category of seen) {
      const spent = this.spendCache.get(category) ?? { day: 0, month: 0, total: 0 };
      totalSpent += spent.total;
      categories.push({
        category,
        spentTodayUsd: round4(spent.day),
        spentMonthUsd: round4(spent.month),
        spentTotalUsd: round4(spent.total),
        envelope: this.envelopeFor(category),
      });
    }
    return {
      categories,
      totalSpentUsd: round4(totalSpent),
      entryCount: this.entryCount,
    };
  }

  private entryCount = 0;

  // --------------------------- Plan management ---------------------------

  /** The currently active plan (in-memory). */
  getPlan(): BudgetPlan {
    return {
      policy: this.plan.policy,
      fxRate: this.plan.fxRate,
      envelopes: this.plan.envelopes.map((e) => ({ ...e })),
      updatedAt: this.plan.updatedAt,
    };
  }

  /**
   * Replace the active plan and persist it atomically to `plan.toml`.
   *
   * @param plan - The new plan. `updatedAt` is stamped from the clock.
   * @throws {BudgetError} when persistence fails.
   */
  async setPlan(plan: BudgetPlan): Promise<void> {
    const next: BudgetPlan = {
      policy: DEFAULT_PLAN_POLICY,
      fxRate: nonNeg(plan.fxRate) || this.fxRate,
      envelopes: (plan.envelopes ?? []).map((e) => this.normaliseEnvelope(e)),
      updatedAt: this.now().toISOString(),
    };
    await this.persistPlan(next);
    this.plan = next;
    this.fxRate = next.fxRate;
  }

  /** Normalise an envelope, coercing bad numbers and `undefined` caps to null. */
  private normaliseEnvelope(e: BudgetEnvelope): BudgetEnvelope {
    const cap = (v: number | null | undefined): number | null =>
      v === null || v === undefined || !Number.isFinite(v) || v < 0 ? null : v;
    return {
      category: e.category,
      perRunUsd: cap(e.perRunUsd),
      dailyUsd: cap(e.dailyUsd),
      monthlyUsd: cap(e.monthlyUsd),
      totalUsd: cap(e.totalUsd),
      askThresholdUsd: cap(e.askThresholdUsd),
    };
  }

  /**
   * Install a best-practice default plan with three envelopes (development,
   * learning, operations) and a dedicated learning pot, then persist it.
   */
  async installDefaultPlan(): Promise<void> {
    const plan: BudgetPlan = {
      policy: DEFAULT_PLAN_POLICY,
      fxRate: this.fxRate,
      updatedAt: this.now().toISOString(),
      envelopes: DEFAULT_PLAN_ENVELOPES.map((e) => ({ ...e })),
    };
    await this.persistPlan(plan);
    this.plan = plan;
  }

  /**
   * Build a plan from interactive wizard answers (does not persist; call
   * {@link setPlan} to save). Sensible defaults fill any unanswered question.
   *
   * @param answers - User responses.
   */
  planInteractive(answers: PlanWizardAnswers): BudgetPlan {
    const fxRate = nonNeg(answers.fxRate) || this.fxRate;
    const threshold =
      answers.askThresholdUsd === null
        ? null
        : nonNeg(answers.askThresholdUsd) || WIZARD_DEFAULT_ASK_THRESHOLD_USD;
    const monthly = (v: number | null | undefined, fallback: number): number | null =>
      v === null ? null : nonNeg(v) || fallback;
    const env = (
      category: BudgetCategory,
      monthlyUsd: number | null,
      perRun: number,
    ): BudgetEnvelope => ({
      category,
      perRunUsd: perRun,
      dailyUsd: monthlyUsd === null ? null : round4(monthlyUsd / WIZARD_DAILY_FROM_MONTHLY_DIVISOR),
      monthlyUsd,
      totalUsd: null,
      askThresholdUsd: threshold,
    });
    return {
      policy: DEFAULT_PLAN_POLICY,
      fxRate,
      updatedAt: this.now().toISOString(),
      envelopes: [
        env(
          "development",
          monthly(answers.developmentMonthlyUsd, WIZARD_DEVELOPMENT_MONTHLY_USD),
          WIZARD_DEVELOPMENT_PER_RUN_USD,
        ),
        env(
          "learning",
          monthly(answers.learningMonthlyUsd, WIZARD_LEARNING_MONTHLY_USD),
          WIZARD_LEARNING_PER_RUN_USD,
        ),
        env(
          "operations",
          monthly(answers.operationsMonthlyUsd, WIZARD_OPERATIONS_MONTHLY_USD),
          WIZARD_OPERATIONS_PER_RUN_USD,
        ),
      ],
    };
  }

  /** Persist a plan atomically as TOML. */
  private async persistPlan(plan: BudgetPlan): Promise<void> {
    const file = this.planPath();
    try {
      await fs.mkdir(this.dirPath(), { recursive: true });
      const doc = stringifyToml(planToToml(plan));
      await atomicWriteFile(file, doc);
    } catch (cause) {
      throw new BudgetError(`Failed to persist budget plan`, { cause, details: { file } });
    }
  }

  /**
   * Load the persisted plan (`plan.toml`) into memory, tolerating a missing or
   * corrupt file (logs a warning, keeps the current in-memory plan).
   *
   * @returns The loaded (or fallback) plan.
   */
  async loadPlan(): Promise<BudgetPlan> {
    const file = this.planPath();
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      if (hasCode(err, "ENOENT")) return this.plan;
      throw new BudgetError(`Failed to read budget plan`, { cause: err, details: { file } });
    }
    try {
      const parsed = parseToml(raw) as Record<string, unknown>;
      this.plan = planFromToml(parsed, this.fxRate, this.now().toISOString());
      this.fxRate = this.plan.fxRate;
      return this.plan;
    } catch (err) {
      this.logger.warn("budget: corrupt plan.toml, ignoring", {
        file,
        error: String((err as Error)?.message ?? err),
      });
      return this.plan;
    }
  }

  /**
   * Load the ledger from disk into the in-memory spend cache, skipping corrupt
   * lines. Safe to call once at startup; never throws on malformed rows.
   *
   * @returns Number of valid entries folded in.
   */
  async loadLedger(): Promise<number> {
    const file = this.ledgerPath();
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      if (hasCode(err, "ENOENT")) return 0;
      throw new BudgetError(`Failed to read budget ledger`, { cause: err, details: { file } });
    }
    this.spendCache.clear();
    this.firedAlerts.clear();
    this.entryCount = 0;
    let valid = 0;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        this.logger.warn("budget: skipping corrupt ledger line");
        continue;
      }
      if (!isLedgerEntry(parsed)) {
        this.logger.warn("budget: skipping malformed ledger entry");
        continue;
      }
      this.applyToCache(parsed);
      this.entryCount += 1;
      valid += 1;
    }
    // Recompute alert state from the loaded totals.
    for (const category of this.spendCache.keys()) this.maybeAlert(category);
    return valid;
  }

  // ----------------------------- Reporting -------------------------------

  /**
   * Render a human-readable cost report, EUR-first with a USD line, ending with
   * a JA/NEIN confirmation prompt reflecting the {@link BudgetDecision}.
   *
   * @param estimate - The cost estimate.
   * @param decision - The budget decision for the estimate.
   */
  formatReport(estimate: CostEstimate, decision: BudgetDecision): string {
    const lines: string[] = [];
    lines.push("Kostenschaetzung / Cost estimate");
    lines.push("================================");
    if (estimate.pages !== undefined) lines.push(`Umfang / Scope:        ${estimate.pages} Seite(n)/Item(s)`);
    lines.push(`Tokens (in/out):       ${estimate.tokensIn} / ${estimate.tokensOut}`);
    lines.push("");
    lines.push(`Kosten / Cost (EUR):   ${fmtEur(estimate.eur)}`);
    lines.push(
      `Kosten / Cost (USD):   ${fmtUsd(estimate.usdLow)} – ${fmtUsd(estimate.usdHigh)} (fx ${estimate.fxRate})`,
    );
    if (estimate.byModel.length > 0) {
      lines.push("");
      lines.push("Pro Modell / Per model:");
      for (const m of estimate.byModel) {
        lines.push(`  - ${m.model}: ${fmtUsd(m.usd)} (in ${m.tokensIn} / out ${m.tokensOut})`);
      }
    }
    if (estimate.assumptions.length > 0) {
      lines.push("");
      lines.push("Annahmen / Assumptions:");
      for (const a of estimate.assumptions) lines.push(`  - ${a}`);
    }
    lines.push("");
    lines.push(`Budget:                ${decision.reason}`);
    lines.push(
      `Verbleibend / Remaining: ${
        Number.isFinite(decision.remainingUsd) ? fmtUsd(decision.remainingUsd) : "unbegrenzt / unlimited"
      }`,
    );
    lines.push("");
    if (!decision.allowed) {
      lines.push("BLOCKIERT / BLOCKED — Hard-Cap erreicht. Fortfahren nicht moeglich.");
      lines.push("Fortfahren? / Proceed? [JA / NEIN]: NEIN");
    } else if (decision.requiresApproval) {
      lines.push("Freigabe erforderlich / Approval required.");
      lines.push("Fortfahren? / Proceed? [JA / NEIN]:");
    } else {
      lines.push("Automatisch freigegeben / Auto-approved.");
      lines.push("Fortfahren? / Proceed? [JA / NEIN]: JA");
    }
    return lines.join("\n");
  }

  // ------------------------------ Helpers --------------------------------

  /** Find the envelope governing `category`, or `null` when none is configured. */
  private envelopeFor(category: BudgetCategory): BudgetEnvelope | null {
    return this.plan.envelopes.find((e) => e.category === category) ?? null;
  }
}

/** Construct a {@link BudgetPlanner}. */
export function createBudgetPlanner(opts: BudgetPlannerOptions): BudgetPlanner {
  return new BudgetPlanner(opts);
}

// -------------------------------- module utils -----------------------------

/** `true` for fs errors carrying the given `code` (e.g. `"ENOENT"`). */
function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === code
  );
}

/** Format a USD figure (2 dp, `$` suffix-free, plain). */
function fmtUsd(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0")}`;
}

/** Format an EUR figure. */
function fmtEur(n: number): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0")} EUR`;
}

/** Plain-object representation of a plan for TOML serialisation. */
function planToToml(plan: BudgetPlan): Record<string, unknown> {
  return {
    policy: plan.policy,
    fxRate: plan.fxRate,
    updatedAt: plan.updatedAt,
    envelopes: plan.envelopes.map((e) => ({
      category: e.category,
      perRunUsd: e.perRunUsd ?? "",
      dailyUsd: e.dailyUsd ?? "",
      monthlyUsd: e.monthlyUsd ?? "",
      totalUsd: e.totalUsd ?? "",
      askThresholdUsd: e.askThresholdUsd ?? "",
    })),
  };
}

/** Parse a TOML plan document back into a {@link BudgetPlan}. */
function planFromToml(doc: Record<string, unknown>, fallbackFx: number, ts: string): BudgetPlan {
  const fx = typeof doc.fxRate === "number" && doc.fxRate > 0 ? doc.fxRate : fallbackFx;
  const rawEnvs = Array.isArray(doc.envelopes) ? doc.envelopes : [];
  const cap = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  const envelopes: BudgetEnvelope[] = [];
  for (const e of rawEnvs) {
    if (typeof e !== "object" || e === null) continue;
    const obj = e as Record<string, unknown>;
    if (typeof obj.category !== "string") continue;
    envelopes.push({
      category: obj.category,
      perRunUsd: cap(obj.perRunUsd),
      dailyUsd: cap(obj.dailyUsd),
      monthlyUsd: cap(obj.monthlyUsd),
      totalUsd: cap(obj.totalUsd),
      askThresholdUsd: cap(obj.askThresholdUsd),
    });
  }
  return {
    policy: DEFAULT_PLAN_POLICY,
    fxRate: fx,
    envelopes,
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : ts,
  };
}

/** Structural validation of a parsed ledger entry. */
function isLedgerEntry(v: unknown): v is LedgerEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.ts === "string" &&
    typeof o.category === "string" &&
    typeof o.estimatedUsd === "number" &&
    Number.isFinite(o.estimatedUsd) &&
    typeof o.actualUsd === "number" &&
    Number.isFinite(o.actualUsd)
  );
}
