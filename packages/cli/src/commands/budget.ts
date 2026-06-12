/**
 * `ultracode budget plan|show|set|status|history`
 *
 * Cost-control commands backed by the facade's `budget` sub-API (Module A).
 * - `budget show` / `budget status` print the current spend snapshot.
 * - `budget plan` installs/reads a plan (interactive answers via `--cap`/`--threshold`).
 * - `budget set <file>` loads a plan from a JSON file.
 * - `budget history [--limit n]` prints the ledger.
 *
 * Every subcommand supports `--json` for machine-readable output.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import type { Command } from "commander";
import { ValidationError } from "@ultracode/shared";
import type { CliContext } from "../context.js";
import { budgetOf, withExtFacade } from "./ext-helpers.js";
import { formatBudgetStatus, formatLedger } from "./ext-format.js";
import type { BudgetPlanView } from "@ultracode/core";

interface JsonOption {
  json?: boolean;
}

interface PlanOptions extends JsonOption {
  cap?: string;
  threshold?: string;
}

interface HistoryOptions extends JsonOption {
  limit?: string;
}

/** Parse a numeric CLI option, throwing {@link ValidationError} when invalid. */
function parseNumber(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ValidationError(`${label} must be a finite number, got "${raw}"`);
  return n;
}

/** Register the `budget` command group on `program`. */
export function registerBudgetCommands(program: Command, ctx: CliContext): void {
  const budget = program.command("budget").description("cost control: plan, status and spend history");

  const showAction = async (opts: JsonOption): Promise<void> =>
    withExtFacade(ctx, async (facade) => {
      const status = await budgetOf(facade).status();
      ctx.stdout.write(opts.json ? `${JSON.stringify(status)}\n` : formatBudgetStatus(status));
    });

  budget
    .command("show")
    .description("print the current budget status (spend, cap, remaining)")
    .option("--json", "output as JSON")
    .action(showAction);

  budget
    .command("status")
    .description("alias of `budget show`")
    .option("--json", "output as JSON")
    .action(showAction);

  budget
    .command("plan")
    .description("install or read the budget plan (caps / approval threshold)")
    .option("--cap <usd>", "monthly USD cap (omit for no cap)")
    .option("--threshold <usd>", "USD value above which a run requires approval")
    .option("--json", "output as JSON")
    .action(async (opts: PlanOptions) =>
      withExtFacade(ctx, async (facade) => {
        const answers: Record<string, unknown> = {};
        if (opts.cap !== undefined) answers["capUsd"] = parseNumber(opts.cap, "--cap");
        if (opts.threshold !== undefined) {
          answers["approvalThresholdUsd"] = parseNumber(opts.threshold, "--threshold");
        }
        const plan = await budgetOf(facade).plan(
          Object.keys(answers).length > 0 ? answers : undefined,
        );
        if (Object.keys(answers).length > 0) {
          await budgetOf(facade).setPlan(plan);
        }
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify(plan)}\n`);
        } else {
          ctx.stdout.write(`Budget Plan\n  Cap: ${plan.capUsd === null ? "(none)" : `$${plan.capUsd}`}\n`);
          if (plan.approvalThresholdUsd !== undefined) {
            ctx.stdout.write(`  Approval threshold: $${plan.approvalThresholdUsd}\n`);
          }
        }
      }),
    );

  budget
    .command("set")
    .description("load and persist a budget plan from a JSON file")
    .argument("<file>", "JSON file describing a BudgetPlan")
    .action(async (file: string) =>
      withExtFacade(ctx, async (facade) => {
        const target = path.resolve(ctx.cwd, file);
        let raw: string;
        try {
          raw = await fs.readFile(target, "utf8");
        } catch (cause) {
          throw new ValidationError(`Cannot read budget plan file: ${target}`, { cause });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.replace(/^﻿/, "")) as unknown;
        } catch (cause) {
          throw new ValidationError(`Invalid JSON in budget plan file: ${target}`, { cause });
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new ValidationError(`Budget plan file must contain a JSON object: ${target}`);
        }
        await budgetOf(facade).setPlan(parsed as BudgetPlanView);
        ctx.stdout.write(`✓ budget plan loaded from ${target}\n`);
      }),
    );

  budget
    .command("history")
    .description("print the spend ledger (estimated vs. actual)")
    .option("--limit <n>", "maximum number of entries to show")
    .option("--json", "output as JSON")
    .action(async (opts: HistoryOptions) =>
      withExtFacade(ctx, async (facade) => {
        const limit = opts.limit !== undefined ? parseNumber(opts.limit, "--limit") : undefined;
        const entries = await budgetOf(facade).history(limit);
        ctx.stdout.write(opts.json ? `${JSON.stringify(entries)}\n` : formatLedger(entries));
      }),
    );
}
