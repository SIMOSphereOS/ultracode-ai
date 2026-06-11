/**
 * `ultracode run -p/--print <prompt> [--agent <name>] [--json]`
 *
 * Single non-interactive agent run. Text chunks are streamed to stdout as
 * they arrive; with `--json` the final {@link AgentRunResult} is printed as a
 * single machine-readable JSON line instead. Errors propagate to the global
 * handler (exit code 1).
 */

import type { Command } from "commander";
import type { CompletionChunk } from "@ultracode/shared";
import type { CliContext } from "../context.js";
import { safeDispose } from "../context.js";

interface RunCommandOptions {
  print: string;
  agent?: string;
  json?: boolean;
}

/** Register the `run` command on `program`. */
export function registerRunCommand(program: Command, ctx: CliContext): void {
  program
    .command("run")
    .description("run a single prompt non-interactively and print the result")
    .requiredOption("-p, --print <prompt>", "prompt to run")
    .option("-a, --agent <name>", "agent to use for this run")
    .option("--json", "print the full run result as JSON instead of streaming text")
    .action(async (opts: RunCommandOptions) => {
      const facade = await ctx.createFacade({ cwd: ctx.cwd });
      try {
        if (opts.json) {
          const result = await facade.run(opts.print, { agent: opts.agent });
          ctx.stdout.write(`${JSON.stringify(result)}\n`);
          return;
        }
        let streamed = false;
        const result = await facade.run(opts.print, {
          agent: opts.agent,
          onChunk: (chunk: CompletionChunk) => {
            if (chunk.type === "text" && typeof chunk.text === "string" && chunk.text !== "") {
              streamed = true;
              ctx.stdout.write(chunk.text);
            }
          },
        });
        // Providers that do not stream still produce a final text.
        if (!streamed && result.text !== "") ctx.stdout.write(result.text);
        ctx.stdout.write("\n");
      } finally {
        await safeDispose(facade);
      }
    });
}
