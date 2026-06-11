# Changelog — ultracode (CLI)

All notable changes to the `ultracode` CLI package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer 2.0](https://semver.org/). Versioned independently from the monorepo release.

## [Unreleased]

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
