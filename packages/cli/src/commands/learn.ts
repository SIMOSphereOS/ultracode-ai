/**
 * `ultracode learn sources list|add <url>|remove <id>` and
 * `ultracode learn run [sourceId]` / `ultracode learn schedule`.
 *
 * Documentation-learning commands backed by the facade's `learning` sub-API
 * (Module C). `learn run` ALWAYS prints the budget cost report first
 * (`budget.formatReport(estimate, decision)`), then requires explicit approval:
 * `--yes`, or an interactive YES on a TTY. Without a TTY and without `--yes`
 * the run is aborted before any network/LLM work happens.
 *
 * Every subcommand supports `--json` where it makes sense.
 */

import process from "node:process";
import type { Command } from "commander";
import { ValidationError } from "@ultracode/shared";
import type { CliContext } from "../context.js";
import { budgetOf, learningOf, withExtFacade } from "./ext-helpers.js";
import type { ExtendedFacade } from "./ext-helpers.js";
import { formatLearnReport, formatSourceList } from "./ext-format.js";
import type { BudgetDecision, CostEstimate } from "@ultracode/core";

interface JsonOption {
  json?: boolean;
}

interface AddOptions extends JsonOption {
  catalog?: string;
  schedule?: string;
  scope?: string;
  locale?: string;
}

interface RunOptions extends JsonOption {
  yes?: boolean;
}

/**
 * Confirmation surface for `learn run` — injectable so tests stay offline and
 * deterministic. The default reads a single line from `ctx.stdin`.
 */
export interface ConfirmIO {
  /** True when an interactive prompt is possible (a TTY on both ends). */
  interactive: boolean;
  /** Ask a yes/no question; resolves true only for an affirmative answer. */
  confirm(question: string): Promise<boolean>;
}

const AFFIRMATIVE = new Set(["y", "yes", "j", "ja"]);

/** Build the default {@link ConfirmIO} from the context's stdin/stdout. */
export function createConfirmIO(ctx: CliContext): ConfirmIO {
  const interactive = ctx.stdin.isTTY === true && ctx.stdout.isTTY === true;
  return {
    interactive,
    confirm: (question: string) =>
      new Promise<boolean>((resolve) => {
        ctx.stdout.write(question);
        const onData = (chunk: Buffer | string): void => {
          ctx.stdin.removeListener("data", onData);
          ctx.stdin.pause?.();
          const answer = (typeof chunk === "string" ? chunk : chunk.toString("utf8")).trim().toLowerCase();
          resolve(AFFIRMATIVE.has(answer));
        };
        ctx.stdin.resume?.();
        ctx.stdin.on("data", onData);
      }),
  };
}

/** Estimate → decision wrapper; falls back to a permissive decision if the
 * facade does not expose `check` (so the report still renders). */
async function decideFor(
  facade: ExtendedFacade,
  estimate: CostEstimate,
): Promise<BudgetDecision> {
  const budget = budgetOf(facade);
  if (typeof budget.check === "function") {
    return budget.check(estimate, "learning");
  }
  return {
    allowed: true,
    requiresApproval: true,
    remainingUsd: 0,
    capUsd: null,
    reason: "budget.check unavailable; manual approval required",
  };
}

