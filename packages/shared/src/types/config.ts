/**
 * UltraCode configuration contract.
 *
 * Mirrors the TOML configuration documented in
 * `docs/GETTING-STARTED/configuration.md` 1:1, but in camelCase (the loader is
 * responsible for snake_case ↔ camelCase mapping). The full, resolved config is
 * {@link UltraCodeConfig}; partial overlays (project/user layers) use
 * {@link DeepPartial}. {@link DEFAULT_CONFIG} is the fully-populated baseline.
 */

import type { ProviderId } from "./provider.js";
import type { ToolPermission } from "./tool.js";

/**
 * Recursively makes every property of `T` optional. Used for config overlays
 * where each layer only specifies the keys it overrides. Arrays are treated as
 * leaves (replaced wholesale, never deep-merged).
 */
export type DeepPartial<T> = T extends ReadonlyArray<unknown>
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** `[core]` — global behaviour. */
export interface CoreConfig {
  /** Default agent for new sessions. */
  defaultAgent: string;
  /** Active model identifier. */
  activeModel: string;
  /** Active provider identifier. */
  activeProvider: ProviderId;
  /** Output language (e.g. `"de"`, `"en"`). */
  language: string;
  /** Max tokens per message. */
  maxTokens: number;
  /** Sampling temperature, `0.0`–`1.0`. */
  temperature: number;
  /** Debug mode. */
  debug: boolean;
  /** Send anonymised telemetry. */
  enableTelemetry: boolean;
  /** Check for updates on startup. */
  enableUpdateChecks: boolean;
}

/** `[providers.proxy]` — outbound proxy settings. */
export interface ProxyConfig {
  /** Whether the proxy is active. */
  enabled: boolean;
  /** Proxy URL, when {@link ProxyConfig.enabled}. */
  url?: string;
}

/** `[providers.local]` — local model backend (Ollama/LM Studio). */
export interface LocalProviderConfig {
  /** Whether local models are available. */
  enabled: boolean;
  /** Base endpoint of the local LLM server. */
  endpoint: string;
  /** Known local model identifiers. */
  models: string[];
}

/** `[providers]` — provider-wide defaults. Keys/secrets live in `.env`, not here. */
export interface ProvidersConfig {
  /** Default provider identifier. */
  default: ProviderId;
  /** API timeout in **seconds** (TOML unit, as documented). */
  timeout: number;
  /** Maximum retry attempts. */
  maxRetries: number;
  /** Base retry delay in **seconds**. */
  retryDelay: number;
  /** Outbound proxy configuration. */
  proxy: ProxyConfig;
  /** Local backend configuration. */
  local: LocalProviderConfig;
}

/** `[tools.<name>]` — per-tool overrides. Extra keys are permitted and preserved. */
export interface PerToolConfig {
  /** Permission override for this tool. */
  permission?: ToolPermission;
  /** Execution timeout in **seconds**. */
  timeout?: number;
  /** Tool-specific allow-listed directories. */
  allowedDirs?: string[];
  /** Extensions this tool must never overwrite. */
  protectedExtensions?: string[];
  /** Cap on returned matches (search tools). */
  maxMatches?: number;
  /** Max concurrent subagents (`task` tool). */
  maxConcurrent?: number;
  /** Open-ended escape hatch for additional, tool-specific keys. */
  [key: string]: unknown;
}

/** `[tools]` — tool enablement and per-tool config. */
export interface ToolsConfig {
  /** Tools disabled by default. */
  disabled: string[];
  /** Tools force-enabled (overrides {@link ToolsConfig.disabled}). */
  enabled: string[];
  /** Per-tool settings keyed by tool name. */
  perTool: Record<string, PerToolConfig>;
}

/** `[agents.<name>]` — a single agent override entry. */
export interface AgentConfigEntry {
  /** Model override. */
  activeModel?: string;
  /** Provider override. */
  activeProvider?: ProviderId;
  /** System prompt identifier. */
  systemPromptId?: string;
  /** Allow-listed tools. */
  enabledTools?: string[];
  /** Deny-listed tools. */
  disabledTools?: string[];
}

/** `[agents]` — default agent plus per-agent overrides. */
export interface AgentsConfig {
  /** Default agent name. */
  default: string;
  /** Per-agent overrides keyed by agent name. */
  agents: Record<string, AgentConfigEntry>;
}

/** `[ui.colors]` — custom theme palette (used when `theme = "custom"`). */
export interface UiColors {
  primary?: string;
  secondary?: string;
  background?: string;
  text?: string;
  error?: string;
}

/** `[ui]` — presentation. */
export interface UiConfig {
  /** Theme name (`dark`, `light`, `dracula`, …, or `custom`). */
  theme: string;
  /** Palette overrides for `theme = "custom"`. */
  colors: UiColors;
}

/** `[session.compaction]` — long-conversation summarisation. */
export interface SessionCompactionConfig {
  /** Whether compaction is enabled. */
  enabled: boolean;
  /** Message-count threshold that triggers compaction. */
  threshold: number;
  /** Model used to produce the summary. */
  model: string;
}

/** `[sessions]` — persistence and lifecycle. */
export interface SessionsConfig {
  /** Persist sessions to disk. */
  enablePersistence: boolean;
  /** Directory for saved sessions (`~` allowed). */
  saveDir: string;
  /** Idle timeout in **minutes** (`0` = never). */
  timeout: number;
  /** Maximum retained sessions. */
  maxSessions: number;
  /** Compaction settings. */
  compaction: SessionCompactionConfig;
}

