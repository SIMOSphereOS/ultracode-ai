/**
 * `ultracode tools list [--json]` and `ultracode agents list [--json]`.
 *
 * Tabular listings of the registered tools and agents (name, category/type,
 * description, permission/model). `--json` emits the raw definition arrays.
 */

import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { safeDispose } from "../context.js";
import { formatTable } from "../utils/text.js";

interface JsonOption {
  json?: boolean;
}

/** Register the `tools` and `agents` command groups on `program`. */
export function registerListCommands(program: Command, ctx: CliContext): void {
  const tools = program.command("tools").description("inspect the tool registry");
  tools
    .command("list")
    .description("list all registered tools")
    .option("--json", "output as JSON")
    .action(async (opts: JsonOption) => {
      const facade = await ctx.createFacade({ cwd: ctx.cwd });
      try {
        const defs = facade.listTools();
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify(defs)}\n`);
          return;
        }
        if (defs.length === 0) {
          ctx.stdout.write("(no tools registered)\n");
          return;
        }
        ctx.stdout.write(
          formatTable(
            ["Name", "Category", "Permission", "Description"],
            defs.map((d) => [d.name, d.category, d.permission, d.description]),
          ),
        );
      } finally {
        await safeDispose(facade);
      }
    });

  const agents = program.command("agents").description("inspect the agent registry");
  agents
    .command("list")
    .description("list all available agents")
    .option("--json", "output as JSON")
    .action(async (opts: JsonOption) => {
      const facade = await ctx.createFacade({ cwd: ctx.cwd });
      try {
        const defs = facade.listAgents();
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify(defs)}\n`);
          return;
        }
        if (defs.length === 0) {
          ctx.stdout.write("(no agents available)\n");
          return;
        }
        ctx.stdout.write(
          formatTable(
            ["Name", "Type", "Model", "Description"],
            defs.map((d) => [d.name, d.type, d.model ?? "(active model)", d.description]),
          ),
        );
      } finally {
        await safeDispose(facade);
      }
    });
}
