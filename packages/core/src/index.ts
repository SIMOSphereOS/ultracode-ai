/**
 * `@ultracode/core` — package root barrel.
 *
 * Re-exports the high-level {@link UltraCode} facade together with the public
 * factory contracts and key types of every core module (config, providers,
 * tools, memory, context, execution, agents, versioning). This is the single
 * entry point the CLI and embedders import from.
 */

/* ----------------------------- Facade ----------------------------------- */
export { UltraCode } from "./UltraCode.js";
export type {
  UltraCodeParts,
  UltraCodeCreateOptions,
  UltraCodeRunOptions,
  VersioningFacade,
} from "./UltraCode.js";

/* ----------------------------- Config ----------------------------------- */
export {
  loadConfig,
  ConfigManager,
  resolveHome,
  userConfigFile,
  userEnvFile,
  profileFile,
  projectConfigCandidates,
  atomicWriteFile,
  parseDotEnv,
  envToOverlay,
  parseTomlSource,
  tomlToOverlay,
  configToToml,
  configSchema,
  validateConfig,
  checkConfig,
  KNOWN_THEMES,
  camelizeKey,
  snakeifyKey,
  CONFIG_SPEC,
} from "./config/index.js";
export type {
  ConfigManagerOptions,
  ConfigScope,
  ConfigOverlay,
  WarnFn,
  ResolvedUltraCodeConfig,
  ProvidersRuntimeConfig,
} from "./config/index.js";

/* ---------------------------- Providers --------------------------------- */
export {
  createProvider,
  BaseProvider,
  parseRetryAfter,
  isRetryableStatus,
  MistralProvider,
  MISTRAL_BASE_URL,
  OpenAIProvider,
  OPENAI_BASE_URL,
  AnthropicProvider,
  ANTHROPIC_BASE_URL,
  ANTHROPIC_VERSION,
  toAnthropicMessages,
  toAnthropicTools,
  mapAnthropicStopReason,
  LocalProvider,
  OLLAMA_BASE_URL,
  OpenAICompatProvider,
  OpenAIToolCallAssembler,
  toOpenAIMessages,
  toOpenAITools,
  mapOpenAIFinishReason,
  safeParseArgs,
  streamLines,
  parseSSEEvents,
  parseSSEJson,
  parseNDJSON,
} from "./providers/index.js";
export type {
  CreateProviderOptions,
  ProviderRequestInit,
  SSEEvent,
  SSEJsonEvent,
} from "./providers/index.js";

/* ------------------------------ Tools ----------------------------------- */
export {
  createToolSystem,
  ToolRegistry,
  ToolExecutor,
  DEFAULT_TOOL_TIMEOUT_SECONDS,
  ToolQueue,
  DEFAULT_MAX_CONCURRENT,
  PathGuard,
  resolvePath,
  isPathInside,
  BaseTool,
  ReadTool,
  DEFAULT_MAX_READ_BYTES,
  WriteFileTool,
  EditTool,
  DeleteFileTool,
  GrepTool,
  DEFAULT_MAX_MATCHES,
  GlobTool,
  DEFAULT_MAX_GLOB_RESULTS,
  compileGlob,
  matchGlob,
  globToRegExp,
  expandBraces,
  MAX_BRACE_EXPANSIONS,
  BashTool,
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  ProjectStatusTool,
  DependenciesTool,
  TodoTool,
  walkFiles,
  DEFAULT_IGNORED_DIRS,
} from "./tools/index.js";
export type {
  ToolSystem,
  AnyTool,
  ToolQueueItem,
  ToolQueueOptions,
  ResolvePathOptions,
  ToolRunOutcome,
  ReadToolOptions,
  ReadToolOutput,
  WriteFileToolOptions,
  WriteFileToolOutput,
  EditToolOptions,
  EditToolOutput,
  DeleteFileToolOptions,
  DeleteFileToolOutput,
  GrepToolOptions,
  GrepToolOutput,
  GrepMatch,
  GlobToolOptions,
  GlobToolOutput,
  GlobMatcher,
  BashToolOptions,
  BashToolOutput,
  GitToolOptions,
  GitStatusOutput,
  GitStatusEntry,
  GitDiffOutput,
  GitLogOutput,
  GitLogCommit,
  ProjectToolOptions,
  ProjectStatusOutput,
  DependenciesOutput,
  ManifestSummary,
  ManifestKind,
  DependencyEntry,
  TodoToolOutput,
  TodoItem,
  TodoStatus,
  WalkOptions,
} from "./tools/index.js";

