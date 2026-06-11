# `@ultracode/shared` — Contract Reference

This package is the **binding contract layer**. `core` and `cli` implement
against these interfaces. Types are compile-time only; the small runtime surface
is `errors`, `EventBus`, `logger`, and `utils`.

## Cross-cutting conventions (read first)

- **Tools never throw from `execute`.** Failure is reported as a
  `ToolResult` with `ok: false` and a serialized `error`. The only method
  permitted to throw is `ITool.validate`, which throws exactly `ValidationError`.
- **Providers throw on failure** — always `ProviderError`, with `retryable`
  set so the execution engine can apply retry/backoff. `healthCheck` returns
  `false` for reachable-but-unhealthy backends instead of throwing.
- **Agents reject `run()`** with `AgentError` on unrecoverable failure; abort via
  `signal` rejects with an abort-derived error.
- **All timestamps are ISO-8601 strings (UTC).** Never `Date` objects or epoch
  numbers in contract types.
- **All durations in contract result types are milliseconds** (`durationMs`).
  Config values follow the documented TOML units (`providers.timeout`,
  `tools.*.timeout`, `sessions.timeout` are **seconds**/**minutes** as labelled).
- **Errors are JSON-safe.** Anything crossing the event bus or persistence
  boundary must be a `SerializedError` (use `serializeError(err)`).
- **ESM/NodeNext:** relative imports use `.js` extensions; `import type` for
  type-only imports (`verbatimModuleSyntax` is on).
- **Config layering** uses `deepMerge` — arrays replace wholesale, `undefined`
  overrides are ignored, prototype-pollution keys are dropped.

---

## Errors (`errors.ts`)

| Type | Code | Notes |
|---|---|---|
| `UltraCodeError` (abstract) | — | Base. `code`, optional `cause`/`details`, `instanceof`-safe, `toJSON()`. |
| `ConfigError` | `CONFIG_ERROR` | Config load/parse/validation failure. |
| `ProviderError` | `PROVIDER_ERROR` | Adds `provider`, `statusCode?`, `retryable`. Thrown by providers. |
| `ToolError` | `TOOL_ERROR` | Adds `toolName`. Base for tool errors; reported, not thrown by `execute`. |
| `ToolPermissionDeniedError` | `TOOL_PERMISSION_DENIED` | Permission system refused the tool. |
| `ToolTimeoutError` | `TOOL_TIMEOUT` | Tool exceeded its timeout. |
| `ToolNotFoundError` | `TOOL_NOT_FOUND` | Requested tool not registered. |
| `AgentError` | `AGENT_ERROR` | Agent run failed. |
| `SessionError` | `SESSION_ERROR` | Session store operation failed. |
| `VersioningError` | `VERSIONING_ERROR` | Versioning/release operation failed. |
| `ValidationError` | `VALIDATION_ERROR` | Input/schema validation failure (the one thing `validate` throws). |

`SerializedError = { name, message, code, stack?, details?, cause? }`.
Construct errors with `new X(message, { cause?, details?, ... })`.

## Logging (`logger.ts`)

`Logger { debug|info|warn|error(msg, meta?) }` — methods are non-throwing and
fire-and-forget. `ConsoleLogger({ level?, silent?, sink? })` filters by level and
honours `silent`. `NoopLogger` discards everything (tests/embedding). Components
receive a `Logger` via context; never reach for a global.

## Tools (`types/tool.ts`)

- `ToolPermission = "ask" | "always" | "never"` — `"ask"` prompts via
  `ToolContext.confirm`; `"never"` must be refused.
- `ToolCategory` — `file | search | system | project | ai | utility | mcp`.
- `ToolParameterSchema` — pragmatic JSON-Schema subset (`type`, `description`,
  `required`, `properties`, `items`, `enum`, `default`).
- `ToolDefinition { name, description, category, parameters, permission }` —
  static registry entry.
- `ToolContext { cwd, env (readonly), signal?, confirm?, logger }` — a tool's
  only window to the outside world. Treat missing `confirm` as "no confirmation
  available".
- `ToolResult<T> { ok, output, error?, durationMs, truncated? }` — always
  returned. `error` is set iff `ok === false`.
- `ITool<TArgs, TOut>` — `definition`, `validate(args): TArgs` (throws
  `ValidationError`), `execute(args, ctx): Promise<ToolResult<TOut>>` (never
  rejects; permission/timeout/not-found become `ok: false`).

## Providers (`types/provider.ts`)

- `ProviderName = "mistral" | "anthropic" | "openai" | "local"`;
  `ProviderId = ProviderName | (string & {})` (open to custom backends, keeps
  autocomplete).
- `ChatRole = "system" | "user" | "assistant" | "tool"`.
- `ChatMessage { role, content, toolCalls?, toolCallId?, name? }` — assistant
  turns may have empty `content` when only calling tools; `tool` messages carry
  `toolCallId`.
- `ToolCallRequest { id, name, arguments }`.
- `CompletionRequest { messages, model, maxTokens?, temperature?, tools?, signal? }`.
- `CompletionChunk { type: "text"|"tool_call"|"done", text?, toolCall?, usage? }`
  — streams must terminate with a `"done"` chunk carrying `usage`.
- `CompletionResult { text, toolCalls, usage, finishReason }`,
  `finishReason ∈ "stop"|"tool_calls"|"length"|"error"`.
- `TokenUsage { inputTokens, outputTokens }`.
- `ILLMProvider { name, listModels(), complete(), stream(), healthCheck() }` —
  async methods throw `ProviderError`; `healthCheck` returns `false` for
  unhealthy backends.
- `ProviderOptions { apiKey?, baseUrl?, timeoutMs, maxRetries, retryDelayMs }`
  (note: **milliseconds** here, unlike the TOML config units).

## Agents (`types/agent.ts`)

- `AgentDefinition { name, description, type, model?, provider?, systemPromptId?,
  enabledTools?, disabledTools? }`; `type ∈ default|subagent|specialized|custom`.
  `enabledTools` (allow-list) overrides `disabledTools`.
- `AgentRunInput { prompt, sessionId?, signal? }` — omit `sessionId` to start a
  new session.
- `AgentRunResult { text, toolCallsExecuted, usage, turns }` — `usage` is
  cumulative across the run.
- `IAgent { definition, run(input): Promise<AgentRunResult> }` — rejects with
  `AgentError`.

## Config (`types/config.ts`)

`UltraCodeConfig` mirrors `docs/GETTING-STARTED/configuration.md` (camelCase; the
loader maps snake_case ↔ camelCase). Sections: `core`, `providers`, `tools`,
`agents`, `ui`, `sessions`, `git`, `versioning`, `mcpServers[]`.

- `CoreConfig` — `defaultAgent, activeModel, activeProvider, language, maxTokens,
  temperature, debug, enableTelemetry, enableUpdateChecks`.
- `ProvidersConfig` — `default, timeout (s), maxRetries, retryDelay (s), proxy,
  local { enabled, endpoint, models }`.
- `ToolsConfig` — `disabled[], enabled[], perTool: Record<name, PerToolConfig>`.
  `PerToolConfig` carries `permission?`, `timeout?` and an open index signature
  for tool-specific keys (`allowedDirs`, `maxMatches`, `maxConcurrent`, …).
- `AgentsConfig` — `default` + `agents: Record<name, AgentConfigEntry>`.
- `UiConfig` — `theme` + custom `colors`.
- `SessionsConfig` — `enablePersistence, saveDir, timeout (min), maxSessions,
  compaction { enabled, threshold, model }`.
- `GitConfig` — `autoStatus, autoCommit, commit{...}, protection{...}`.
- `VersioningConfig` — `enabled, strategy, semantic{autoSuggest,prefix},
  channels{stable,lts,experimental,...}, quality{minCoverage,requireReview},
  changelog{enabled,file,model}`.
- `McpServerConfig` — `name, transport ("http"|"stdio"), url?|command?+args?,
  apiKeyEnv?`.

`DEFAULT_CONFIG` is the fully-populated baseline (defaults follow the documented
reference table: `language="en"`, `theme="dark"`). `DeepPartial<T>` types
project/user overlays (arrays treated as leaves).

## Memory / sessions (`types/memory.ts`)

- `SessionMeta { id, title, createdAt, updatedAt, agentName, messageCount }` —
  timestamps ISO-8601.
- `SessionRecord extends SessionMeta { messages: ChatMessage[] }`.
- `ISessionStore` — `create`, `get` (→ `null` if absent, no throw),
  `appendMessages` (bumps `updatedAt`/`messageCount`), `list(limit?)`
  (most-recent first), `delete` (→ `false` if absent), `prune(maxSessions)`
  (→ count removed). Hard failures reject with `SessionError`.

## Versioning (`types/versioning.ts`)

- `BumpType = major|minor|patch|prerelease|none`.
- `FileChange { path, status, additions, deletions }`.
- `CommitInfo { hash, type|null, scope|null, subject, breaking }`.
- `BreakingChange { source: "commit"|"api-diff", description, location? }`.
- `SecurityFinding { severity, rule, file, line?, description }`.
- `ChangeAnalysis { files, commits, breakingChanges, categories{...}, securityFindings }`.
- `VersionSuggestion { currentVersion, suggestedVersion, bump, confidence (0–1), reasons[] }`.
- `ReleasePlan { version, targetDate?, milestones[], risks[], changelogDraft }`,
  `Milestone { title, items, done }`, `Risk { description, severity, mitigation }`.
- `QualityGateResult { gate, passed, score?, details }`,
  `QualityReport { passed, gates, overallScore }`.

## Events (`types/events.ts`, `events/EventBus.ts`)

`UltraCodeEvent` discriminated union on `type`: `tool.executed`,
`agent.switched`, `session.started`, `session.ended`, `error`,
`version.suggested`. `IEventBus { emit(e), on(type, handler): () => void }`.

`EventBus` guarantees: synchronous dispatch; **handler isolation** (a throwing
handler is caught and reported via `onHandlerError`, default `console.error`,
without breaking siblings); **safe mutation during emit** (subscribe/unsubscribe
inside a handler operates on the next round, not the in-flight snapshot);
idempotent unsubscribe. Helpers: `listenerCount(type)`, `removeAll(type?)`.

## Utilities (`utils/`)

- `serializeError(err): SerializedError` — total, never throws (handles
  `UltraCodeError`, `Error`, strings, error-shaped objects, primitives, circular).
- `truncate(s, max, { suffix? })` — Unicode-safe (never splits surrogate pairs);
  suffix counts toward `max`; `max<=0` → `""`.
- `deepMerge(base, override)` — config layering; arrays replace, `undefined`
  skipped, `__proto__`/`constructor`/`prototype` dropped; inputs not mutated.
- `isPlainObject(v)` — true only for `Object.prototype`/null-prototype objects.
- `sleep(ms, signal?)` — cancellable; rejects with the abort reason (or
  `AbortError`); clamps negative/non-finite to 0.
- `clamp(value, min, max)` — total; swaps inverted bounds; `NaN` → lower bound.
- `generateId(prefix?)` — `crypto.randomUUID()`; `"<prefix>_<uuid>"` when prefixed.

## Constants (`constants.ts`)

`VERSION` (`"0.1.0"`), `CONFIG_FILE_NAMES` (resolution order),
`USER_CONFIG_DIR`/`USER_CONFIG_FILE`/`USER_ENV_FILE`, `ENV_PREFIX`
(`"ULTRACODE_"`), `DEFAULT_SESSION_DIR`, `PROMPTS_DIR`, `MAX_TOOL_OUTPUT_CHARS`
(`100_000`), `DEFAULT_PROVIDER_TIMEOUT_MS`, `DEFAULT_MAX_RETRIES`,
`DEFAULT_RETRY_DELAY_MS`, `DEFAULT_CHANGELOG_FILE`.
