# Changelog

All notable changes to UltraCode AI are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer 2.0](https://semver.org/).

## [Unreleased]

## [1.3.1] - 2026-06-13

Metadata-only patch — no code changes.

### Fixed
- Corrected the `repository`, `homepage` and `bugs` URLs in all package manifests to the
  renamed GitHub repository (`AndreasSchwan-SIMO/ultracode-ai`); the `1.3.0` tarballs still
  referenced the pre-rename `UltraCode` path. Tightened the publish workflow permissions
  (dropped the unused `id-token: write`).

## [1.3.0] - 2026-06-13

First production-ready release. Closes the confirmed P1 hardening backlog from the
production-readiness audit plus security quick-wins. All packages aligned to `1.3.0`
(`ultracode-core`, `ultracode` CLI, `ultracode-shared`). Test baseline 1347 → 1426,
typecheck clean, coverage ~93 % statements / ~86 % branches (now a hard CI gate at 85/85/80).

### Added
- **npm publish pipeline**: `.github/workflows/publish.yml` publishes all packages via
  `pnpm -r publish` on `v*` tags, with `publishConfig.access: public`, per-package
  `README`/`LICENSE`, `files`/`repository`/`prepublishOnly` metadata and `workspace:^` ranges.
- **Configurable streaming idle/body timeout** in every provider — a stalled provider
  stream now aborts after the configured window instead of wedging the run forever.
- **Agent-loop no-progress detection**: identical consecutive tool batches terminate with a
  distinct `no_progress` result instead of silently burning the turn budget; `finishReason`
  (incl. `length` truncation) now propagates and warns.
- **Coverage threshold gate** (`vitest.config.ts`: lines/statements ≥ 85, branches ≥ 80).
- Safe-by-default protected extensions and read-deny lists on the `read`/`write_file`/`edit`
  tools (`.env`, `.pem`, `.key`, `id_rsa`, `.npmrc`, `.git/config`), opt-out via per-tool override.

### Changed
- **Versioning USP** now derives the current version from the latest SemVer git tag or
  `package.json` instead of bumping from a hardcoded `0.0.0`.
- `SqliteSessionStore` runs `PRAGMA journal_mode=WAL` + `busy_timeout` and wraps appends in a
  `BEGIN IMMEDIATE` transaction — fixes `SQLITE_BUSY` and lost-update races between two terminals.
- The persisted `SessionOptimizer` pipeline (incremental/LLM summary + pinned facts) is now
  actually consumed at replay (`buildWorkingSetPersisted`) — was previously dead code.
- `doctor` enforces Node `>= 22.13` (matches `engines`) and suppresses the noisy `node:sqlite`
  experimental warning.
- Documentation honesty pass: aspirational REST-API / Enterprise / install-channel docs are
  clearly bannered or rewritten, the GitHub org corrected, the real tool count (14) restored,
  and the `budget`/`skills`/`learn`/`agents-authoring` commands documented.

### Security
- `sanitizeEnv` now strips the most common cloud/secret variables it previously leaked into
  the model-readable bash channel (`AWS_SECRET_ACCESS_KEY`, `*_PRIVATE_KEY`, `SECRET_KEY`,
  bare `API_KEY`, Vault `SECRET_ID`) via a token-boundary model, without over-matching benign vars.
- SSRF DNS-rebinding protection (`nodeDnsLookupAll`, `allowPrivate: false`) is now wired into
  the production documentation crawler in both construction sites.
- Versioning git invocations reject leading-dash refspecs and insert `--` separators,
  closing an argument-injection / arbitrary-file-write vector.
- `sanitizeEnv` is now also threaded into the **git tools'** child-process spawn, so git
  subprocesses no longer inherit raw secrets (matching the bash tool's existing choke point).
- The learning **source library validates URL scheme + SSRF rules at add time** (not only at
  fetch time); `SkillInjector` **re-screens on-disk skill bodies for forbidden phrases** before
  injecting them into LLM context.

### Additionally hardened (P2)
- **Providers:** OpenAI reasoning-model request shaping (`max_completion_tokens`, temperature
  gating; `gpt-4o` unchanged); `prompt_cache_key` emitted by OpenAI only (Mistral excluded);
  Anthropic mid-stream `overloaded_error`/`429` classified retryable; Ollama tool-result
  correlation falls back to a stable tool name; streams that end without a terminal signal are
  flagged `incomplete` instead of reporting a clean zero-usage stop.
- **Versioning:** breaking-change API diff now handles deleted and renamed `.ts` files and
  multi-declarator / `export default` lines (generic-aware comma scanning); changelog no longer
  lists a breaking `feat`/`fix` twice.
- **Execution:** an abort signalled during a tool batch now rejects the run promptly instead of
  awaiting all in-flight tools.
- **Sessions:** `SessionOptimizer.forget()` prunes orphan sidecars on session delete/prune.
- **Tooling/tests:** `BashTool` process-group-kill fallback and spawn-error paths covered;
  facade adapter + interactive TUI bootstrap coverage raised; a real runnable example added.

## [1.2.0] - 2026-06-12

### Added
- Self-improvement & cost-governance layer (`ultracode-core` 1.2.0, `ultracode` CLI 1.1.0): BudgetPlanner (cost governance, EUR+USD, ask-threshold+hard-cap), Skill-/Agent-Creator with runtime SkillInjector, LernAgent with a growing source library (Azure docs, Azure training, pytest seeded; budget-gated cost-report-before-run), and an incremental SessionOptimizer. All module parameters centralized into per-module defaults.ts (catalog in docs/REFERENCE/parameters.md).

### Security
- SSRF-hardened documentation crawler and path-traversal-hardened skill registry (see ultracode-core 1.2.0).

### Fixed
- Hardened `serializeFrontmatter`'s list rendering: a skill object missing an optional/required list field (e.g. `triggers` or `sources` absent or `undefined`) now serializes to an empty `[]` list instead of throwing a `TypeError` on `items.length`.

## [1.1.0] - 2026-06-12

### Added
- Token-optimization module in `ultracode-core` (see its changelog 1.1.0): deterministic, ML-free, offline prompt-token reduction (dedup, whitespace, system-prompt minify with bit-for-bit IMMUTABLE compliance protection, tool-schema slimming, conversation compaction) plus opt-in provider prompt-caching hints, with honest before/after measurement.

### Fixed
- Final Windows CI defects from the cross-platform matrix: bounded delete-pending lock contention and `EBUSY` temp-dir teardown flakiness.

## [1.0.1] - 2026-06-12

### Fixed
- Cross-platform CI surfaced and fixed two real Windows defects (BashTool cmd.exe quoting, JsonSessionStore lock contention). See `ultracode-core` 1.0.1.

### Changed
- GitHub Actions CI matrix across Linux/macOS/Windows on Node 22 and 24; minimum runtime raised to `node >= 22.13.0` (pnpm/node:sqlite requirement). node:sqlite tests are now version-aware (skip with JSON fallback where unavailable).

## [1.0.0] - 2026-06-11

### Added
- First stable release. Public APIs of all modules are now frozen under SemVer.
- Successful end-to-end integration: clean build, 969 unit tests + 11 e2e tests green, ~94% line coverage, cross-platform (Linux/macOS/Windows).
- Deep security/resilience audit with adversarial verification: zero confirmed Critical/High/Medium findings; quality score >= 99/100.
- Full documentation generated from the real code (README, CONTRIBUTING, core-system, AI-versioning, AI-FEATURES, REFERENCE).


## [0.1.0] - 2026-06-11

### Added

- Monorepo foundation (pnpm workspaces): `ultracode-shared`, `ultracode-core`, `ultracode` (CLI)
- TypeScript strict-mode build setup with project references
- Vitest test infrastructure (unit per package + e2e project) with V8 coverage
