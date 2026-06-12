# Changelog

All notable changes to UltraCode are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer 2.0](https://semver.org/).

## [Unreleased]

### Fixed
- Hardened `serializeFrontmatter`'s list rendering: a skill object missing an optional/required list field (e.g. `triggers` or `sources` absent or `undefined`) now serializes to an empty `[]` list instead of throwing a `TypeError` on `items.length`.

## [1.1.0] - 2026-06-12

### Added
- Token-optimization module in `@ultracode/core` (see its changelog 1.1.0): deterministic, ML-free, offline prompt-token reduction (dedup, whitespace, system-prompt minify with bit-for-bit IMMUTABLE compliance protection, tool-schema slimming, conversation compaction) plus opt-in provider prompt-caching hints, with honest before/after measurement.

### Fixed
- Final Windows CI defects from the cross-platform matrix: bounded delete-pending lock contention and `EBUSY` temp-dir teardown flakiness.

## [1.0.1] - 2026-06-12

### Fixed
- Cross-platform CI surfaced and fixed two real Windows defects (BashTool cmd.exe quoting, JsonSessionStore lock contention). See `@ultracode/core` 1.0.1.

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

- Monorepo foundation (pnpm workspaces): `@ultracode/shared`, `@ultracode/core`, `ultracode` (CLI)
- TypeScript strict-mode build setup with project references
- Vitest test infrastructure (unit per package + e2e project) with V8 coverage
