# Changelog — @ultracode/shared

All notable changes to the `@ultracode/shared` package. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer 2.0](https://semver.org/). Aligned to the monorepo `1.3.0` production-ready milestone.

## [Unreleased]

## [1.3.0] - 2026-06-13

### Packaging
- Version aligned to the `1.3.0` release train. Added `publishConfig.access: public`, `files`, `repository`, `homepage`, `bugs`, `prepublishOnly` and a package `README`/`LICENSE` so the contract layer is independently publishable to npm. No API changes.

## [1.0.1] - 2026-06-12

### Changed
- Declared `engines.node >= 22.13.0` to match the real supported runtime.

## [1.0.0] - 2026-06-11

### Changed
- Stable 1.0.0: contract layer (types, errors, EventBus, utils) API frozen.


## [0.2.1] - 2026-06-11

### Fixed
- `deepMerge`/`clonePlain`: reject cyclic references and trees deeper than `MAX_MERGE_DEPTH` (100) with a controlled `ValidationError` instead of a `RangeError`/stack overflow (documented in CONTRACTS.md).

## [0.2.0] - 2026-06-11

### Added

- Complete contract layer: error hierarchy (`UltraCodeError` + 9 domain errors), tool/provider/agent/config/memory/versioning/event type contracts
- `EventBus` with handler error isolation, `ConsoleLogger`/`NoopLogger`
- Utilities: `serializeError`, unicode-safe `truncate`, prototype-pollution-safe `deepMerge`, `sleep` (abortable), `clamp`, `generateId`
- `DEFAULT_CONFIG` matching the documented configuration reference, `CONTRACTS.md` implementation guide
- 86 unit tests incl. extreme values (1M-char strings, surrogate pairs, `__proto__` attack vectors, throwing event handlers)

## [0.1.0] - 2026-06-11

### Added

- Package scaffold within the UltraCode monorepo (strict TypeScript ESM, vitest)