/** `[git.commit]` — commit-message generation. */
export interface GitCommitConfig {
  /** Whether AI commit messages are generated. */
  enabled: boolean;
  /** Model for commit-message generation. */
  model: string;
  /** Message template (e.g. `"conventional"`). */
  template: string;
}

/** `[git.protection]` — protected-branch guard rails. */
export interface GitProtectionConfig {
  /** Branches on which mutating tools are restricted. */
  protectedBranches: string[];
  /** Tools blocked on protected branches. */
  blockedTools: string[];
}

/** `[git]` — Git integration. */
export interface GitConfig {
  /** Show git status automatically. */
  autoStatus: boolean;
  /** Auto-commit before running tools. */
  autoCommit: boolean;
  /** Commit-message generation settings. */
  commit: GitCommitConfig;
  /** Branch protection settings. */
  protection: GitProtectionConfig;
}

/** `[versioning.semantic]` — SemVer behaviour. */
export interface VersioningSemanticConfig {
  /** Automatically suggest the next version. */
  autoSuggest: boolean;
  /** Version tag prefix (e.g. `"v"`). */
  prefix: string;
}

/** `[versioning.channels]` — channel → current version mapping. */
export interface VersioningChannelsConfig {
  stable: string;
  lts: string;
  experimental: string;
  /** Additional custom channels. */
  [channel: string]: string;
}

/** `[versioning.quality]` — release quality gates. */
export interface VersioningQualityConfig {
  /** Minimum test coverage percentage required for release. */
  minCoverage: number;
  /** Whether code review is mandatory before release. */
  requireReview: boolean;
}

/** `[versioning.changelog]` — changelog generation. */
export interface VersioningChangelogConfig {
  /** Whether changelog generation is enabled. */
  enabled: boolean;
  /** Target changelog file. */
  file: string;
  /** Model used to draft the changelog. */
  model: string;
}

/** `[versioning]` — the AI versioning system. */
export interface VersioningConfig {
  /** Master switch. */
  enabled: boolean;
  /** Strategy: `"semantic"`, `"date"`, or `"custom"`. */
  strategy: "semantic" | "date" | "custom";
  /** Semantic versioning settings. */
  semantic: VersioningSemanticConfig;
  /** Channel → version map. */
  channels: VersioningChannelsConfig;
  /** Quality gate thresholds. */
  quality: VersioningQualityConfig;
  /** Changelog settings. */
  changelog: VersioningChangelogConfig;
}

/** Transport for an MCP server. */
export type McpTransport = "http" | "stdio";

/** `[[mcp_servers]]` — a single MCP server registration. */
export interface McpServerConfig {
  /** Unique server name; used to namespace its tools. */
  name: string;
  /** Transport type. */
  transport: McpTransport;
  /** For `transport: "http"`: server URL. */
  url?: string;
  /** For `transport: "stdio"`: executable to launch. */
  command?: string;
  /** For `transport: "stdio"`: arguments to {@link McpServerConfig.command}. */
  args?: string[];
  /** Environment variable holding the server's API key. */
  apiKeyEnv?: string;
}

/** The fully-resolved UltraCode configuration. */
export interface UltraCodeConfig {
  core: CoreConfig;
  providers: ProvidersConfig;
  tools: ToolsConfig;
  agents: AgentsConfig;
  ui: UiConfig;
  sessions: SessionsConfig;
  git: GitConfig;
  versioning: VersioningConfig;
  /** Registered MCP servers. */
  mcpServers: McpServerConfig[];
}

/**
 * The embedded baseline configuration. Every key is populated so that a missing
 * user/project config still yields a valid, runnable {@link UltraCodeConfig}.
 * Defaults follow the documented reference table (note: `language` defaults to
 * `"en"`, `theme` to `"dark"`).
 */
export const DEFAULT_CONFIG: UltraCodeConfig = {
  core: {
    defaultAgent: "default",
    activeModel: "mistral-large",
    activeProvider: "mistral",
    language: "en",
    maxTokens: 32000,
    temperature: 0.7,
    debug: false,
    enableTelemetry: true,
    enableUpdateChecks: true,
  },
  providers: {
    default: "mistral",
    timeout: 60,
    maxRetries: 3,
    retryDelay: 1,
    proxy: {
      enabled: false,
    },
    local: {
      enabled: false,
      endpoint: "http://localhost:11434",
      models: [],
    },
  },
  tools: {
    disabled: [],
    enabled: [],
    perTool: {},
  },
  agents: {
    default: "default",
    agents: {},
  },
  ui: {
    theme: "dark",
    colors: {},
  },
  sessions: {
    enablePersistence: true,
    saveDir: "~/.ultracode/sessions",
    timeout: 60,
    maxSessions: 50,
    compaction: {
      enabled: true,
      threshold: 50,
      model: "mistral-medium",
    },
  },
  git: {
    autoStatus: true,
    autoCommit: false,
    commit: {
      enabled: true,
      model: "mistral-medium",
      template: "conventional",
    },
    protection: {
      protectedBranches: ["main", "master", "develop"],
      blockedTools: [],
    },
  },
  versioning: {
    enabled: true,
    strategy: "semantic",
    semantic: {
      autoSuggest: true,
      prefix: "v",
    },
    channels: {
      stable: "0.0.0",
      lts: "0.0.0",
      experimental: "0.0.0",
    },
    quality: {
      minCoverage: 80,
      requireReview: true,
    },
    changelog: {
      enabled: true,
      file: "CHANGELOG.md",
      model: "mistral-medium",
    },
  },
  mcpServers: [],
};
