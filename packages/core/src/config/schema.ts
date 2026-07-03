/**
 * Zod validation schema for the fully-merged UltraCode configuration.
 *
 * Validates types and value ranges (temperature 0–1, positive token budgets,
 * known themes, permission enum, …). Validation runs on the **merged** result
 * of all layers, so every field is present. Unknown keys never reach the
 * schema (the mapper warns and drops them); hard type errors become
 * `ConfigError` with a precise dotted path.
 */

import type { ProvidersConfig, UltraCodeConfig } from "ultracode-shared";
import { ConfigError } from "ultracode-shared";
import { z } from "zod";

/** Themes accepted by the UI (plus `"custom"` with a `[ui.colors]` palette). */
export const KNOWN_THEMES = ["dark", "light", "dracula", "solarized", "monokai", "custom"] as const;

const toolPermission = z.enum(["ask", "always", "never"]);

const coreSchema = z.object({
  defaultAgent: z.string().min(1),
  activeModel: z.string().min(1),
  activeProvider: z.string().min(1),
  language: z.string().min(1),
  maxTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(1),
  debug: z.boolean(),
  enableTelemetry: z.boolean(),
  enableUpdateChecks: z.boolean(),
});

const providersSchema = z.object({
  default: z.string().min(1),
  timeout: z.number().positive(),
  maxRetries: z.number().int().min(0),
  retryDelay: z.number().min(0),
  proxy: z.object({
    enabled: z.boolean(),
    url: z.string().min(1).optional(),
  }),
  local: z.object({
    enabled: z.boolean(),
    endpoint: z.string().min(1),
    models: z.array(z.string()),
  }),
  /** In-memory only; stripped from every persisted/exported form. */
  apiKeys: z.record(z.string()).default({}),
});

const perToolSchema = z
  .object({
    permission: toolPermission.optional(),
    timeout: z.number().positive().optional(),
    allowedDirs: z.array(z.string()).optional(),
    protectedExtensions: z.array(z.string()).optional(),
    maxMatches: z.number().int().positive().optional(),
    maxConcurrent: z.number().int().positive().optional(),
  })
  .passthrough();

const toolsSchema = z.object({
  disabled: z.array(z.string()),
  enabled: z.array(z.string()),
  perTool: z.record(perToolSchema).default({}),
});

const agentEntrySchema = z.object({
  activeModel: z.string().min(1).optional(),
  activeProvider: z.string().min(1).optional(),
  systemPromptId: z.string().min(1).optional(),
  enabledTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
});

const agentsSchema = z.object({
  default: z.string().min(1),
  agents: z.record(agentEntrySchema).default({}),
});

const uiSchema = z.object({
  theme: z.enum(KNOWN_THEMES),
  colors: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    background: z.string().optional(),
    text: z.string().optional(),
    error: z.string().optional(),
  }),
});

const sessionsSchema = z.object({
  enablePersistence: z.boolean(),
  saveDir: z.string().min(1),
  timeout: z.number().int().min(0),
  maxSessions: z.number().int().positive(),
  compaction: z.object({
    enabled: z.boolean(),
    threshold: z.number().int().positive(),
    model: z.string().min(1),
  }),
});

const gitSchema = z.object({
  autoStatus: z.boolean(),
  autoCommit: z.boolean(),
  commit: z.object({
    enabled: z.boolean(),
    model: z.string().min(1),
    template: z.string().min(1),
  }),
  protection: z.object({
    protectedBranches: z.array(z.string()),
    blockedTools: z.array(z.string()),
  }),
});

const versioningSchema = z.object({
  enabled: z.boolean(),
  strategy: z.enum(["semantic", "date", "custom"]),
  semantic: z.object({
    autoSuggest: z.boolean(),
    prefix: z.string(),
  }),
  channels: z.record(z.string()),
  quality: z.object({
    minCoverage: z.number().min(0).max(100),
    requireReview: z.boolean(),
  }),
  changelog: z.object({
    enabled: z.boolean(),
    file: z.string().min(1),
    model: z.string().min(1),
  }),
});

const mcpServerSchema = z
  .object({
    name: z.string().min(1),
    transport: z.enum(["http", "stdio"]),
    url: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    apiKeyEnv: z.string().min(1).optional(),
  })
  .superRefine((server, ctx) => {
    if (server.transport === "http" && server.url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: `MCP server "${server.name}": transport "http" requires "url"`,
      });
    }
    if (server.transport === "stdio" && server.command === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: `MCP server "${server.name}": transport "stdio" requires "command"`,
      });
    }
  });

/** Schema of the full, merged configuration (camelCase). */
export const configSchema = z.object({
  core: coreSchema,
  providers: providersSchema,
  tools: toolsSchema,
  agents: agentsSchema,
  ui: uiSchema,
  sessions: sessionsSchema,
  git: gitSchema,
  versioning: versioningSchema,
  mcpServers: z.array(mcpServerSchema),
});

/** `providers` section extended with the in-memory API key store. */
export interface ProvidersRuntimeConfig extends ProvidersConfig {
  /** Provider name → API key. Never written to disk. */
  apiKeys: Record<string, string>;
}

/**
 * The configuration as produced by the loader: contract-compatible with
 * `UltraCodeConfig`, plus the in-memory `providers.apiKeys`.
 */
export interface ResolvedUltraCodeConfig extends UltraCodeConfig {
  providers: ProvidersRuntimeConfig;
}

/** Formats one Zod issue as `"dotted.path: message"`. */
function formatIssue(issue: z.ZodIssue): string {
  const pathStr = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `${pathStr}: ${issue.message}`;
}

/**
 * Validates a merged config object.
 *
 * @returns the parsed (and normalised) configuration.
 * @throws {ConfigError} listing every offending path on failure.
 */
export function validateConfig(candidate: unknown): ResolvedUltraCodeConfig {
  const result = configSchema.safeParse(candidate);
  if (!result.success) {
    const errors = result.error.issues.map(formatIssue);
    throw new ConfigError(`Invalid configuration: ${errors.join("; ")}`, {
      details: { errors },
    });
  }
  return result.data as ResolvedUltraCodeConfig;
}

/**
 * Non-throwing validation, e.g. for `ultracode --config validate`.
 *
 * @returns `{ valid: true, errors: [] }` or every issue as
 *   `"dotted.path: message"` strings.
 */
export function checkConfig(candidate: unknown): { valid: boolean; errors: string[] } {
  const result = configSchema.safeParse(candidate);
  if (result.success) return { valid: true, errors: [] };
  return { valid: false, errors: result.error.issues.map(formatIssue) };
}
