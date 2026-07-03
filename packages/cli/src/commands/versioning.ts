/**
 * Versioning commands:
 * - `ultracode version analyze [range]` / `version suggest [range]`
 * - `ultracode release plan [version]`
 * - `ultracode quality` (exits 1 when the quality gates fail — CI-friendly)
 *
 * All subcommands support `--json` for machine-readable output.
 */

import process from "node:process";
import type { Command } from "commander";
import type { CliContext, UltraCodeFacade } from "../context.js";
import { safeDispose } from "../context.js";
import {
  formatChangeAnalysis,
  formatQualityReport,
  formatReleasePlan,
  formatVersionSuggestion,
} from "../format.js";

interface JsonOption {
  json?: boolean;
}

async function withFacade<T>(
  ctx: CliContext,
  fn: (facade: UltraCodeFacade) => Promise<T>,
): Promise<T> {
  const facade = await ctx.createFacade({ cwd: ctx.cwd });
  try {
    return await fn(facade);
  } finally {
    await safeDispose(facade);
  }
}

/** Register `version`, `release` and `quality` commands on `program`. */
export function registerVersioningCommands(program: Command, ctx: CliContext): void {
  const version = program
    .command("version")
    .description("AI versioning: change analysis and version suggestions");

  version
    .command("analyze")
    .description("analyze the changes in the working tree / commit range")
    .argument("[range]", 'git range to analyze, e.g. "v1.2.0..HEAD"')
    .option("--json", "output as JSON")
    .action(async (range: string | undefined, opts: JsonOption) =>
      withFacade(ctx, async (facade) => {
        const analysis = await facade.versioning.analyze(range);
        ctx.stdout.write(
          opts.json ? `${JSON.stringify(analysis)}\n` : formatChangeAnalysis(analysis),
        );
      }),
    );

  version
    .command("suggest")
    .description("suggest the next version based on the analyzed changes")
    .argument("[range]", 'git range to analyze, e.g. "v1.2.0..HEAD"')
    .option("--json", "output as JSON")
    .action(async (range: string | undefined, opts: JsonOption) =>
      withFacade(ctx, async (facade) => {
        const suggestion = await facade.versioning.suggest(range);
        ctx.stdout.write(
          opts.json ? `${JSON.stringify(suggestion)}\n` : formatVersionSuggestion(suggestion),
        );
      }),
    );

  const release = program.command("release").description("release planning");

  release
    .command("plan")
    .description("draft a release plan for the given (or suggested) version")
    .argument("[version]", "target version; suggested automatically when omitted")
    .option("--json", "output as JSON")
    .action(async (target: string | undefined, opts: JsonOption) =>
      withFacade(ctx, async (facade) => {
        const plan = await facade.versioning.plan(target);
        ctx.stdout.write(opts.json ? `${JSON.stringify(plan)}\n` : formatReleasePlan(plan));
      }),
    );

  program
    .command("quality")
    .description("run the release quality gates (exit code 1 when gates fail)")
    .option("--json", "output as JSON")
    .action(async (opts: JsonOption) =>
      withFacade(ctx, async (facade) => {
        const report = await facade.versioning.quality();
        ctx.stdout.write(opts.json ? `${JSON.stringify(report)}\n` : formatQualityReport(report));
        if (!report.passed) process.exitCode = 1;
      }),
    );
}
