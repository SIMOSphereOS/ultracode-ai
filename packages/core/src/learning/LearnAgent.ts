/**
 * {@link LearnAgent} — orchestrates plan → (approved) run for a doc source.
 *
 * `plan(sourceId)` discovers candidate pages and asks the budget gate for a
 * cost **estimate** only — it performs **no** LLM work and incurs no crawl
 * cost beyond discovery. `run(sourceId, { approved })` refuses immediately when
 * `approved !== true` (no network, no LLM), checks the budget gate, then crawls
 * with bounded concurrency, distils changed pages into skills via the injected
 * author, records actual spend, and returns a {@link LearnRunReport}.
 *
 * A runtime cap hard-stops the run with a checkpoint so it can resume; state is
 * checkpointed every {@link CHECKPOINT_INTERVAL} pages.
 */

import os from "node:os";

import { NoopLogger } from "@ultracode/shared";
import type { IEventBus, ILLMProvider, Logger } from "@ultracode/shared";

import { createCheckpointStore, defaultSqliteLoader } from "./checkpoint.js";
import type { Checkpoint, CheckpointStore, SqliteLoader } from "./checkpoint.js";
import { LearnCapError, LearnError } from "./errors.js";
import { completedEvent, emitLearningEvent, estimatedEvent, startedEvent } from "./events.js";
import { distillPage } from "./extract.js";
import { Semaphore } from "./concurrency.js";
import { NativeCrawlerProvider } from "./NativeCrawlerProvider.js";
import { nodeDnsLookupAll } from "./urlGuard.js";
import { SourceLibrary } from "./SourceLibrary.js";
import { DEFAULT_ROUTING } from "./extract.js";
import {
  CHECKPOINT_INTERVAL,
  DEFAULT_CONCURRENCY,
  DEFAULT_TOPIC,
  PER_PAGE_TOKENS_IN,
  PER_PAGE_TOKENS_OUT,
  ROUND_USD_SCALE,
} from "./defaults.js";

export {
  CHECKPOINT_INTERVAL,
  PER_PAGE_TOKENS_IN,
  PER_PAGE_TOKENS_OUT,
} from "./defaults.js";
import type {
  CostEstimate,
  DocIngestionProvider,
  DocPage,
  FetchImpl,
  IBudgetGate,
  ISkillAuthor,
  IngestionContext,
  KnowledgeMaterial,
  LearnProgress,
  LearnRunPlan,
  LearnRunReport,
  LearnSource,
  NowFn,
  PageValidators,
} from "./types.js";

/** Construction options for {@link LearnAgent}. */
export interface LearnAgentOptions {
  /** Diagnostics logger. */
  logger?: Logger;
  /** Event bus for `learn.*` events. */
  events?: IEventBus;
  /** Budget gate (Module A). Absent → planning uses a zero estimate, run refuses approval-gated LLM. */
  budget?: IBudgetGate;
  /** Skill author (Module B). Absent → distilled material is computed but not persisted. */
  author?: ISkillAuthor;
  /** LLM provider for distillation. Absent → deterministic extraction. */
  provider?: ILLMProvider;
  /** Ingestion strategy. Defaults to {@link NativeCrawlerProvider}. */
  ingestion?: DocIngestionProvider;
  /** Home directory override. */
  homeDir?: string;
  /** Injected `fetch` (always injected in tests). */
  fetchImpl?: FetchImpl;
  /** Clock injection (`Date.now`). */
  now?: NowFn;
  /** sqlite loader override (tests force the JSON fallback). */
  sqliteLoader?: SqliteLoader;
}

/** Options for {@link LearnAgent.run}. */
export interface LearnRunOptions {
  /** MUST be `true` for the run to touch the network or an LLM. */
  approved: boolean;
  /** Cancellation signal. */
  signal?: AbortSignal;
  /** Progress callback. */
  onProgress?: (p: LearnProgress) => void;
  /** Hard runtime cap in milliseconds; exceeding it checkpoints and stops. */
  maxRuntimeMs?: number;
  /** Crawl concurrency (default 4). */
  concurrency?: number;
  /** Whether to throw {@link LearnCapError} on hard-stop (default `false`: return partial report). */
  throwOnCap?: boolean;
}

/** Orchestrates documentation learning for a single source. */
export class LearnAgent {
  /** The persisted source library (public per contract). */
  public readonly library: SourceLibrary;

  private readonly logger: Logger;
  private readonly events?: IEventBus;
  private readonly budget?: IBudgetGate;
  private readonly author?: ISkillAuthor;
  private readonly provider?: ILLMProvider;
  private readonly ingestion: DocIngestionProvider;
  private readonly homeDir: string;
  private readonly fetchImpl?: FetchImpl;
  private readonly now: NowFn;
  private readonly sqliteLoader: SqliteLoader;

