# Changelog — @ultracode/core

All notable changes to the `@ultracode/core` package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer 2.0](https://semver.org/). Versioned independently from the monorepo release.

## [Unreleased]

## [1.2.0] - 2026-06-12

### Added
- **core/budget — BudgetPlanner**: central cost governance. Deterministic offline cost estimation (EUR-first + USD band, configurable price table, HeuristicTokenCounter-backed), ask-threshold policy (auto-allow / approval / hard-cap with 50/80/100% alerts), atomic append-only JSONL ledger, per-category budget envelopes (development/learning/operations) under ~/.ultracode/budget/, interactive plan wizard. Exposes IBudgetGate + budget.* events.
- **core/authoring — Skill-/Agent-Creator**: turns distilled knowledge into reviewable skill (Markdown+frontmatter under ~/.ultracode/skills/<catalog>/) and agent proposals; persists only after approval; deterministic scaffolding with optional budget-gated LLM refinement; offline safety/test gate (schema, forbidden phrases, no tool-permission escalation); audit trail; scoreSkill. `SkillInjector` makes active skills take effect at runtime via agent context.
- **core/learning — LernAgent**: a growing source library (~/.ultracode/learning/sources.toml, seeded on-demand with azure-docs, azure-training, pytest-docs and dynamically extensible) plus an incremental native crawler (sitemap-first, conditional GET / 304, content-hash dedup, checkpoint/resume) and a map-reduce extraction pipeline with cheap-model routing. LearnRun is budget-gated: `plan` estimates cost with no spend; `run` performs no network/LLM work without explicit approval.
- **core/session-optimizer**: running, incremental, non-blocking session compaction after each turn — dedup, rolling durable summary of aged-out turns (extractive by default, optional budget-gated LLM), pinned-fact extraction; compact working set replayed on continued sessions; raw history never mutated; session.optimized event.
- Centralized all module tunables into per-module `defaults.ts` (147 named, categorized, overridable parameters); full catalog in docs/REFERENCE/parameters.md.

### Security
- learning: SSRF-harden the native crawler — every fetched URL (robots.txt, sitemap roots, index-shard <loc>s, pages, redirect targets) passes a central urlGuard: http(s)-only, same-host/allow-list scoping, private/loopback/link-local/cloud-metadata IP blocking (IPv4+IPv6 incl. ::ffff:-mapped and obfuscated decimal/hex/octal forms), opt-in DNS-rebinding resolution, manual redirect re-validation with a hop cap, response-body size cap.
- authoring: prevent path traversal in the skill registry — '.'/'..' catalog/skill segments are rejected and the resolved file is asserted to stay within the skills root; KnowledgeMaterial.catalog validated up front.

### Fixed
- learning: write a final checkpoint when a learn run is aborted, so resume is idempotent and never re-processes completed URLs.
- authoring: serializeFrontmatter renders a missing/undefined list field as an empty list instead of throwing.
- budget: rename misleading `round4` helper to `roundUsd` (rounds to 6 decimals via ROUND_SCALE).

## [1.1.0] - 2026-06-12

### Added

#### tokens

- Token-optimization module (`core/tokens`): deterministic, ML-free, offline reduction of prompt tokens that **measures actual before/after counts** and reports the honest reduction (per-stage and total) — never a claimed saving it did not make.
- `HeuristicTokenCounter` (`TokenCounter` interface): calibrated offline estimate blending chars/4 and words×1.3 with punctuation and CJK/emoji surcharges; deterministic, monotonic and total (safe on empty, ≥1 MB, Unicode, emoji, surrogate and pure-whitespace inputs). Documented as a ±10–20 % provider-dependent estimate; pluggable `ProviderTokenCounter` hook for an exact count, offline by default.
- `PromptPayload`/`TokenStats` model splitting a prompt into `system`/`tools`/`messages`/`context` so spend and savings are attributed per part.
- Composable, pure, deterministic `OptimizerStage`s: `DedupContextStage` (folds byte-identical context blocks to `[identical to block above]`), `WhitespaceNormalizeStage` (collapses blank-line runs, **never inside fenced code**), `SystemPromptMinifyStage` (lossless blank-line + exact-duplicate-paragraph reduction that reproduces IMMUTABLE-marked compliance/AML/security spans **bit-for-bit**, with custom `immutableMarkers` regex support), `ToolSchemaSlimStage` (trims over-long tool **descriptions** at a word boundary and optional per-turn allow-list; tool name/parameters/required untouched), and `ConversationCompactionStage` (head/tail sliding window that folds the middle only when over `tokenBudget`, never splitting tool-call/result pairs, with optional injected-provider LLM summarization and deterministic fallback on error).
- `TokenOptimizer` + `createDefaultOptimizer`: runs the stage chain, measuring tokens before and after each stage; reports `{ payload, before, after, reductionPct, perStage }` with honest (including negative) per-stage savings.
- Provider prompt-caching hints (`CacheHint`, `cachePrefixHint`, `computePrefixKey`): mark the stable `system + tools` prefix as cacheable following the rule "static first, variable last; breakpoint on the last stable block". Minimal, **opt-in** provider changes — `AnthropicProvider` sets `cache_control: { type: "ephemeral" }` on the last stable block and OpenAI-compatible providers set a stable `prompt_cache_key` **only when a hint is present**; with no hint the wire format is byte-identical to before, so all existing provider tests remain green.
- `ExecutionEngine` integration: optional injectable `optimizer` (`ITokenOptimizer`), `enableTokenOptimization` (default `true`, no-op without an injected optimizer) and `tokenBudget`; applies the safe stages before the provider call, writes the result back, and publishes a core-local `tokens.optimized` event (`{ before, after, reductionPct, perStage }`) — defined without touching the frozen shared `UltraCodeEvent` union — falling back to `logger.info`. Optimizer failures are caught and the original prompt is used unchanged.
- 88 offline, deterministic Vitest tests covering the counter (extremes incl. ≥1 MB/emoji/surrogate/whitespace), each stage (idempotence, code-fence safety, the bit-for-bit IMMUTABLE compliance-block guarantee, tool-schema validity, tool-call/result-pair integrity, summarizer + throwing-summarizer fallback), the optimizer (honest reduction incl. negative savings, per-stage sums, no input mutation), provider cache hints (identical wire format without a hint; `cache_control` on the right block with one) and the execution-engine integration (event emission, disable switch, error fallback).

### Fixed

- JsonSessionStore (Windows): bound the retry of ambiguous delete-pending `EPERM`/`EACCES`/`EBUSY` errors by `WIN_CONTENTION_BUDGET_MS` (2 s) so a genuine durable Windows permission failure still surfaces as `SessionError` instead of spinning, while real millisecond-scale transients keep retrying. POSIX durable `EACCES` continues to fail fast immediately.

### Changed

- Test hardening: temp-dir teardowns that spawn child processes now use `fs.rm` with `maxRetries`/`retryDelay`, eliminating Windows `EBUSY` flakiness when a just-killed process tree briefly holds the directory.

## [1.0.1] - 2026-06-12

### Fixed
- BashTool (Windows): wrap the command line in an outer quote pair for `cmd.exe /s /c` so embedded quotes (e.g. `"C:\\…\\node.exe" -e "…"`) survive instead of being mangled — fixes all bash execution on Windows.
- JsonSessionStore (Windows): treat transient `EPERM`/`EACCES`/`EBUSY` from the exclusive lock open/stat as contention (delete-pending state) and retry, instead of failing hard — fixes lost-update failures under concurrent appends on Windows. The POSIX fail-fast on durable `EACCES` is preserved.

### Changed
- Declared the real minimum runtime `node >= 22.13.0` (required by `pnpm@11.5.2` and `node:sqlite`); CI matrix runs Node 22 and 24 across Linux/macOS/Windows.

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
