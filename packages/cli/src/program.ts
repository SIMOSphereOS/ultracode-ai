/**
 * Commander program assembly and the top-level error boundary.
 *
 * {@link createProgram} wires all subcommands against a {@link CliContext};
 * {@link runCli} parses an argv, maps every failure mode to a process exit
 * code (UltraCodeError → red message + 1, unknown → message + `--debug` hint
 * + 1) and never calls `process.exit` itself — only `process.exitCode`.
 */

import process from "node:process";
import { Command, CommanderError } from "commander";
import { UltraCodeError } from "ultracode-shared";
import { registerAuthoringAgentCommands } from "./commands/authoring-agents.js";
import { registerBudgetCommands } from "./commands/budget.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerLearnCommands } from "./commands/learn.js";
import { registerListCommands } from "./commands/list.js";
import { registerRunCommand } from "./commands/run.js";
import { runSetup } from "./commands/setup.js";
import { registerSkillsCommands } from "./commands/skills.js";
import { registerVersioningCommands } from "./commands/versioning.js";
import type { CliContext } from "./context.js";
import { createDefaultContext } from "./context.js";
import { getCliVersion } from "./utils/cli-version.js";
import { paint } from "./utils/text.js";

interface RootOptions {
  setup?: boolean;
  debug?: boolean;
}

/** Build the fully wired commander program for the given context. */
export function createProgram(ctx: CliContext): Command {
  const program = new Command();

  program
    .name("ultracode-ai")
    .description("UltraCode — interactive AI code assistant for the terminal")
    .version(getCliVersion(), "-V, --version", "print the CLI version")
    .option("--debug", "print stack traces for unexpected errors")
    .option("--setup", "run the interactive setup wizard")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => {
        ctx.stdout.write(s);
      },
      writeErr: (s) => {
        ctx.stderr.write(s);
      },
    });

  registerRunCommand(program, ctx);
  registerConfigCommand(program, ctx);
  registerListCommands(program, ctx);
  // Must run after registerListCommands so it attaches to the existing `agents` group.
  registerAuthoringAgentCommands(program, ctx);
  registerVersioningCommands(program, ctx);
  registerBudgetCommands(program, ctx);
  registerSkillsCommands(program, ctx);
  registerLearnCommands(program, ctx);
  registerDoctorCommand(program, ctx);

  // Default action: setup wizard via --setup, otherwise the interactive UI.
  program.action(async (opts: RootOptions) => {
    if (program.args.length > 0) {
      ctx.stderr.write(`error: unknown command '${program.args[0]}'\n`);
      ctx.stderr.write("Run `ultracode --help` for a list of commands.\n");
      process.exitCode = 1;
      return;
    }
    if (opts.setup) {
      await runSetup(ctx);
      return;
    }
    if (ctx.stdout.isTTY !== true || ctx.stdin.isTTY !== true) {
      ctx.stdout.write(
        'No interactive terminal detected. Use `ultracode run -p "<prompt>"` for one-shot runs.\n\n',
      );
      ctx.stdout.write(program.helpInformation());
      process.exitCode = 1;
      return;
    }
    // Ink/React are only loaded when the interactive UI actually starts.
    const { startInteractive } = await import("./ui/start.js");
    await startInteractive(ctx);
  });

  return program;
}

/**
 * Parse and execute an argv (node-style: `[node, script, ...args]`).
 *
 * @returns the process exit code (also assigned to `process.exitCode`).
 */
export async function runCli(argv: readonly string[], ctx?: CliContext): Promise<number> {
  const context = ctx ?? createDefaultContext();
  const debug = argv.includes("--debug");
  const program = createProgram(context);
  try {
    await program.parseAsync([...argv]);
    const code = typeof process.exitCode === "number" ? process.exitCode : 0;
    return code;
  } catch (err) {
    if (err instanceof CommanderError) {
      // --help/--version and usage errors; commander already wrote the output.
      const code =
        err.code === "commander.helpDisplayed" || err.code === "commander.version"
          ? 0
          : (err.exitCode ?? 1);
      process.exitCode = code;
      return code;
    }
    const colored = context.stderr.isTTY === true;
    if (err instanceof UltraCodeError) {
      context.stderr.write(paint(`✗ ${err.code}: ${err.message}\n`, "31", colored));
      if (debug && err.stack !== undefined) context.stderr.write(`${err.stack}\n`);
      process.exitCode = 1;
      return 1;
    }
    const message = err instanceof Error ? err.message : String(err);
    context.stderr.write(paint(`✗ Unexpected error: ${message}\n`, "31", colored));
    if (debug && err instanceof Error && err.stack !== undefined) {
      context.stderr.write(`${err.stack}\n`);
    } else {
      context.stderr.write("Run again with --debug for a stack trace.\n");
    }
    process.exitCode = 1;
    return 1;
  }
}