  /** @param opts - Injected dependencies. */
  constructor(opts: LearnAgentOptions = {}) {
    this.logger = opts.logger ?? new NoopLogger();
    this.events = opts.events;
    this.budget = opts.budget;
    this.author = opts.author;
    this.provider = opts.provider;
    this.homeDir = opts.homeDir ?? os.homedir();
    this.ingestion =
      opts.ingestion ??
      new NativeCrawlerProvider({ dnsLookup: nodeDnsLookupAll, allowPrivate: false });
    this.fetchImpl = opts.fetchImpl;
    this.now = opts.now ?? (() => Date.now());
    this.sqliteLoader = opts.sqliteLoader ?? defaultSqliteLoader;
    this.library = new SourceLibrary(this.homeDir, this.logger);
  }

  /**
   * Build a {@link LearnRunPlan}: discover candidates and estimate cost. No
   * LLM work is done and no crawl cost beyond discovery is incurred.
   *
   * @param sourceId - Id of a source in the library.
   * @throws {LearnError} when the source is unknown.
   */
  async plan(sourceId: string): Promise<LearnRunPlan> {
    const source = await this.requireSource(sourceId);
    const ctx = this.ingestionContext();
    const candidatePages = await this.ingestion.discover(source, ctx);
    const estimate = this.estimateFor(candidatePages.length);
    const plan: LearnRunPlan = { sourceId, candidatePages, estimate };
    emitLearningEvent(estimatedEvent(plan), this.events, this.logger);
    return plan;
  }

  /**
   * Execute a learn run. Refuses immediately (no network, no LLM) unless
   * `approved === true`. Checks the budget gate, crawls with bounded
   * concurrency, distils changed pages into skills, records actual spend.
   *
   * @param sourceId - Id of a source in the library.
   * @param opts - Approval, signal, progress, runtime cap and concurrency.
   * @throws {LearnError} when the source is unknown or approval is missing.
   * @throws {LearnCapError} when the cap is hit and `throwOnCap` is set.
   */
  async run(sourceId: string, opts: LearnRunOptions): Promise<LearnRunReport> {
    const startedAt = new Date(this.now()).toISOString();
    const source = await this.requireSource(sourceId);

    if (opts?.approved !== true) {
      throw new LearnError("Learn run requires explicit approval (approved: true)", {
        details: { sourceId },
      });
    }

    // Plan first so we have candidates + estimate; this is discovery-only.
    const ctx = this.ingestionContext(opts.signal);
    const candidatePages = await this.ingestion.discover(source, ctx);
    const estimate = this.estimateFor(candidatePages.length);

    // Budget gate: refuse before any LLM work when not allowed.
    if (this.budget) {
      const decision = this.budget.check(estimate, "learning");
      if (!decision.allowed) {
        throw new LearnError(`Budget gate refused the learn run: ${decision.reason}`, {
          details: { sourceId, remainingUsd: decision.remainingUsd },
        });
      }
    }

    emitLearningEvent(
      startedEvent({ sourceId, candidatePages, estimate }, startedAt),
      this.events,
      this.logger,
    );

    // Resume from checkpoint when present.
    const store = await createCheckpointStore(sourceId, this.homeDir, this.logger, this.sqliteLoader);
    let report: LearnRunReport;
    try {
      report = await this.crawlAndLearn(source, candidatePages, estimate, store, startedAt, opts, ctx);
    } finally {
      store.close();
    }

    emitLearningEvent(completedEvent(report), this.events, this.logger);
    return report;
  }

  /* --------------------------------------------------------------------- */

  /** The core crawl + distil + persist loop with checkpointing and cap. */
  private async crawlAndLearn(
    source: LearnSource,
    candidatePages: string[],
    estimate: CostEstimate,
    store: CheckpointStore,
    startedAt: string,
    opts: LearnRunOptions,
    ctx: IngestionContext,
  ): Promise<LearnRunReport> {
    const prior = await store.load();
    const processedSet = new Set<string>(prior?.processed ?? []);
    const validators: Record<string, PageValidators> = { ...(prior?.validators ?? {}) };
    const usage = { ...(prior?.usage ?? { tokensIn: 0, tokensOut: 0, actualUsd: 0 }) };

    const counters = {
      pagesChecked: 0,
      notModified: 0,
      unchanged: 0,
      processed: 0,
      errors: 0,
      skillsCreated: 0,
      skillsUpdated: 0,
    };

    const pending = candidatePages.filter((u) => !processedSet.has(u));
    const sharedCache = new Map<string, string>();
    const deadline = opts.maxRuntimeMs && opts.maxRuntimeMs > 0 ? this.now() + opts.maxRuntimeMs : Infinity;
    const sem = new Semaphore(Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY));
    const llmAllowed = !!this.provider && !!this.budget; // budget already approved above

