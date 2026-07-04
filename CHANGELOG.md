# Changelog

Alle relevanten Änderungen an UltraCode AI werden hier dokumentiert. /
All notable changes to UltraCode AI are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/de/1.1.0/) ·
Versionierung / Versioning: [Semantic Versioning](https://semver.org/) ·
Release-Prozess / process: siehe `VERSIONING.md` (SIMO Release Management).

## [Unreleased]

### Hinzugefügt / Added
- **Minimaler LSP-Client (Diagnostics)**: Ein bewusst minimaler Language-Server-Protocol-
  Client (`packages/core/src/lsp/`) verbindet sich über stdio mit **einem** konfigurierten
  Language-Server (LSP-Wire-Format mit `Content-Length`-Header-Framing), führt den Handshake
  aus (`initialize` → `initialized`-Notification), öffnet eine Datei via
  `textDocument/didOpen` und sammelt die vom Server gepushten Diagnostics
  (`textDocument/publishDiagnostics`); `shutdown`/`exit` und Dispose räumen sauber ab. Das
  neue on-demand-Tool `lsp_diagnostics` routet eine Datei anhand Endung/Sprach-ID an den
  passenden konfigurierten Server, startet ihn faul, hält die Verbindung offen und gibt
  Fehler/Warnungen/Hinweise zurück; ohne passenden Server oder bei Fehlern liefert es
  defensiv ein leeres Ergebnis mit Hinweis (nie Session-Crash). Additives, rückwärtskompatibles
  Config-Schema `LspServerConfig` (`name`, `command`, `args?`, `languages?`, `rootUri?`) und
  `UltraCodeConfig.lspServers` (`[[lsp_servers]]`, Default `[]`). Bewusst **kein**
  Auto-Management vieler Sprachen und **keine** IDE-Bridge (Begründung: ADR 0003). /
  Minimal LSP client (diagnostics): a deliberately minimal Language Server Protocol client
  (`packages/core/src/lsp/`) connects over stdio to **one** configured language server (LSP
  wire format with `Content-Length` header framing), runs the handshake
  (`initialize` → `initialized` notification), opens a file via `textDocument/didOpen` and
  collects the diagnostics the server pushes (`textDocument/publishDiagnostics`);
  `shutdown`/`exit` and dispose clean up. The new on-demand `lsp_diagnostics` tool routes a
  file by its extension/language id to the matching configured server, spawns it lazily,
  keeps the connection open and returns errors/warnings/hints; with no matching server or on
  failure it defensively returns an empty result with a note (never crashes the session). An
  additive, backward-compatible config schema `LspServerConfig` (`name`, `command`, `args?`,
  `languages?`, `rootUri?`) and `UltraCodeConfig.lspServers` (`[[lsp_servers]]`, default
  `[]`). Deliberately **no** multi-language auto-management and **no** IDE bridge (rationale:
  ADR 0003).
- **MCP-Client (stdio/http)**: UltraCode bindet jetzt externe Tools über das Model Context
  Protocol an (`packages/core/src/mcp/`) — Transport (stdio/HTTP), JSON-RPC-Schicht,
  `McpClient` und ein Tool-Adapter, der entdeckte MCP-Tools in die Tool-Registry einhängt;
  Registrierung nur bei konfigurierten `[[mcp_servers]]`. /
  MCP client (stdio/http): UltraCode now connects external tools over the Model Context
  Protocol (`packages/core/src/mcp/`) — transport (stdio/HTTP), a JSON-RPC layer, an
  `McpClient` and a tool adapter that registers discovered MCP tools into the tool registry;
  wired only when `[[mcp_servers]]` are configured.
- **Custom-/OpenAI-kompatibler Provider (inkl. LM Studio)**: Ein zusätzlicher Provider für
  beliebige OpenAI-kompatible Endpunkte mit konfigurierbarer Base-URL (`CustomProvider`),
  wodurch lokale/self-hosted Backends wie **LM Studio**, vLLM oder OpenRouter neben den
  Katalog-Providern (Anthropic/OpenAI/Mistral/lokal) nutzbar sind. /
  Custom / OpenAI-compatible provider (incl. LM Studio): an additional provider for any
  OpenAI-compatible endpoint with a configurable base URL (`CustomProvider`), enabling
  local/self-hosted backends such as **LM Studio**, vLLM or OpenRouter alongside the catalog
  providers (Anthropic/OpenAI/Mistral/local).
- **Projektlokaler Laufzeit-Loader für Skills und Agenten**: UltraCode lädt Skills
  und Agenten jetzt zusätzlich zum Home-Store (`~/.ultracode/`) aus dem projektlokalen
  Verzeichnis `<cwd>/.ultracode/` — Skills aus `.ultracode/skills/<name>/SKILL.md`,
  Agenten aus `.ultracode/agents/<name>.md`; der projektlokale Store hat Vorrang. Ein
  Frontmatter-Adapter akzeptiert leichtgewichtiges Frontmatter (`name` + `description`)
  und füllt Pflichtfelder mit Defaults; ein Agenten-Body wird als additiver
  `systemPrompt` übernommen. Ein Schreib-Guard hält die Autoring-Schreibpfade auf den
  Home-Store, und das Anti-Riesendatei-Gate `pnpm check:filesize`
  (`scripts/check-file-size.sh`) begrenzt die Dateigröße. Hooks bleiben ungenutzt (kein
  Produkt-Hook-Runtime); Begründung: ADR 0002. /
  Project-local runtime loader for skills and agents: UltraCode now loads skills and
  agents from the project-local directory `<cwd>/.ultracode/` in addition to the home
  store (`~/.ultracode/`) — skills from `.ultracode/skills/<name>/SKILL.md`, agents from
  `.ultracode/agents/<name>.md`; the project-local store takes precedence. A frontmatter
  adapter accepts lightweight frontmatter (`name` + `description`) and fills mandatory
  fields with defaults; an agent body is adopted as an additive `systemPrompt`. A write
  guard keeps the authoring write paths on the home store, and the anti-giant-file gate
  `pnpm check:filesize` (`scripts/check-file-size.sh`) caps file size. Hooks stay unused
  (no product hook runtime); rationale: ADR 0002.
- **Deklarativer Provider-Katalog** (`PROVIDER_CATALOG`): Single Source of Truth
  für die eingebauten LLM-Provider (id, Wire-Familie, Key-Pflicht, Env-Var,
  Base-URL). Factory, Key-Gate und Env-Mapping leiten sich daraus ab; ein
  Contract-Test (`catalog.test.ts`) macht Drift zwischen Katalog, Factory,
  `ProviderName`-Union und Env-Mapping zum Testfehler. /
  Declarative provider catalog as single source of truth; factory, key gate and
  env mapping derive from it, a contract test turns drift into a test failure.
- **SIMO Release Management**: Pflicht-Artefakte `VERSION` und `.release.json`
  ergänzt; Konsistenz-Gate `scripts/release-check.sh` (VERSION ↔ package.json ↔
  `.release.json` ↔ CHANGELOG) und Bump-Helfer `scripts/release.sh` (Lock-Step). /
  Added the mandatory `VERSION` and `.release.json` artifacts, a consistency gate
  and a lock-step release bump helper.
- **Tooling**: Biome (Lint + Format) mit `husky`/`lint-staged`-Pre-Commit; lokaler
  CI-Spiegel `scripts/ci.sh` (`pnpm ci:local`); Suppression-Gate gegen
  `@ts-ignore`/`@ts-nocheck`; `pnpm audit` als CI-Job. /
  Biome lint+format with a pre-commit gate, a local CI mirror, a TS-suppression
  gate and a dependency-audit CI job.
- **CI**: dedizierter e2e-Job und JUnit-Testreport. / Dedicated e2e job and JUnit report.
- **Entwicklungsstandards & Agenten**: sechs Projekt-Skills (`.ultracode/skills/`:
  clean-code, release-management, test-management, dev-workflow,
  documentation-management, iteration-quality-gates), fünf Repo-Entwicklungs-
  Agenten (`.ultracode/agents/`), Leitdokument `ULTRACODE.md` (Root) sowie ADR- und
  Lessons-Learned-Struktur (`docs/decisions/`, `docs/lessons-learned/`) mit
  Einstieg `docs/DEVELOPMENT/standards.md`. Der Skill `iteration-quality-gates`
  verlangt zu Beginn jeder Umsetzung eine detaillierte Anforderungserfragung und
  iteriert gegen die Qualitäts-Gates bis zur Umsetzungserreichung. /
  Six project skills, five repo development agents, the root `ULTRACODE.md` guide
  and an ADR/lessons-learned structure with `docs/DEVELOPMENT/standards.md` as
  the entry point. The `iteration-quality-gates` skill requires a detailed
  requirements elicitation at the start of each implementation and iterates
  against the quality gates until all acceptance criteria are met.

### Geändert / Changed
- **Vollständige Anbieter-Unabhängigkeit der Assistenz-Ebene**: Die
  Assistent-Konfiguration liegt jetzt durchgängig im UltraCode-Namensraum
  (`.ultracode/`, Leitdokument `ULTRACODE.md`, Env-Variable `ULTRACODE_PROJECT_DIR`); Hooks,
  Settings und Doku sind produktneutral (der frühere anbieterspezifische
  Migrationsguide wurde zum generischen `docs/INTEGRATION/assistant-migration.md`
  verallgemeinert). Einzige zulässige Anbieter-Nennung ist der Anthropic-LLM-
  Provider (API-Key, Modell-IDs). Ein Branding-Gate (`scripts/check-branding.sh`,
  `pnpm check:branding`, CI-Job `branding`) erzwingt dies dauerhaft. /
  Made the assistant layer fully vendor-independent: all assistant configuration
  now lives under the UltraCode namespace (`.ultracode/`, `ULTRACODE.md`, `ULTRACODE_PROJECT_DIR`),
  with hooks, settings and docs made product-neutral (the former vendor-specific
  migration guide was generalized to `assistant-migration.md`). The only
  permitted vendor mention is the Anthropic LLM provider, enforced by a branding
  gate.
- **Migration von GitHub nach GitLab**: `origin`, CI (GitHub Actions → GitLab CI,
  npm-Publish-Job) und alle Repo-URLs auf `gitlab.simo-online.com/simo/ultracode-ai`. /
  Migrated the project from GitHub to GitLab (remote, CI and all repository URLs).

### Behoben / Fixed
- JUnit-Report wurde trotz CI-Deklaration nie erzeugt; das e2e-Test-Projekt lief in
  keinem dedizierten CI-Job. / The declared JUnit report was never produced and the
  e2e project ran in no dedicated CI job.
- CLI-UI-Tests waren farb-instabil: eine Shell mit `FORCE_COLOR` ließ Ink ANSI-Codes
  rendern und 6 Text-Assertions scheitern; das cli-Testprojekt pinnt Farben jetzt aus. /
  CLI UI tests were colour-unstable under a `FORCE_COLOR` shell; the cli test project
  now pins colours off.

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
