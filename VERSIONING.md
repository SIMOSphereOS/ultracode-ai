# UltraCode Versionierungs- und Release-Policy

## Grundsätze

- **SemVer 2.0** für alle Module und das Gesamtsystem.
- **Jedes Modul ist eigenständig versioniert** (`packages/*/package.json` + eigener `CHANGELOG.md`):
  - `@ultracode/shared`
  - `@ultracode/core`
  - `ultracode` (CLI)
- Das **Root-`CHANGELOG.md`** dokumentiert Releases des Gesamtsystems (Monorepo-Tag `vX.Y.Z`).

## Bump-Regeln (pro Modul)

| Auslöser | Bump |
|---|---|
| Korrektur / Bugfix / Audit-Fix | **patch** |
| Neue Funktionalität, Änderung ohne Bruch | **minor** |
| Breaking Change / Major-Anpassung | **major** |
| Erfolgreicher End2End-Integrationstest in bester Qualität | Gesamtsystem-Release (Tag + GitHub Release via `gh`) |

## Ablauf eines Releases

1. Modul-Changelogs pflegen (`Unreleased` → Versionsabschnitt mit Datum).
2. Modulversionen in `package.json` bumpen.
3. Root-`CHANGELOG.md` aktualisieren (aggregiert die Modulstände).
4. Commit `chore(release): vX.Y.Z` + Git-Tag `vX.Y.Z`.
5. `gh release create vX.Y.Z` mit Release Notes aus dem Root-Changelog.

## Qualitäts-Gates vor einem Release

- Build grün (`pnpm build`), alle Unit-Tests grün (`pnpm test`), E2E grün (`pnpm test:e2e`).
- Deep-Audit: **NULL bestätigte High- und Medium-Befunde** (Critical ohnehin null). Verbleibende Low/Info dokumentiert.
- **Qualitäts-Score ≥ 99/100** (Stufe-1-Direktive Andreas, 2026-06-11).
- Cross-Platform-Kompatibilität: Linux, macOS, Windows (keine Unix-only-Annahmen).
