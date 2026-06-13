# Changelog — ultracode (CLI)

All notable changes to the `ultracode` CLI package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer 2.0](https://semver.org/). Aligned to the monorepo `1.3.0` production-ready milestone.

## [Unreleased]

## [1.3.0] - 2026-06-13

### Changed
- **`doctor`** enforces the real supported runtime: `MIN_NODE_MAJOR=22` / `MIN_NODE_MINOR=13` (matching `engines.node >= 22.13.0`) instead of the prior Node 20 floor; the corresponding docs are corrected to `>= 22.13`.
- The CLI entry suppresses only the noisy `node:sqlite` `ExperimentalWarning` (all other warnings pass through), and guards top-level auto-run behind an `isMainModule()` check so the module is importable in tests.

### Packaging
- Added `files`, `repository`, `homepage`, `bugs`, `prepublishOnly` and a package `README`/`LICENSE`; internal deps use `workspace:^` for correct publish-time replacement. Published via the new monorepo `publish.yml` on `v*` tags.

## [1.1.0] - 2026-06-12

### Added
- New command surfaces consuming the extended UltraCode facade: `budget` (plan/show/set/status/history), `skills` (list/show/create/test/upgrade), `agents` (create/evolve/test), `learn` (sources list/add/remove, run, schedule). `learn run` always prints the cost report first and starts only after explicit approval (--yes or interactive JA); without a TTY and without --yes it aborts with a hint. All read commands support --json.

## [1.0.1] - 2026-06-12

### Changed
- Declared `engines.node >= 22.13.0` to match the real supported runtime.

## [1.0.0] - 2026-06-11

### Changed
- Stable 1.0.0: CLI command surface frozen — `run`, `config`, `tools`/`agents list`, `version`, `release`, `quality`, `doctor`, `--setup` and the interactive Ink UI.


## [0.2.1] - 2026-06-11

### Fixed
- CLI streaming callback now consumes real `CompletionChunk`s instead of the temporary ambient stub's `string` signature; the stub (`src/types/core-facade.d.ts`) was removed now that `@ultracode/core` type declarations are built.

## [0.2.0] - 2026-06-11

### Added
- `ultracode` CLI entry point with commander-based dispatch, global error boundary (UltraCodeError → red message + exit 1, unknown errors → `--debug` hint) and `process.exitCode`-only exit handling.
- Non-interactive commands: `run -p/--print` (live chunk streaming, `--agent`, `--json`), `config show|get|set|validate|export|import` (secret-masked show, ConfigManager-backed mutations saved to the user layer), `tools list` / `agents list` (tables + `--json`), `version analyze|suggest`, `release plan`, `quality` (exit 1 on failing gates) and an offline `doctor` (Node >= 20, git probe, config-dir writability, config validation, masked API-key presence, terminal capabilities).
- Interactive Ink UI: chat transcript with live streaming, input history (Up/Down), multiline input (Ctrl+J), slash commands (/help /agents /tools /config show /theme /clear /exit), Shift+Tab agent cycling, Esc cancellation via AbortController, double-Ctrl+C exit, tool-execution feed and a status bar (agent, model, session, token usage).
- `--setup` interactive wizard with masked API-key input; persists provider/agent/theme via the config manager and writes API keys to `~/.ultracode/.env` (mode 0600).
- Theme system with `dark`, `light` and `dracula` colour-token themes and a ThemeManager with guaranteed dark fallback.
- Cross-platform path handling (`node:path`, `resolveHome` tilde expansion for shared constants, CRLF-tolerant file parsing).
- Temporary ambient declaration for the not-yet-built `@ultracode/core` facade (`src/types/core-facade.d.ts`) and a lazy core loader so non-interactive startup never pays the Ink/React import cost.
- 160 offline, deterministic Vitest tests covering command routing, JSON output validity, streaming, abort signals, doctor edge cases (Node 18/20/22, missing git), 1 MB inputs, Unicode/emoji handling and Ink component behaviour via ink-testing-library.

## [0.1.0] - 2026-06-11

### Added

- Package scaffold within the UltraCode monorepo (strict TypeScript ESM, vitest)
