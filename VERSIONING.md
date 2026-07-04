# UltraCode AI Versionierungs- und Release-Policy

> Folgt dem **SIMO Release Management**-Standard (`simo-release-management`),
> abgebildet auf das Monorepo und die GitLab-Infrastruktur dieses Projekts.
> Kein Release ohne Version, kein Version-Bump ohne CHANGELOG, kein CHANGELOG ohne Inhalt.

Die Schritt-für-Schritt-Prozessanleitung zu dieser Policy liefert der Projekt-Skill
[`release-management`](./.uc-ai/skills/release-management/SKILL.md); der Agent
[`release-manager`](./.uc-ai/agents/release-manager.md) führt Prüfung und Bump aus. /
The step-by-step process guide for this policy is the project skill
`release-management`; the `release-manager` agent runs the check and the bump.

## Grundsätze

- **SemVer 2.0** für alle Module und das Gesamtsystem.
- **Lock-Step-Monorepo**: `ultracode-shared`, `ultracode-core` und `ultracode-ai` (CLI)
  tragen stets **dieselbe** Version wie die System-Version in `VERSION`.
- Das **Root-`CHANGELOG.md`** dokumentiert die Releases des Gesamtsystems
  (Monorepo-Tag `vX.Y.Z`), zweisprachig (DE + EN, Keep a Changelog).

## Pflicht-Artefakte (SIMO-Standard)

| Datei | Zweck |
|---|---|
| `VERSION` | Aktuelle System-Version (eine Zeile, z. B. `1.3.1`) |
| `.release.json` | Release-Konfiguration (Kanäle, Publish, Hooks) |
| `CHANGELOG.md` | Änderungshistorie (Keep a Changelog, DE + EN) |
| `UPGRADE.md` | Migrationsanleitung — **nur bei Major-Releases** |

Die Konsistenz dieser Artefakte wird per `scripts/release-check.sh` (lokal via
`pnpm release:check`, in CI als Job `release_consistency`) erzwungen: `VERSION`
muss mit allen `package.json`-Versionen, mit `.release.json` (`currentVersion`)
und mit einem CHANGELOG-Abschnitt übereinstimmen.

## Bump-Regeln

| Auslöser | Bump |
|---|---|
| Korrektur / Bugfix / Audit-Fix | **patch** |
| Neue Funktionalität, Änderung ohne Bruch | **minor** |
| Breaking Change / Major-Anpassung | **major** |
| `docs:` / `style:` / `refactor:` / `test:` / `ci:` | kein Bump |

Der KI-gestützte Versionierungs-Kern von UltraCode (`ultracode-ai version suggest`,
`ultracode-ai release plan`) leitet einen Bump-Vorschlag deterministisch aus den
Git-Commits ab; die SIMO-Artefakte oben halten die Entscheidung fest und erzwingbar.

## Ablauf eines Releases

1. `scripts/release.sh <major|minor|patch|X.Y.Z>` ausführen — schreibt `VERSION`,
   `.release.json` und alle `package.json` (Lock-Step) und rollt `CHANGELOG.md`
   (`[Unreleased]` → `[X.Y.Z] - DATUM`). Der preRelease-Hook `pnpm ci:local` läuft mit.
2. Änderungen reviewen; bei Major zusätzlich `UPGRADE.md` pflegen.
3. `git commit -am "chore(release): vX.Y.Z"` + `git tag -a vX.Y.Z -m "…"`.
4. `git push --follow-tags` — der `v*`-Tag triggert die npm-Publikation (siehe unten).
5. GitLab-Release (optional): `glab release create vX.Y.Z -F <release-notes>` mit den
   Notes aus dem CHANGELOG-Abschnitt.

## npm-Veröffentlichung

Der Push eines Git-Tags `vX.Y.Z` ist zugleich der Auslöser für die npm-Publikation.

- Pipeline: **`.gitlab-ci.yml`**, Job `publish` (Stage `publish`), Regel `$CI_COMMIT_TAG =~ /^v\d+/`.
- Schritte: `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm -r publish --no-git-checks --access public`.
- Authentifizierung über die CI/CD-Variable **`NPM_TOKEN`** (protected + masked).
- Publizierte Pakete in dieser Reihenfolge: `ultracode-shared` → `ultracode-core` → `ultracode-ai` (CLI).
- **Workspace-Auflösung:** `workspace:^`-Abhängigkeiten werden von pnpm beim Publish auf die realen
  veröffentlichten Versionen umgeschrieben; die Tarballs enthalten **keine** `workspace:*`-Spezifizierer.
  Manuelle Verifikation vor einem Release: `pnpm --filter ultracode-ai pack` und die `package.json` im
  Tarball prüfen.
- Jedes publizierbare Paket bringt `dist`, `README.md` und `LICENSE` mit (`files`-Feld) und führt
  über `prepublishOnly` (`tsc -b`) einen Build vor der Veröffentlichung aus.

## Qualitäts-Gates vor einem Release

- Build grün (`pnpm build`), alle Unit-Tests grün (`pnpm test`), E2E grün (`pnpm test:e2e`),
  Lint/Format grün (`pnpm biome:ci`), keine unerlaubten TS-Suppressions (`pnpm check:suppressions`),
  Dependency-Audit sauber (`pnpm audit --audit-level=high`). Alles gebündelt in `pnpm ci:local`.
- Deep-Audit: **NULL bestätigte High- und Medium-Befunde** (Critical ohnehin null). Verbleibende Low/Info dokumentiert.
- **Qualitäts-Score ≥ 99/100** (Stufe-1-Direktive Andreas, 2026-06-11).
- Cross-Platform-Kompatibilität: Linux, macOS, Windows (keine Unix-only-Annahmen).
