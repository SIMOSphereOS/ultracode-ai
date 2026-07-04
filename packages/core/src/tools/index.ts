/**
 * `core/tools` — the UltraCode tool system.
 *
 * Public surface:
 * - {@link createToolSystem} (factory contract)
 * - {@link ToolRegistry}, {@link ToolExecutor}, {@link ToolQueue}
 * - {@link PathGuard} / {@link resolvePath} (sandbox path validation)
 * - All built-in tools.
 */

export type { ToolRunOutcome } from "./BaseTool.js";
export { BaseTool } from "./BaseTool.js";
export type { BashToolOptions, BashToolOutput } from "./builtin/BashTool.js";
export { BashTool } from "./builtin/BashTool.js";
export type { DeleteFileToolOptions, DeleteFileToolOutput } from "./builtin/DeleteFileTool.js";
export { DeleteFileTool } from "./builtin/DeleteFileTool.js";
export type { EditToolOptions, EditToolOutput } from "./builtin/EditTool.js";
export { EditTool } from "./builtin/EditTool.js";
export type {
  GitDiffOutput,
  GitLogCommit,
  GitLogOutput,
  GitStatusEntry,
  GitStatusOutput,
  GitToolOptions,
} from "./builtin/GitTools.js";
export { GitDiffTool, GitLogTool, GitStatusTool } from "./builtin/GitTools.js";
export type { GlobToolOptions, GlobToolOutput } from "./builtin/GlobTool.js";
export { DEFAULT_MAX_GLOB_RESULTS, GlobTool } from "./builtin/GlobTool.js";
export type { GrepMatch, GrepToolOptions, GrepToolOutput } from "./builtin/GrepTool.js";
export { DEFAULT_MAX_MATCHES, GrepTool } from "./builtin/GrepTool.js";
export type { GlobMatcher } from "./builtin/globMatch.js";
export {
  compileGlob,
  expandBraces,
  globToRegExp,
  MAX_BRACE_EXPANSIONS,
  matchGlob,
} from "./builtin/globMatch.js";
export type {
  LspDiagnosticsOutput,
  LspDiagnosticsSummary,
  LspDiagnosticsToolOptions,
  LspDiagnosticView,
} from "./builtin/LspDiagnosticsTool.js";
export { LspDiagnosticsTool, matchLspServer } from "./builtin/LspDiagnosticsTool.js";
export type {
  DependenciesOutput,
  DependencyEntry,
  ManifestKind,
  ManifestSummary,
  ProjectStatusOutput,
  ProjectToolOptions,
} from "./builtin/ProjectTools.js";
export { DependenciesTool, ProjectStatusTool } from "./builtin/ProjectTools.js";
export type { ReadToolOptions, ReadToolOutput } from "./builtin/ReadTool.js";
export { DEFAULT_MAX_READ_BYTES, ReadTool } from "./builtin/ReadTool.js";
export type { TodoItem, TodoStatus, TodoToolOutput } from "./builtin/TodoTool.js";
export { TodoTool } from "./builtin/TodoTool.js";
export type { WriteFileToolOptions, WriteFileToolOutput } from "./builtin/WriteFileTool.js";
export { WriteFileTool } from "./builtin/WriteFileTool.js";
export type { WalkOptions } from "./builtin/walk.js";
export { DEFAULT_IGNORED_DIRS, walkFiles } from "./builtin/walk.js";
export type { ToolSystem } from "./createToolSystem.js";
export { createToolSystem } from "./createToolSystem.js";
export { DEFAULT_PROTECTED_EXTENSIONS, DEFAULT_READ_DENY } from "./defaults.js";
export type { ResolvePathOptions } from "./PathGuard.js";
export { isPathInside, PathGuard, resolveHome, resolvePath } from "./PathGuard.js";
export { isSecretEnvKey, sanitizeEnv } from "./sanitizeEnv.js";
export { DEFAULT_TOOL_TIMEOUT_SECONDS, ToolExecutor } from "./ToolExecutor.js";
export type { ToolQueueItem, ToolQueueOptions } from "./ToolQueue.js";
export { DEFAULT_MAX_CONCURRENT, ToolQueue } from "./ToolQueue.js";
export type { AnyTool } from "./ToolRegistry.js";
export { ToolRegistry } from "./ToolRegistry.js";
