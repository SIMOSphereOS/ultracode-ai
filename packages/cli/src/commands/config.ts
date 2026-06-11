/**
 * `ultracode config show|get|set|validate|export|import`
 *
 * Configuration inspection and modification through the UltraCode facade.
 * Mutating subcommands (`set`, `import`) require the optional `configManager`
 * exposed by the facade (ConfigManager semantics: `set(path, value)` +
 * `save("user")`); without it they fail with a clear {@link ConfigError}.
 * `show` prefers core's redacted view and falls back to a local key-masking
 * redaction so secrets are never printed.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import type { Command } from "commander";
import { ConfigError, isPlainObject } from "@ultracode/shared";
import type { CliContext, UltraCodeFacade } from "../context.js";
import { safeDispose } from "../context.js";
import { flattenLeaves, getAtPath, parseCliValue, redactConfig } from "../utils/text.js";

interface JsonOption {
  json?: boolean;
}

/** Run `fn` against a fresh facade, always disposing it afterwards. */
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

function requireManager(facade: UltraCodeFacade): NonNullable<UltraCodeFacade["configManager"]> {
  const manager = facade.configManager;
  if (!manager || typeof manager.set !== "function" || typeof manager.save !== "function") {
    throw new ConfigError(
      "Modifying configuration requires the ConfigManager, which this build of @ultracode/core does not expose. " +
        "Edit ~/.ultracode/config.toml manually instead.",
    );
  }
  return manager;
}

function redactedView(facade: UltraCodeFacade): unknown {
  const manager = facade.configManager;
  if (manager && typeof manager.redacted === "function") return manager.redacted();
  return redactConfig(facade.config);
}

/** Register the `config` command group on `program`. */
export function registerConfigCommand(program: Command, ctx: CliContext): void {
  const config = program.command("config").description("inspect and modify the configuration");

  config
    .command("show")
    .description("print the resolved configuration (secrets masked)")
    .option("--json", "output as JSON")
    .action(async (opts: JsonOption) =>
      withFacade(ctx, async (facade) => {
        const view = redactedView(facade);
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify(view)}\n`);
          return;
        }
        const flat = isPlainObject(view)
          ? flattenLeaves(view as Record<string, unknown>)
          : ([["config", view]] as Array<[string, unknown]>);
        for (const [key, value] of flat) {
          ctx.stdout.write(`${key} = ${JSON.stringify(value)}\n`);
        }
      }),
    );

  config
    .command("get")
    .description("print a single configuration value by dotted path")
    .argument("<path>", 'dotted config path, e.g. "core.activeModel"')
    .option("--json", "output as JSON ({ path, value })")
    .action(async (dotted: string, opts: JsonOption) =>
      withFacade(ctx, async (facade) => {
        const manager = facade.configManager;
        const value =
          manager && typeof manager.get === "function"
            ? manager.get(dotted)
            : getAtPath(facade.config, dotted);
        if (value === undefined) {
          throw new ConfigError(`Unknown config path: "${dotted}"`);
        }
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify({ path: dotted, value })}\n`);
        } else {
          ctx.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`);
        }
      }),
    );

  config
    .command("set")
    .description("set a configuration value and persist it to the user layer")
    .argument("<path>", 'dotted config path, e.g. "ui.theme"')
    .argument("<value>", "new value (JSON literals are parsed, otherwise string)")
    .action(async (dotted: string, raw: string) =>
      withFacade(ctx, async (facade) => {
        const manager = requireManager(facade);
        const value = parseCliValue(raw);
        manager.set(dotted, value);
        await manager.save("user");
        ctx.stdout.write(`✓ ${dotted} = ${JSON.stringify(value)} (saved to user config)\n`);
      }),
    );

  config
    .command("validate")
    .description("validate the resolved configuration")
    .action(async () =>
      withFacade(ctx, async (facade) => {
        const manager = facade.configManager;
        if (manager && typeof manager.validate === "function") manager.validate();
        ctx.stdout.write("✓ configuration is valid\n");
      }),
    );

  config
    .command("export")
    .description("export the resolved configuration as JSON (stdout or file)")
    .argument("[file]", "target file; prints to stdout when omitted")
    .action(async (file?: string) =>
      withFacade(ctx, async (facade) => {
        const json = JSON.stringify(facade.config, null, 2);
        if (file === undefined) {
          ctx.stdout.write(`${json}\n`);
          return;
        }
        const target = path.resolve(ctx.cwd, file);
        await fs.writeFile(target, `${json}\n`, "utf8");
        ctx.stdout.write(`✓ configuration exported to ${target}\n`);
      }),
    );

  config
    .command("import")
    .description("import configuration overrides from a JSON file into the user layer")
    .argument("<file>", "JSON file produced by `config export` (or compatible)")
    .action(async (file: string) =>
      withFacade(ctx, async (facade) => {
        const manager = requireManager(facade);
        const target = path.resolve(ctx.cwd, file);
        let raw: string;
        try {
          raw = await fs.readFile(target, "utf8");
        } catch (cause) {
          throw new ConfigError(`Cannot read config file: ${target}`, { cause });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
        } catch (cause) {
          throw new ConfigError(`Invalid JSON in config file: ${target}`, { cause });
        }
        if (!isPlainObject(parsed)) {
          throw new ConfigError(`Config file must contain a JSON object: ${target}`);
        }
        const leaves = flattenLeaves(parsed as Record<string, unknown>);
        for (const [key, value] of leaves) {
          manager.set(key, value);
        }
        await manager.save("user");
        ctx.stdout.write(`✓ imported ${leaves.length} value(s) from ${target} (saved to user config)\n`);
      }),
    );
}
