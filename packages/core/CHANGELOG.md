# Changelog — @ultracode/core

All notable changes to the `@ultracode/core` package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer 2.0](https://semver.org/). Versioned independently from the monorepo release.

## [Unreleased]

## [1.0.0] - 2026-06-11

### Changed
- Stable 1.0.0: core API frozen — config, providers, tools, memory, context, execution, agents, AI-versioning and the `UltraCode` facade.


## [0.2.4] - 2026-06-11

### Security
- sanitizeEnv: extend the credential denylist to the plural `CREDENTIALS$` so GCP-style `GOOGLE_APPLICATION_CREDENTIALS`/`GOOGLE_CREDENTIALS` are stripped from system-tool environments.

### Fixed
- Test coverage: add a dedicated `sanitizeEnv` suite and JsonSessionStore lock tests (stale-lock reclaim and a 48-append cross-instance no-lost-update race), closing the verification gaps flagged by the final release audit.

## [0.2.3] - 2026-06-11

### Security
- GrepTool (ReDoS, real fix): the prior 10,000-char haystack cap did **not** stop catastrophic backtracking — a single *non-matching* pathological line (e.g. `"a".repeat(9999)+"b"` against `(a+)+$`) still blocked the event loop for minutes, and the between-lines abort check could never interrupt one synchronous `RegExp.test()`. The walk-and-match now runs in a `node:worker_threads` worker that the host hard-terminates (`worker.terminate()`) when the effective per-tool timeout elapses or `ctx.signal` aborts, returning a `ToolTimeoutError` (`ok:false`) instead of hanging. The worker path resolves to the compiled `grepWorker.js` in `dist/` and to the `.ts` source under the vitest transform; grep behaviour (line numbers, `max_matches`, ignore list, flag validation, Unicode) is unchanged.
- BashTool / ExecutionEngine (API-key leak, end-to-end fix): completed the env wiring the 0.2.2 note anticipated. `env` now threads through `UltraCode.create({ env })` → `createAgentManager({ env })` → `BaseAgent` → `ExecutionEngine`, and **system**-category tools that spawn a child process sanitise the environment at the unavoidable choke point: a new `sanitizeEnv` helper drops every variable matching `/(_API_KEY|_TOKEN|_SECRET|PASSWORD|CREDENTIAL)$/i`, plus the configured `providers.apiKeys` variable names and their `ULTRACODE_*` aliases, before `spawn`. The default tool env is therefore `process.env` **minus** credentials; benign variables (`PATH`, `HOME`, `LANG`, …) are preserved. Even an embedder-supplied `ctx.env` is sanitised for system tools, since a shell child's stdout is returned to the model.

### Fixed
- JsonSessionStore.acquireLock: a durable non-ENOENT failure of the stale-lock `fs.stat` (e.g. EACCES) was swallowed, so the `for (;;)` acquisition loop spun forever instead of throwing or reclaiming. Such failures now fail fast with a `SessionError`.

### Changed
- ExecutionEngine: documented that the default tool env is the full `process.env` and that system tools sanitise credentials from it; embedders wanting strict isolation should pass an explicit `env`.

## [0.2.2] - 2026-06-11

### Security
- BashTool: stop inheriting the parent `process.env` in spawned commands (`env: { ...ctx.env }`, `windowsHide: true`) to prevent API-key/credential leakage into tool output.
- GrepTool: bound each line to 10,000 chars before testing the user-supplied regex (ReDoS mitigation) and check the abort signal periodically during search.
- GlobTool/globMatch: collapse consecutive `**` segments before regex compilation and cap segment depth, eliminating catastrophic backtracking; over-deep patterns are reported as `ok:false`.

### Fixed
- BashTool: decode stdout/stderr with a per-stream `StringDecoder` so multibyte characters split across chunks are no longer corrupted to U+FFFD.
- BashTool: cap output with the Unicode-safe `truncate` helper instead of `String.slice`, never splitting a surrogate pair.
- JsonSessionStore: add a cross-instance on-disk lock (O_EXCL with backoff and stale-lock reclaim) around the append read-modify-write, closing a lost-update race between separate store instances/processes.
- UltraCode.dispose: close the session store when it exposes `close()`/`Symbol.dispose`, releasing the SQLite handle.

### Changed
- QualityGateSystem: the default command runner now runs through `cmd.exe /d /s /c` on Windows so `.cmd`/`.bat` shims (npm/pnpm/vitest) resolve; added injectable `createDefaultCommandRunner(platform)`.
- UltraCode: type dynamic factory imports via `typeof import(...)` instead of hand-maintained mirror interfaces and `as unknown as` casts, so factory signature drift is caught at compile time.
- Test coverage raised to 94.44% lines (+18 regression tests for every audit finding, incl. `UltraCode.create` and `createTaskTool`).

## [0.2.1] - 2026-06-11

### Fixed
- Wired the standalone module packages into a working end-to-end system: added the `@ultracode/core` package barrel, routed provider API keys through the config loader's in-memory `providers.apiKeys` store (env fallback), and deferred LLM provider construction so read-only commands (`tools`/`agents list`, `config show`, `doctor`, `version`) run fully offline without an API key.

### Changed
- Exposed the stateful `ConfigManager` on the `UltraCode` facade as `configManager`, registered a `task` tool delegating to bounded subagents (`AgentManager.delegate`, depth <= 2), forwarded `core.maxTokens` into completion requests, and consolidated the duplicated `resolveHome` helpers onto a single implementation.

## [0.2.0] - 2026-06-11

### Added

#### config

- Hierarchical configuration system (`core/config`): `loadConfig` factory and `ConfigManager` merging DEFAULT_CONFIG → user config (`~/.ultracode/config.toml`) → project config (`.ultracode/config.toml`, `.vibe/config.toml`, `.ultracode.toml`) → profile (`~/.ultracode/profiles/<name>.toml`) → environment variables → runtime overrides via `deepMerge`.
- TOML parsing (smol-toml) with bidirectional snake_case ↔ camelCase key mapping, including `[tools.<name>]` → `perTool`, `[agents.<name>]` → `agents.agents`, `[[mcp_servers]]` → `mcpServers` and a `[session]`/`[sessions]` alias.
- Zod validation of the merged config (temperature 0–1, positive token budgets, known theme list, `ask|always|never` permissions, MCP transport requirements); unknown keys are logged as warnings and dropped, hard type errors raise `ConfigError` with the precise dotted path, broken TOML raises `ConfigError` with line/column info.
- Environment layer: `MISTRAL_API_KEY`/`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` → in-memory `providers.apiKeys` (never persisted), `ULTRACODE_DEBUG`/`ULTRACODE_THEME`/`ULTRACODE_PROVIDER`/`ULTRACODE_MODEL` shortcuts, generic `ULTRACODE_<SECTION>__<KEY>` mapping, plus a dependency-free `~/.ultracode/.env` parser.
- Manager API: `get`/`set` (validated dotted paths, snake_case or camelCase), `save("user"|"project")` with atomic tmp+rename writes, `exportToml`/`importToml`, `validate()`, and `redacted()` masking all `*_api_key`/`apiKey(s)` values.
- Cross-platform `resolveHome` helper (`~` expansion via `os.homedir()`); all paths built with `node:path`, BOM/CRLF tolerant, prototype-pollution-safe on every input channel.
- 95 unit tests covering layer priority, broken/huge/unicode TOML, prototype pollution, env precedence, profile overrides, invalid `set` values, secret redaction and atomic persistence.

#### providers

- LLM provider layer (`core/providers`) implementing the shared `ILLMProvider` contract for Mistral, OpenAI, Anthropic and local (Ollama) backends.
- `BaseProvider` with timeout (AbortController), exponential backoff + jitter retry for HTTP 408/429/5xx, network errors and timeouts, `Retry-After` header support, caller-abort precedence (no retry after abort) and uniform `ProviderError` mapping (`provider`, `statusCode`, `retryable`).
- Robust streaming parsers: SSE (`streamLines`, `parseSSEEvents`, `parseSSEJson` with `[DONE]` sentinel and log-and-skip for malformed JSON) and NDJSON for Ollama; all chunk-boundary-, `\r\n`- and abort-safe.
- Streaming tool-call assembly: index-based OpenAI delta fragments (`OpenAIToolCallAssembler`) and Anthropic `input_json_delta` blocks, emitted as complete `tool_call` chunks.
- `complete()`, `stream()` (terminating `done` chunk with token usage), `listModels()` and fault-tolerant `healthCheck()` on every provider.
- `createProvider(name, options)` factory with clear `ProviderError` on unknown provider names or missing API keys (`local` requires no key).

#### tools

- Tool system (`core/tools`) with `createToolSystem(config, logger, events?)` factory returning a fully wired `{ registry, executor }`.
- `ToolRegistry` (register/unregister/get/list/has; duplicate names throw `ToolError`).
- `ToolExecutor`: config-driven permission checks (`disabled`/`enabled`/`perTool.permission`; `never` denies, `ask` requires `ctx.confirm` and denies without one), per-tool timeouts via `AbortSignal` (default 30 s, `TOOL_TIMEOUT`), total exception containment (`ok: false` + `serializeError`), Unicode-safe output truncation at `MAX_TOOL_OUTPUT_CHARS`, guaranteed `durationMs`, and `tool.executed` event emission.
- `ToolQueue`: FIFO execution with bounded concurrency (default 4) and abort propagation.
- `PathGuard` / `resolvePath`: symlink-aware sandbox containment (cwd + `allowedDirs`, `~` expansion via `os.homedir()`, case-insensitive on Windows); blocks `../` traversal, absolute escapes and symlinks pointing outside.
- Built-in tools: `read` (offset/limit, binary detection, size limit), `write_file` (atomic tmp+rename, `mkdir -p`, `protected_extensions`), `edit` (exact unique string replace, `replace_all`), `delete_file`, `grep` (pure-JS recursive search with ignore list, flag validation, `maxMatches`), `glob` (pure-JS matcher for `**`, `*`, `?`, `{a,b}`), `bash` (cross-platform shell with process-tree kill on timeout/abort), `git_status`/`git_diff`/`git_log` (shell-free spawns with clean errors), `project_status` and `dependencies` (package.json/pyproject.toml/Cargo.toml), and `todo` (validated in-memory task list).
- 176 deterministic, offline unit tests covering path-traversal and symlink attacks, timeouts, permission flows, huge inputs (≥1 MB), Unicode/emoji filenames and content, corrupt manifests, missing binaries and a 1000-file grep tree.

#### memory

- `core/memory`: `createSessionStore(config, logger)` factory selecting SQLite (`node:sqlite`, dynamically imported) with graceful fallback to a JSON-file store and to an in-memory store when persistence is disabled or the session directory is unusable.
- `core/memory`: `SqliteSessionStore`, `JsonSessionStore` (atomic tmp+rename writes, corrupt files tolerated with warnings) and `InMemorySessionStore`, all implementing the shared `ISessionStore` contract (create/get/appendMessages/list/delete/prune) with `SessionError` semantics.
- `core/memory`: `MetadataCache` — generic TTL + LRU cache with injectable clock for deterministic tests.
- `core/memory`: `resolveHome` helper for cross-platform `~` expansion of configured paths.
- `core/context`: `createContextEngine(config, logger)` and `ContextEngine.collect({ cwd, prompt, maxTokens })` returning a budgeted, markdown-formatted system context.
- `core/context`: `ContextCollector` gathering file tree, git branch/status, package.json metadata, OS/runtime info and recently modified files — each source individually fault-tolerant.
- `core/context`: `ContextCompressor` with chars/4 token estimation, prompt-mention ranking and section-boundary/word-boundary trimming that never exceeds the token budget.

#### execution

- `ExecutionEngine`: multi-turn agentic loop over an injected `ILLMProvider` and tool runner — parallel tool execution with stable result ordering, tool failures fed back as `tool` messages (no run abort), cumulative `TokenUsage`, configurable `maxTurns` (default 16, `AgentError` on overflow), prompt-clean `AbortSignal` cancellation, optional `onChunk` streaming, `session.started`/`tool.executed`/`error` events, defensive handling of non-object tool arguments and tool-output truncation.
- `QueryPipeline`: small, stage-based query processor (`parse` → `validate` → `execute` → `format`) with `@agent` mention extraction, CRLF normalisation and `ValidationError`-based input validation.
- `IToolRunner`: narrow, locally defined tool-execution boundary (`execute`/`list`) decoupling the engine from the tools module.
- `BaseAgent` (`IAgent` implementation): pairs an `AgentDefinition` and system prompt with the execution engine; tool restriction via `enabledTools`/`disabledTools` with `*` wildcard support (e.g. `git_*`), allow-list wins; rejects with `AgentError` (abort errors pass through).
- Built-in agents with embedded English system prompts: `default`, `build` (full access), `plan` (read-only), `review` (no file mutation), `release` (release management), `security` (read/grep/glob/git_* allow-list).
- `AgentManager` / `createAgentManager`: agent registry with lazy instantiation, `AgentsConfig` override merging (model/provider/tools, config-only custom agents), active-agent tracking with `agent.switched` events, and `task`-style subagent delegation with depth limit 2 and concurrency bound from `tools.perTool.task.maxConcurrent` (default 3).
- `UltraCode` facade: `create()` wires config, providers, tools, memory, context and versioning via the monorepo factory contracts; constructor accepts all collaborators injected for embedding/testing; `run()` with agent selection, session continuity (history replay + persistence), streaming and abort support; clear `ProviderError` with setup hint when no API key is configured; `versioning` sub-API (`analyze`/`suggest`/`plan`/`quality`); idempotent `dispose()`.

#### versioning

- AI Versioning System (`packages/core/src/versioning`) with `createVersioningSystem` factory wiring `analyze`, `suggest`, `plan` and `quality`.
- `GitClient`: cross-platform git access via `child_process.spawn` argument arrays with injectable runner; graceful `VersioningError` when git is missing or the directory is not a repository.
- `ChangeAnalysisEngine`: file changes (numstat/name-status with rename and binary handling), tolerant Conventional Commit parsing (`type(scope)!:`, `BREAKING CHANGE:` footers), breaking-change detection from commits and an exported-symbol API diff of changed TypeScript files, and a static security rule engine (hardcoded secrets, PEM keys, eval/new Function, child_process string concatenation, insecure http://) with test-file severity dampening.
- `VersionRecommender`: SemVer 2.0 bump suggestions (incl. 0.x convention, prerelease identifiers, release-channel resolution) with confidence scoring and human-readable reasons.
- `ReleasePlanningEngine`: Keep-a-Changelog draft grouped into Added/Changed/Fixed/Security with scope prefixes, milestones from scopes/categories, heuristic risk assessment with mitigations, and optional LLM polish that falls back to the heuristic draft on provider failure.
- `QualityGateSystem`: injectable tests/coverage/docs/security/review gates with weighted 0–100 scoring (35/25/25/10/5) and weight redistribution for skipped gates.
- 93 offline, deterministic Vitest tests covering real temporary git repositories, fake runners/providers, abort signals, missing binaries, corrupted files, binary diffs, renames, Unicode/emoji and >=1 MB inputs.

## [0.1.0] - 2026-06-11

### Added

- Package scaffold within the UltraCode monorepo (strict TypeScript ESM, vitest)