/** Register the `learn` command group on `program`. */
export function registerLearnCommands(
  program: Command,
  ctx: CliContext,
  io: ConfirmIO = createConfirmIO(ctx),
): void {
  const learn = program.command("learn").description("learn from documentation sources");

  /* ---------------------------- sources ----------------------------- */
  const sources = learn.command("sources").description("manage learning sources");

  sources
    .command("list")
    .description("list registered documentation sources")
    .option("--json", "output as JSON")
    .action(async (opts: JsonOption) =>
      withExtFacade(ctx, async (facade) => {
        const list = await learningOf(facade).sources.list();
        ctx.stdout.write(opts.json ? `${JSON.stringify(list)}\n` : formatSourceList(list));
      }),
    );

  sources
    .command("add")
    .description("register a new documentation source")
    .argument("<url>", "documentation root URL or sitemap")
    .option("--catalog <catalog>", "catalog to file generated skills under")
    .option("--schedule <schedule>", 'refresh schedule ("on-demand" | "annual" | cron)')
    .option("--scope <scope>", "URL path scope filter")
    .option("--locale <locale>", "default locale (e.g. de-de)")
    .option("--json", "output as JSON")
    .action(async (url: string, opts: AddOptions) =>
      withExtFacade(ctx, async (facade) => {
        if (url.trim() === "") throw new ValidationError("Source URL must not be empty.");
        const source = await learningOf(facade).sources.add({
          url,
          ...(opts.catalog !== undefined ? { catalog: opts.catalog } : {}),
          ...(opts.schedule !== undefined ? { schedule: opts.schedule } : {}),
          ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
          ...(opts.locale !== undefined ? { localeDefault: opts.locale } : {}),
        });
        ctx.stdout.write(opts.json ? `${JSON.stringify(source)}\n` : `✓ added source ${source.id} (${source.url})\n`);
      }),
    );

  sources
    .command("remove")
    .description("remove a registered documentation source")
    .argument("<id>", "source id")
    .option("--json", "output as JSON")
    .action(async (id: string, opts: JsonOption) =>
      withExtFacade(ctx, async (facade) => {
        const removed = await learningOf(facade).sources.remove(id);
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify({ id, removed })}\n`);
        } else {
          ctx.stdout.write(removed ? `✓ removed source ${id}\n` : `source ${id} not found\n`);
        }
        if (!removed) process.exitCode = 1;
      }),
    );

  /* ------------------------------ run ------------------------------- */
  learn
    .command("run")
    .description("plan and (after approval) run learning for a source — shows the cost report first")
    .argument("[sourceId]", "source id; required unless exactly one source exists")
    .option("--yes", "approve the run without an interactive prompt")
    .option("--json", "output as JSON")
    .action(async (sourceId: string | undefined, opts: RunOptions) =>
      withExtFacade(ctx, async (facade) => {
        const learning = learningOf(facade);
        const id = await resolveSourceId(facade, sourceId);

        const plan = await learning.plan(id);
        const decision = await decideFor(facade, plan.estimate);

        // ALWAYS show the cost report before doing anything else.
        ctx.stdout.write(budgetOf(facade).formatReport(plan.estimate, decision));

        if (!decision.allowed) {
          ctx.stdout.write(`✗ run blocked by budget: ${decision.reason}\n`);
          process.exitCode = 1;
          return;
        }

        const approved = await approveRun(ctx, io, opts.yes === true);
        if (!approved) {
          // Non-TTY without --yes, or an explicit "no": abort WITHOUT network/LLM.
          process.exitCode = 1;
          return;
        }

        const report = await learning.run(id, {
          approved: true,
          onProgress: (p) => {
            if (opts.json !== true && p.total > 0) {
              ctx.stdout.write(`  …${p.done}/${p.total}${p.url ? ` ${p.url}` : ""}\n`);
            }
          },
        });
        ctx.stdout.write(opts.json ? `${JSON.stringify(report)}\n` : formatLearnReport(report));
      }),
    );

  /* ---------------------------- schedule ---------------------------- */
  learn
    .command("schedule")
    .description("show each source's refresh schedule")
    .option("--json", "output as JSON")
    .action(async (opts: JsonOption) =>
      withExtFacade(ctx, async (facade) => {
        const list = await learningOf(facade).sources.list();
        const rows = list.map((s) => ({
          id: s.id,
          schedule: s.schedule,
          lastProcessed: s.lastProcessed ?? null,
        }));
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify(rows)}\n`);
          return;
        }
        if (rows.length === 0) {
          ctx.stdout.write("(no learning sources)\n");
          return;
        }
        ctx.stdout.write("Learning Schedule\n");
        for (const r of rows) {
          ctx.stdout.write(`  ${r.id}: ${r.schedule} (last ${r.lastProcessed ?? "never"})\n`);
        }
      }),
    );
}

/** Resolve the source id, defaulting to the only source when omitted. */
async function resolveSourceId(facade: ExtendedFacade, sourceId: string | undefined): Promise<string> {
  if (sourceId !== undefined && sourceId.trim() !== "") return sourceId;
  const list = await learningOf(facade).sources.list();
  if (list.length === 1 && list[0] !== undefined) return list[0].id;
  if (list.length === 0) throw new ValidationError("No learning sources registered. Add one with `learn sources add`.");
  throw new ValidationError(
    `Multiple sources registered; specify one: ${list.map((s) => s.id).join(", ")}`,
  );
}

/**
 * Decide whether the run is approved: `--yes` short-circuits to true; otherwise
 * an interactive YES is required. Without a TTY and without `--yes`, a hint is
 * printed and the run is refused.
 */
async function approveRun(ctx: CliContext, io: ConfirmIO, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!io.interactive) {
    ctx.stdout.write(
      "Refusing to start without approval: pass --yes (no interactive terminal available).\n",
    );
    return false;
  }
  const ok = await io.confirm("Proceed with the learn run? [y/N] ");
  if (!ok) ctx.stdout.write("Aborted.\n");
  return ok;
}