    let stopped = false;
    let sinceCheckpoint = 0;

    const handleOne = async (url: string): Promise<void> => {
      if (stopped || opts.signal?.aborted) return;
      if (this.now() >= deadline) {
        stopped = true;
        return;
      }
      let page: DocPage;
      try {
        page = await this.ingestion.fetchPage(url, validators[url] ?? {}, ctx);
      } catch (err) {
        if (isAbort(err)) throw err;
        counters.errors++;
        this.progress(opts, counters, candidatePages.length, url, "error");
        return;
      }

      counters.pagesChecked++;
      if (page.status === 304) {
        counters.notModified++;
        processedSet.add(url);
        this.progress(opts, counters, candidatePages.length, url, "notModified");
      } else if (page.status === 0 || page.status >= 400) {
        counters.errors++;
        this.progress(opts, counters, candidatePages.length, url, "error");
        return;
      } else if (!page.changed) {
        counters.unchanged++;
        processedSet.add(url);
        if (page.contentHash) validators[url] = mergeValidators(validators[url], page);
        this.progress(opts, counters, candidatePages.length, url, "unchanged");
      } else {
        // Distil + author the changed page.
        const { material, usage: u } = await distillPage(page.text ?? "", {
          catalog: source.catalog,
          topic: page.title ?? deriveTopic(url),
          sources: [url],
          ...(this.provider ? { provider: this.provider } : {}),
          llmAllowed,
          routing: DEFAULT_ROUTING,
          cache: sharedCache,
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
        usage.tokensIn += u.tokensIn;
        usage.tokensOut += u.tokensOut;
        await this.persistMaterial(material, counters);
        counters.processed++;
        processedSet.add(url);
        if (page.contentHash) validators[url] = mergeValidators(validators[url], page);
        this.progress(opts, counters, candidatePages.length, url, "processed");
      }

      sinceCheckpoint++;
      if (sinceCheckpoint >= CHECKPOINT_INTERVAL) {
        sinceCheckpoint = 0;
        await this.checkpoint(store, source.id, processedSet, validators, usage);
      }
    };

    // Bounded-concurrency fan-out; abort surfaces via the thrown signal error.
    try {
      await Promise.all(pending.map((url) => sem.run(() => handleOne(url))));
    } catch (err) {
      // On abort, persist a final checkpoint for everything already processed
      // BEFORE unwinding, so a resume is idempotent (no double-processing) —
      // mirroring the runtime-cap path's final checkpoint. Then re-throw so the
      // run still rejects with the abort error per the contract.
      if (isAbort(err)) {
        usage.actualUsd = this.actualUsd(estimate, usage, counters.processed, candidatePages.length);
        await this.checkpoint(store, source.id, processedSet, validators, usage);
      }
      throw err;
    }

    // Final checkpoint + actual cost.
    usage.actualUsd = this.actualUsd(estimate, usage, counters.processed, candidatePages.length);
    await this.checkpoint(store, source.id, processedSet, validators, usage);

    if (this.budget) {
      await this.budget
        .record({
          ts: new Date(this.now()).toISOString(),
          category: "learning",
          estimatedUsd: midpoint(estimate),
          actualUsd: usage.actualUsd,
          note: `learn:${source.id}`,
        })
        .catch((err) => this.logger.warn("learning: budget.record failed", { error: String(err) }));
    }

    if (!stopped) {
      // Clean run: clear the checkpoint and stamp lastProcessed.
      await store.clear();
      await this.markProcessed(source);
    }

    const finishedAt = new Date(this.now()).toISOString();
    const report: LearnRunReport = {
      sourceId: source.id,
      pagesChecked: counters.pagesChecked,
      notModified: counters.notModified,
      unchanged: counters.unchanged,
      processed: counters.processed,
      errors: counters.errors,
      estimatedUsd: midpoint(estimate),
      actualUsd: usage.actualUsd,
      skillsCreated: counters.skillsCreated,
      skillsUpdated: counters.skillsUpdated,
      startedAt,
      finishedAt,
    };

    if (stopped && opts.throwOnCap) {
      throw new LearnCapError("Learn run hit its runtime cap; checkpoint saved", {
        details: { sourceId: source.id, report },
      });
    }
    return report;
  }

  /** Persist distilled material as a skill via the injected author. */
  private async persistMaterial(
    material: KnowledgeMaterial,
    counters: { skillsCreated: number; skillsUpdated: number },
  ): Promise<void> {
    if (!this.author) return;
    try {
      const proposal = await this.author.createOrUpgradeSkill(material);
      await this.author.persist(proposal, { approved: true });
      if (proposal.diffFromExisting) counters.skillsUpdated++;
      else counters.skillsCreated++;
    } catch (err) {
      this.logger.warn("learning: author failed for topic", {
        topic: material.topic,
        error: String((err as Error)?.message ?? err),
      });
    }
  }

  /** Write a checkpoint snapshot. */
  private async checkpoint(
    store: CheckpointStore,
    sourceId: string,
    processed: Set<string>,
    validators: Record<string, PageValidators>,
    usage: { tokensIn: number; tokensOut: number; actualUsd: number },
  ): Promise<void> {
    const cp: Checkpoint = {
      sourceId,
      updatedAt: new Date(this.now()).toISOString(),
      processed: [...processed],
      validators,
      usage,
    };
    await store.save(cp).catch((err) => this.logger.warn("learning: checkpoint save failed", { error: String(err) }));
  }

  /** Stamp the source's `lastProcessed` and persist it. */
  private async markProcessed(source: LearnSource): Promise<void> {
    try {
      await this.library.add({ ...source, lastProcessed: new Date(this.now()).toISOString() });
    } catch (err) {
      this.logger.warn("learning: failed to stamp lastProcessed", { error: String(err) });
    }
  }

  /** Look up a source or throw {@link LearnError}. */
  private async requireSource(sourceId: string): Promise<LearnSource> {
    const source = await this.library.get(sourceId);
    if (!source) throw new LearnError(`Unknown learning source: ${sourceId}`, { details: { sourceId } });
    return source;
  }

  /** Build the ingestion context with the injected fetch (or global). */
  private ingestionContext(signal?: AbortSignal): IngestionContext {
    const fetchImpl = this.fetchImpl ?? globalFetch();
    return signal ? { fetchImpl, signal } : { fetchImpl };
  }

  /** Cost estimate for `pages` candidate pages via the budget gate (or zero). */
  private estimateFor(pages: number): CostEstimate {
    if (this.budget) {
      return this.budget.estimate({
        category: "learning",
        pages,
        perItemTokensIn: PER_PAGE_TOKENS_IN,
        perItemTokensOut: PER_PAGE_TOKENS_OUT,
        routing: DEFAULT_ROUTING,
      });
    }
    return zeroEstimate(pages);
  }

  /** Derive an actual USD figure from estimate + processed share. */
  private actualUsd(
    estimate: CostEstimate,
    usage: { tokensIn: number; tokensOut: number },
    processed: number,
    total: number,
  ): number {
    // If the budget gate priced by token, scale the midpoint by processed share.
    if (total <= 0) return 0;
    const share = Math.min(1, processed / total);
    const scaled = midpoint(estimate) * share;
    return Number.isFinite(scaled) ? round4(scaled) : 0;
  }

  /** Fire the progress callback, guarding against thrown handlers. */
  private progress(
    opts: LearnRunOptions,
    counters: { processed: number; unchanged: number; notModified: number; errors: number },
    total: number,
    url: string,
    outcome: LearnProgress["outcome"],
  ): void {
    if (!opts.onProgress) return;
    const done = counters.processed + counters.unchanged + counters.notModified + counters.errors;
    try {
      opts.onProgress({ done, total, url, outcome });
    } catch {
      /* never let a progress handler break the run */
    }
  }
}

/* ------------------------------- helpers -------------------------------- */

/** Midpoint of an estimate's USD range. */
function midpoint(e: CostEstimate): number {
  return round4((e.usdLow + e.usdHigh) / 2);
}

/** Round to 4 decimals. */
function round4(n: number): number {
  return Math.round(n * ROUND_USD_SCALE) / ROUND_USD_SCALE;
}

/** A zero-cost estimate (used when no budget gate is injected). */
function zeroEstimate(pages: number): CostEstimate {
  return {
    pages,
    tokensIn: 0,
    tokensOut: 0,
    byModel: [],
    usdLow: 0,
    usdHigh: 0,
    eur: 0,
    fxRate: 1,
    assumptions: ["no budget gate injected; cost treated as zero (local/offline)"],
  };
}

/** Merge new page validators (etag/lastmod/hash) into the carried set. */
function mergeValidators(prev: PageValidators | undefined, page: DocPage): PageValidators {
  const next: PageValidators = { ...(prev ?? {}) };
  if (page.contentHash) next.contentHash = page.contentHash;
  if (page.lastmod) next.lastModified = page.lastmod;
  return next;
}

/** Derive a topic label from a URL path's last segment. */
function deriveTopic(url: string): string {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] ?? DEFAULT_TOPIC;
    return last.replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim() || DEFAULT_TOPIC;
  } catch {
    return DEFAULT_TOPIC;
  }
}

/** Whether an unknown error is an abort. */
function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Resolve the global `fetch` as a {@link FetchImpl}, or throw if absent. */
function globalFetch(): FetchImpl {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== "function") {
    throw new LearnError("No fetch implementation available; inject fetchImpl");
  }
  return f as unknown as FetchImpl;
}
