/**
 * `createToolSystem` — module factory (monorepo factory contract).
 *
 * Builds a {@link ToolRegistry} populated with all built-in tools (configured
 * from `config.tools.perTool`) plus a {@link ToolExecutor} bound to the same
 * configuration, logger and optional event bus.
 */

import type { IEventBus, Logger, PerToolConfig, UltraCodeConfig } from "@ultracode/shared";
import { ToolRegistry } from "./ToolRegistry.js";
import { ToolExecutor } from "./ToolExecutor.js";
import { ReadTool } from "./builtin/ReadTool.js";
import { WriteFileTool } from "./builtin/WriteFileTool.js";
import { EditTool } from "./builtin/EditTool.js";
import { DeleteFileTool } from "./builtin/DeleteFileTool.js";
import { GrepTool } from "./builtin/GrepTool.js";
import { GlobTool } from "./builtin/GlobTool.js";
import { BashTool } from "./builtin/BashTool.js";
import { GitDiffTool, GitLogTool, GitStatusTool } from "./builtin/GitTools.js";
import { DependenciesTool, ProjectStatusTool } from "./builtin/ProjectTools.js";
import { TodoTool } from "./builtin/TodoTool.js";

/** The assembled tool system. */
export interface ToolSystem {
  /** Registry containing all built-in tools. */
  registry: ToolRegistry;
  /** Executor bound to the registry, config, logger and event bus. */
  executor: ToolExecutor;
}

/** Read a string-array option from a per-tool config entry. */
function stringArrayOption(entry: PerToolConfig | undefined, key: string): string[] | undefined {
  const value = entry?.[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

/** Read a positive-number option from a per-tool config entry. */
function numberOption(entry: PerToolConfig | undefined, key: string): number | undefined {
  const value = entry?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Create the tool system: a registry with all built-in tools and an executor.
 *
 * Per-tool configuration (`tools.perTool`) is applied at construction time:
 * `allowedDirs`, `protectedExtensions`, `maxMatches`, `maxFileBytes`, … .
 * Permissions and timeouts are applied per execution by the executor.
 *
 * @param config - resolved UltraCode configuration.
 * @param logger - structured logger.
 * @param events - optional event bus receiving `tool.executed` events.
 */
export function createToolSystem(
  config: UltraCodeConfig,
  logger: Logger,
  events?: IEventBus,
): ToolSystem {
  const registry = new ToolRegistry();
  const perTool = config.tools.perTool;
  const dirs = (name: string): string[] | undefined =>
    stringArrayOption(perTool[name], "allowedDirs");

  registry.register(
    new ReadTool({
      allowedDirs: dirs("read"),
      maxFileBytes: numberOption(perTool["read"], "maxFileBytes"),
    }),
  );
  registry.register(
    new WriteFileTool({
      allowedDirs: dirs("write_file"),
      protectedExtensions: stringArrayOption(perTool["write_file"], "protectedExtensions"),
    }),
  );
  registry.register(new EditTool({ allowedDirs: dirs("edit") }));
  registry.register(new DeleteFileTool({ allowedDirs: dirs("delete_file") }));
  registry.register(
    new GrepTool({
      allowedDirs: dirs("grep"),
      maxMatches: numberOption(perTool["grep"], "maxMatches"),
    }),
  );
  registry.register(
    new GlobTool({
      allowedDirs: dirs("glob"),
      maxResults: numberOption(perTool["glob"], "maxMatches"),
    }),
  );
  registry.register(new BashTool({ allowedDirs: dirs("bash") }));
  registry.register(new GitStatusTool());
  registry.register(new GitDiffTool());
  registry.register(new GitLogTool());
  registry.register(new ProjectStatusTool({ allowedDirs: dirs("project_status") }));
  registry.register(new DependenciesTool({ allowedDirs: dirs("dependencies") }));
  registry.register(new TodoTool());

  logger.debug("tool system created", { tools: registry.list().map((d) => d.name) });

  const executor = new ToolExecutor(registry, config, logger, events);
  return { registry, executor };
}
