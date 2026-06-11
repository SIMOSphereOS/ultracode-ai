# Changelog

All notable changes to UltraCode are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer 2.0](https://semver.org/).

## [Unreleased]

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
