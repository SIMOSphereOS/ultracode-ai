/**
 * `ultracode-shared` — the contract layer.
 *
 * This package defines the types, interfaces, errors, events and utilities that
 * the `core` and `cli` packages build against. It contains no business logic
 * beyond small, pure runtime helpers (errors, EventBus, logger, utils).
 *
 * Import everything from the package root:
 * ```ts
 * import { UltraCodeError, EventBus, deepMerge, type ToolDefinition } from "ultracode-shared";
 * ```
 */

/* ----------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */
export {
  CONFIG_FILE_NAMES,
  DEFAULT_CHANGELOG_FILE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_SESSION_DIR,
  ENV_PREFIX,
  MAX_TOOL_OUTPUT_CHARS,
  PROMPTS_DIR,
  USER_CONFIG_DIR,
  USER_CONFIG_FILE,
  USER_ENV_FILE,
  VERSION,
} from "./constants.js";
export type {
  ProviderErrorOptions,
  SerializedError,
  ToolErrorOptions,
  UltraCodeErrorOptions,
} from "./errors.js";
/* ----------------------------------------------------------------------------
 * Errors (runtime classes + types)
 * ------------------------------------------------------------------------- */
export {
  AgentError,
  ConfigError,
  ProviderError,
  SessionError,
  ToolError,
  ToolNotFoundError,
  ToolPermissionDeniedError,
  ToolTimeoutError,
  UltraCodeError,
  ValidationError,
  VersioningError,
} from "./errors.js";
export type { EventBusOptions } from "./events/EventBus.js";
export { EventBus } from "./events/EventBus.js";
export type {
  ConsoleLoggerOptions,
  Logger,
  LogLevel,
  LogMeta,
  LogSink,
} from "./logger.js";
/* ----------------------------------------------------------------------------
 * Logging (runtime classes + types)
 * ------------------------------------------------------------------------- */
export { ConsoleLogger, NoopLogger } from "./logger.js";
/* ----------------------------------------------------------------------------
 * Agent contracts
 * ------------------------------------------------------------------------- */
export type {
  AgentDefinition,
  AgentRunInput,
  AgentRunResult,
  AgentType,
  IAgent,
} from "./types/agent.js";
export type {
  AgentConfigEntry,
  AgentsConfig,
  CoreConfig,
  DeepPartial,
  GitCommitConfig,
  GitConfig,
  GitProtectionConfig,
  LocalProviderConfig,
  McpServerConfig,
  McpTransport,
  PerToolConfig,
  ProvidersConfig,
  ProxyConfig,
  SessionCompactionConfig,
  SessionsConfig,
  ToolsConfig,
  UiColors,
  UiConfig,
  UltraCodeConfig,
  VersioningChangelogConfig,
  VersioningChannelsConfig,
  VersioningConfig,
  VersioningQualityConfig,
  VersioningSemanticConfig,
} from "./types/config.js";
/* ----------------------------------------------------------------------------
 * Configuration (types + DEFAULT_CONFIG value)
 * ------------------------------------------------------------------------- */
export { DEFAULT_CONFIG } from "./types/config.js";
/* ----------------------------------------------------------------------------
 * Events (types + EventBus value)
 * ------------------------------------------------------------------------- */
export type {
  AgentSwitchedEvent,
  ErrorEvent,
  EventHandler,
  EventOfType,
  IEventBus,
  SessionEndedEvent,
  SessionStartedEvent,
  ToolExecutedEvent,
  UltraCodeEvent,
  UltraCodeEventType,
  VersionSuggestedEvent,
} from "./types/events.js";
/* ----------------------------------------------------------------------------
 * Memory / sessions
 * ------------------------------------------------------------------------- */
export type {
  ISessionStore,
  SessionMeta,
  SessionRecord,
} from "./types/memory.js";
/* ----------------------------------------------------------------------------
 * Provider contracts
 * ------------------------------------------------------------------------- */
export type {
  ChatMessage,
  ChatRole,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  FinishReason,
  ILLMProvider,
  ProviderId,
  ProviderName,
  ProviderOptions,
  TokenUsage,
  ToolCallRequest,
} from "./types/provider.js";
/* ----------------------------------------------------------------------------
 * Tool contracts
 * ------------------------------------------------------------------------- */
export type {
  ITool,
  ToolCategory,
  ToolContext,
  ToolDefinition,
  ToolParameterSchema,
  ToolPermission,
  ToolResult,
} from "./types/tool.js";
/* ----------------------------------------------------------------------------
 * Versioning
 * ------------------------------------------------------------------------- */
export type {
  BreakingChange,
  BumpType,
  ChangeAnalysis,
  CommitInfo,
  FileChange,
  Milestone,
  QualityGateResult,
  QualityReport,
  ReleasePlan,
  Risk,
  SecurityFinding,
  VersionSuggestion,
} from "./types/versioning.js";
export type { TruncateOptions } from "./utils/index.js";
/* ----------------------------------------------------------------------------
 * Utilities (runtime functions)
 * ------------------------------------------------------------------------- */
export {
  clamp,
  DEFAULT_TRUNCATE_SUFFIX,
  deepMerge,
  generateId,
  isPlainObject,
  serializeError,
  sleep,
  truncate,
} from "./utils/index.js";
