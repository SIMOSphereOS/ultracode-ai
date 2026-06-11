/**
 * `@ultracode/shared` — the contract layer.
 *
 * This package defines the types, interfaces, errors, events and utilities that
 * the `core` and `cli` packages build against. It contains no business logic
 * beyond small, pure runtime helpers (errors, EventBus, logger, utils).
 *
 * Import everything from the package root:
 * ```ts
 * import { UltraCodeError, EventBus, deepMerge, type ToolDefinition } from "@ultracode/shared";
 * ```
 */

/* ----------------------------------------------------------------------------
 * Errors (runtime classes + types)
 * ------------------------------------------------------------------------- */
export {
  UltraCodeError,
  ConfigError,
  ProviderError,
  ToolError,
  ToolPermissionDeniedError,
  ToolTimeoutError,
  ToolNotFoundError,
  AgentError,
  SessionError,
  VersioningError,
  ValidationError,
} from "./errors.js";
export type {
  SerializedError,
  UltraCodeErrorOptions,
  ProviderErrorOptions,
  ToolErrorOptions,
} from "./errors.js";

/* ----------------------------------------------------------------------------
 * Logging (runtime classes + types)
 * ------------------------------------------------------------------------- */
export { ConsoleLogger, NoopLogger } from "./logger.js";
export type {
  Logger,
  LogLevel,
  LogMeta,
  LogSink,
  ConsoleLoggerOptions,
} from "./logger.js";

/* ----------------------------------------------------------------------------
 * Tool contracts
 * ------------------------------------------------------------------------- */
export type {
  ToolPermission,
  ToolCategory,
  ToolParameterSchema,
  ToolDefinition,
  ToolContext,
  ToolResult,
  ITool,
} from "./types/tool.js";

/* ----------------------------------------------------------------------------
 * Provider contracts
 * ------------------------------------------------------------------------- */
export type {
  ProviderName,
  ProviderId,
  ChatRole,
  ChatMessage,
  ToolCallRequest,
  CompletionRequest,
  CompletionChunk,
  CompletionResult,
  FinishReason,
  TokenUsage,
  ILLMProvider,
  ProviderOptions,
} from "./types/provider.js";

/* ----------------------------------------------------------------------------
 * Agent contracts
 * ------------------------------------------------------------------------- */
export type {
  AgentType,
  AgentDefinition,
  AgentRunInput,
  AgentRunResult,
  IAgent,
} from "./types/agent.js";

/* ----------------------------------------------------------------------------
 * Configuration (types + DEFAULT_CONFIG value)
 * ------------------------------------------------------------------------- */
export { DEFAULT_CONFIG } from "./types/config.js";
export type {
  DeepPartial,
  CoreConfig,
  ProxyConfig,
  LocalProviderConfig,
  ProvidersConfig,
  PerToolConfig,
  ToolsConfig,
  AgentConfigEntry,
  AgentsConfig,
  UiColors,
  UiConfig,
  SessionCompactionConfig,
  SessionsConfig,
  GitCommitConfig,
  GitProtectionConfig,
  GitConfig,
  VersioningSemanticConfig,
  VersioningChannelsConfig,
  VersioningQualityConfig,
  VersioningChangelogConfig,
  VersioningConfig,
  McpTransport,
  McpServerConfig,
  UltraCodeConfig,
} from "./types/config.js";

/* ----------------------------------------------------------------------------
 * Memory / sessions
 * ------------------------------------------------------------------------- */
export type {
  SessionMeta,
  SessionRecord,
  ISessionStore,
} from "./types/memory.js";

/* ----------------------------------------------------------------------------
 * Versioning
 * ------------------------------------------------------------------------- */
export type {
  BumpType,
  FileChange,
  CommitInfo,
  BreakingChange,
  SecurityFinding,
  ChangeAnalysis,
  VersionSuggestion,
  Milestone,
  Risk,
  ReleasePlan,
  QualityGateResult,
  QualityReport,
} from "./types/versioning.js";

/* ----------------------------------------------------------------------------
 * Events (types + EventBus value)
 * ------------------------------------------------------------------------- */
export type {
  ToolExecutedEvent,
  AgentSwitchedEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  ErrorEvent,
  VersionSuggestedEvent,
  UltraCodeEvent,
  UltraCodeEventType,
  EventOfType,
  EventHandler,
  IEventBus,
} from "./types/events.js";
export { EventBus } from "./events/EventBus.js";
export type { EventBusOptions } from "./events/EventBus.js";

/* ----------------------------------------------------------------------------
 * Utilities (runtime functions)
 * ------------------------------------------------------------------------- */
export {
  serializeError,
  truncate,
  DEFAULT_TRUNCATE_SUFFIX,
  isPlainObject,
  deepMerge,
  sleep,
  clamp,
  generateId,
} from "./utils/index.js";
export type { TruncateOptions } from "./utils/index.js";

/* ----------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */
export {
  VERSION,
  CONFIG_FILE_NAMES,
  USER_CONFIG_DIR,
  USER_CONFIG_FILE,
  USER_ENV_FILE,
  ENV_PREFIX,
  DEFAULT_SESSION_DIR,
  PROMPTS_DIR,
  MAX_TOOL_OUTPUT_CHARS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_CHANGELOG_FILE,
} from "./constants.js";
