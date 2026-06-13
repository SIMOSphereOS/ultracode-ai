/**
 * Structural description of the UltraCode configuration tree.
 *
 * The spec drives three concerns:
 * - snake_case (TOML) ↔ camelCase (config interfaces) key mapping,
 * - unknown-key detection (warn via logger, never abort),
 * - dotted-path normalisation for `get`/`set` (structural keys are camelised,
 *   keys of open records — tool names, agent names, channels — stay verbatim).
 */

/** Keys that must never be copied from untrusted input (prototype pollution). */
export const DANGEROUS_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** A leaf value (scalar or array — arrays are treated as leaves). */
export interface ValueSpec {
  kind: "value";
}

/**
 * An object with a known key set. `open` describes how additional keys are
 * treated:
 * - `undefined` — unknown keys produce a warning and are dropped,
 * - `"verbatim"` — extra keys are kept as-is (tool names, agent names, …),
 * - `"camel"` — extra keys are kept but case-mapped like structural keys.
 */
export interface ObjectSpec {
  kind: "object";
  keys: Record<string, SpecNode>;
  open?: "verbatim" | "camel";
  /** Spec applied to values of extra (open) keys. */
  openValue?: SpecNode;
}

/** An array whose items are objects described by `item`. */
export interface ArrayOfObjectsSpec {
  kind: "arrayOfObjects";
  item: ObjectSpec;
}

export type SpecNode = ValueSpec | ObjectSpec | ArrayOfObjectsSpec;

const value: ValueSpec = { kind: "value" };

/** Spec of a single `[tools.<name>]` entry (open: tool-specific extras allowed). */
export const PER_TOOL_SPEC: ObjectSpec = {
  kind: "object",
  keys: {
    permission: value,
    timeout: value,
    allowedDirs: value,
    protectedExtensions: value,
    maxMatches: value,
    maxConcurrent: value,
  },
  open: "camel",
  openValue: value,
};

/** Spec of a single `[agents.<name>]` entry. */
export const AGENT_ENTRY_SPEC: ObjectSpec = {
  kind: "object",
  keys: {
    activeModel: value,
    activeProvider: value,
    systemPromptId: value,
    enabledTools: value,
    disabledTools: value,
  },
};

/** Spec of a single `[[mcp_servers]]` entry. */
export const MCP_SERVER_SPEC: ObjectSpec = {
  kind: "object",
  keys: {
    name: value,
    transport: value,
    url: value,
    command: value,
    args: value,
    apiKeyEnv: value,
  },
};

/**
 * The full configuration tree in camelCase. Mirrors `UltraCodeConfig` from
 * `ultracode-shared`, plus the in-memory-only `providers.apiKeys` record.
 */
export const CONFIG_SPEC: ObjectSpec = {
  kind: "object",
  keys: {
    core: {
      kind: "object",
      keys: {
        defaultAgent: value,
        activeModel: value,
        activeProvider: value,
        language: value,
        maxTokens: value,
        temperature: value,
        debug: value,
        enableTelemetry: value,
        enableUpdateChecks: value,
      },
    },
    providers: {
      kind: "object",
      keys: {
        default: value,
        timeout: value,
        maxRetries: value,
        retryDelay: value,
        proxy: { kind: "object", keys: { enabled: value, url: value } },
        local: {
          kind: "object",
          keys: { enabled: value, endpoint: value, models: value },
        },
        apiKeys: { kind: "object", keys: {}, open: "verbatim", openValue: value },
      },
    },
    tools: {
      kind: "object",
      keys: {
        disabled: value,
        enabled: value,
        perTool: {
          kind: "object",
          keys: {},
          open: "verbatim",
          openValue: PER_TOOL_SPEC,
        },
      },
    },
    agents: {
      kind: "object",
      keys: {
        default: value,
        agents: {
          kind: "object",
          keys: {},
          open: "verbatim",
          openValue: AGENT_ENTRY_SPEC,
        },
      },
    },
    ui: {
      kind: "object",
      keys: {
        theme: value,
        colors: {
          kind: "object",
          keys: {
            primary: value,
            secondary: value,
            background: value,
            text: value,
            error: value,
          },
        },
      },
    },
    sessions: {
      kind: "object",
      keys: {
        enablePersistence: value,
        saveDir: value,
        timeout: value,
        maxSessions: value,
        compaction: {
          kind: "object",
          keys: { enabled: value, threshold: value, model: value },
        },
      },
    },
    git: {
      kind: "object",
      keys: {
        autoStatus: value,
        autoCommit: value,
        commit: { kind: "object", keys: { enabled: value, model: value, template: value } },
        protection: {
          kind: "object",
          keys: { protectedBranches: value, blockedTools: value },
        },
      },
    },
    versioning: {
      kind: "object",
      keys: {
        enabled: value,
        strategy: value,
        semantic: { kind: "object", keys: { autoSuggest: value, prefix: value } },
        channels: { kind: "object", keys: {}, open: "verbatim", openValue: value },
        quality: { kind: "object", keys: { minCoverage: value, requireReview: value } },
        changelog: { kind: "object", keys: { enabled: value, file: value, model: value } },
      },
    },
    mcpServers: { kind: "arrayOfObjects", item: MCP_SERVER_SPEC },
  },
};

/**
 * Converts a snake_case key to camelCase (`max_tokens` → `maxTokens`).
 * Keys without underscores pass through unchanged.
 */
export function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/gi, (_m, c: string) => c.toUpperCase());
}

/**
 * Converts a camelCase key to snake_case (`maxTokens` → `max_tokens`).
 * Inverse of {@link camelizeKey} for the structural config keys.
 */
export function snakeifyKey(key: string): string {
  return key.replace(/([A-Z])/g, (_m, c: string) => `_${c.toLowerCase()}`);
}
