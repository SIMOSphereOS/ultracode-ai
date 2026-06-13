/**
 * `core/tools` — the UltraCode tool system.
 *
 * Public surface:
 * - {@link createToolSystem} (factory contract)
 * - {@link ToolRegistry}, {@link ToolExecutor}, {@link ToolQueue}
 * - {@link PathGuard} / {@link resolvePath} (sandbox path validation)
 * - All built-in tools.
 */

export { createToolSystem } from "./createToolSystem.js";
export type { ToolSystem } from "./createToolSystem.js";

export { ToolRegistry } from "./ToolRegistry.js";
export type { AnyTool } from "./ToolRegistry.js";

export { ToolExecutor, DEFAULT_TOOL_TIMEOUT_SECONDS } from "./ToolExecutor.js";

export { ToolQueue, DEFAULT_MAX_CONCURRENT } from "./ToolQueue.js";
export type { ToolQueueItem, ToolQueueOptions } from "./ToolQueue.js";

export { PathGuard, resolvePath, resolveHome, isPathInside } from "./PathGuard.js";
export type { ResolvePathOptions } from "./PathGuard.js";

export { sanitizeEnv, isSecretEnvKey } from "./sanitizeEnv.js";

export { DEFAULT_PROTECTED_EXTENSIONS, DEFAULT_READ_DENY } from "./defaults.js";

export { BaseTool } from "./BaseTool.js";
export type { ToolRunOutcome } from "./BaseTool.js";

export { ReadTool, DEFAULT_MAX_READ_BYTES } from "./builtin/ReadTool.js";
export type { ReadToolOptions, ReadToolOutput } from "./builtin/ReadTool.js";

export { WriteFileTool } from "./builtin/WriteFileTool.js";
export type { WriteFileToolOptions, WriteFileToolOutput } from "./builtin/WriteFileTool.js";

export { EditTool } from "./builtin/EditTool.js";
export type { EditToolOptions, EditToolOutput } from "./builtin/EditTool.js";

export { DeleteFileTool } from "./builtin/DeleteFileTool.js";
export type { DeleteFileToolOptions, DeleteFileToolOutput } from "./builtin/DeleteFileTool.js";

export { GrepTool, DEFAULT_MAX_MATCHES } from "./builtin/GrepTool.js";
export type { GrepToolOptions, GrepToolOutput, GrepMatch } from "./builtin/GrepTool.js";

export { GlobTool, DEFAULT_MAX_GLOB_RESULTS } from "./builtin/GlobTool.js";
export type { GlobToolOptions, GlobToolOutput } from "./builtin/GlobTool.js";

export {
  compileGlob,
  matchGlob,
  globToRegExp,
  expandBraces,
  MAX_BRACE_EXPANSIONS,
} from "./builtin/globMatch.js";
export type { GlobMatcher } from "./builtin/globMatch.js";

export { BashTool } from "./builtin/BashTool.js";
export type { BashToolOptions, BashToolOutput } from "./builtin/BashTool.js";

export { GitStatusTool, GitDiffTool, GitLogTool } from "./builtin/GitTools.js";
export type {
  GitToolOptions,
  GitStatusOutput,
  GitStatusEntry,
  GitDiffOutput,
  GitLogOutput,
  GitLogCommit,
} from "./builtin/GitTools.js";

export { ProjectStatusTool, DependenciesTool } from "./builtin/ProjectTools.js";
export type {
  ProjectToolOptions,
  ProjectStatusOutput,
  DependenciesOutput,
  ManifestSummary,
  ManifestKind,
  DependencyEntry,
} from "./builtin/ProjectTools.js";

export { TodoTool } from "./builtin/TodoTool.js";
export type { TodoToolOutput, TodoItem, TodoStatus } from "./builtin/TodoTool.js";

export { walkFiles, DEFAULT_IGNORED_DIRS } from "./builtin/walk.js";
export type { WalkOptions } from "./builtin/walk.js";