/* ------------------------------ Memory ---------------------------------- */
export {
  createSessionStore,
  SESSION_DB_FILENAME,
  InMemorySessionStore,
  JsonSessionStore,
  SqliteSessionStore,
  defaultSqliteLoader,
  MetadataCache,
} from "./memory/index.js";
export type {
  CreateSessionStoreInternals,
  SqliteLoader,
  SqliteModuleLike,
  SqliteDatabaseLike,
  SqliteStatementLike,
  MetadataCacheOptions,
} from "./memory/index.js";

/* ------------------------------ Context --------------------------------- */
export {
  ContextCollector,
  DEFAULT_IGNORE,
  ContextCompressor,
  CONTEXT_HEADER,
  cutAtWordBoundary,
  ContextEngine,
  createContextEngine,
} from "./context/index.js";
export type {
  ContextSection,
  ContextCollectorOptions,
  GitRunner as ContextGitRunner,
  GitRunResult,
  CompressOptions,
  ContextCollectRequest,
  ContextEngineDeps,
} from "./context/index.js";

/* ---------------------------- Execution --------------------------------- */
export {
  ExecutionEngine,
  DEFAULT_MAX_TURNS,
  isAbortError,
  QueryPipeline,
} from "./execution/index.js";
export type {
  ExecutionEngineOptions,
  ExecutionRunInput,
  ExecutionRunResult,
  ParsedQuery,
  QueryExecutor,
  QueryPipelineOptions,
  QueryPipelineResult,
  IToolRunner,
} from "./execution/index.js";

/* ------------------------------ Agents ---------------------------------- */
export {
  createAgentManager,
  AgentManager,
  MAX_DELEGATION_DEPTH,
  DEFAULT_MAX_CONCURRENT_DELEGATIONS,
  BaseAgent,
  BUILT_IN_AGENTS,
  SYSTEM_PROMPTS,
  DEFAULT_SYSTEM_PROMPT,
  BUILD_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  RELEASE_SYSTEM_PROMPT,
  SECURITY_SYSTEM_PROMPT,
  matchesToolPattern,
  toolPredicateFor,
  resolveEffectiveTools,
  FilteredToolRunner,
} from "./agents/index.js";
export type {
  AgentManagerOptions,
  DelegateOptions,
  BaseAgentOptions,
  BaseAgentRunInput,
  ContextCollector as AgentContextCollector,
} from "./agents/index.js";

/* ---------------------------- Versioning -------------------------------- */
export {
  createVersioningSystem,
  GitClient,
  defaultGitRunner,
  ChangeAnalysisEngine,
  extractExportedNames,
  VersionRecommender,
  ReleasePlanningEngine,
  QualityGateSystem,
  defaultCommandRunner,
  parseConventionalSubject,
  hasBreakingFooter,
  SECURITY_RULES,
  scanFileForFindings,
  isTestFile,
  dampenSeverity,
} from "./versioning/index.js";
export type {
  VersioningSystem,
  VersioningSystemOptions,
  SystemSuggestOptions,
  GitClientOptions,
  GitCommandResult,
  GitRunner as VersioningGitRunner,
  GitRunnerOptions,
  ChangeAnalysisEngineOptions,
  SuggestOptions,
  VersionRecommenderOptions,
  PlanOptions,
  ReleasePlanningEngineOptions,
  CommandResult,
  CommandRunner,
  QualityCheckInput,
  QualityGateSystemOptions,
  TestCommand,
  ParsedConventionalSubject,
  SecurityRule,
  SecuritySeverity,
} from "./versioning/index.js";
