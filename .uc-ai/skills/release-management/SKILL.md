---
name: release-management
description: "DE: Verbindlicher Release-Prozess für ultracode-ai — SemVer-Entscheidungsbaum (inkl. KI-Empfehlung 'ultracode-ai version suggest'), Lock-Step-Bump via 'pnpm release', Konsistenz-Gate 'pnpm release:check' (CI-Job release_consistency), zweisprachiges CHANGELOG nach Keep a Changelog, v*-Tag → npm-Publish via GitLab CI, Hotfix, Pre-Releases (alpha/beta/rc), Breaking Changes mit UPGRADE.md. Trigger: Release, Version, Version-Bump, Versionierung, CHANGELOG, SemVer, Tag, veröffentlichen, npm publish, Hotfix, Breaking Change, Deprecation. / EN: Binding release process for ultracode-ai — SemVer decision tree (incl. the AI suggestion 'ultracode-ai version suggest'), lock-step bump via 'pnpm release', consistency gate 'pnpm release:check' (CI job release_consistency), bilingual Keep-a-Changelog CHANGELOG, v* tag → npm publish via GitLab CI, hotfixes, pre-releases (alpha/beta/rc), breaking changes with UPGRADE.md. Triggers: release, version, version bump, changelog, semver, tag, publish, npm publish, hotfix, breaking change, deprecation, yanked."
---

# Release Management — ultracode-ai

**DE:** Dieser Skill ist die verbindliche Prozess-Anleitung für jedes Release von UltraCode. Die normative Referenz der Regeln ist **`VERSIONING.md`** im Repo-Root — bei Detailfragen (Bump-Regeln, npm-Metadaten, Qualitäts-Gates) gilt sie als Quelle der Wahrheit; dieser Skill beschreibt, *wie* man den Prozess Schritt für Schritt ausführt. Kein Release ohne Version, kein Version-Bump ohne CHANGELOG, kein CHANGELOG ohne Inhalt.

**EN:** This skill is the binding process guide for every UltraCode release. The normative reference for the rules is **`VERSIONING.md`** in the repo root — for detailed questions (bump rules, npm metadata, quality gates) it is the source of truth; this skill describes *how* to execute the process step by step. No release without a version, no version bump without a CHANGELOG, no CHANGELOG without content.

## Skill Contract

- **Reads / Liest:** `VERSION`, `.release.json`, `CHANGELOG.md`, `VERSIONING.md`, Git-History, `.gitlab-ci.yml`
- **Writes / Schreibt:** `VERSION`, `.release.json`, `package.json` ×4, `CHANGELOG.md`, `UPGRADE.md` (nur bei Major / major only), Git-Tags `vX.Y.Z`
- **Done when / Fertig wenn:** `pnpm release:check` grün, CI-Pipeline grün, `v*`-Tag gepusht, npm-Publish erfolgreich
- **Agent:** Der Agent **`release-manager`** (`.uc-ai/agents/release-manager.md`) führt diesen Prozess autonom aus / The **`release-manager`** agent executes this process autonomously

---

## Release-Artefakte / Release Artifacts

**DE:** Vier Dateien tragen den Release-Zustand — sie dürfen nie auseinanderdriften (das Gate erzwingt das, siehe unten).
**EN:** Four files carry the release state — they must never drift apart (the gate enforces this, see below).

| Datei / File | Inhalt / Content |
|---|---|
| `VERSION` | System-Version, eine Zeile (z. B. `1.3.1`) / system version, single line |
| `.release.json` | Release-Konfiguration: `currentVersion`, Lock-Step-Pakete, Kanäle, Publish-Setup, `preRelease`-Hook `pnpm ci:local` |
| `CHANGELOG.md` | Zweisprachige Änderungshistorie (Keep a Changelog) / bilingual change history |
| `UPGRADE.md` | Migrationsanleitung — **nur bei Major-Releases** / migration guide — **major releases only** |

**DE:** Lock-Step-Monorepo: `packages/shared`, `packages/core`, `packages/cli` und das Root-`package.json` tragen immer exakt dieselbe Version wie `VERSION`.
**EN:** Lock-step monorepo: `packages/shared`, `packages/core`, `packages/cli` and the root `package.json` always carry exactly the same version as `VERSION`.

---

## Schritt 1 — SemVer-Entscheidung / Step 1 — SemVer Decision

### KI-Empfehlung / AI Suggestion

**DE:** UltraCode bringt seinen eigenen Versionierungs-Kern mit. Vor jedem Release die KI-Empfehlung einholen — sie leitet den Bump deterministisch aus den Git-Commits ab:
**EN:** UltraCode ships its own versioning core. Get the AI suggestion before every release — it derives the bump deterministically from the git commits:

```bash
ultracode-ai version analyze    # Änderungen analysieren / analyze the changes
ultracode-ai version suggest    # Bump-Empfehlung (patch|minor|major) / bump suggestion
ultracode-ai release plan       # Release-Plan-Entwurf / draft release plan
ultracode-ai quality            # Qualitäts-Gates (Exit 1 bei Verstoß) / quality gates (exit 1 on failure)
```

**DE:** Im Repo ohne globale Installation: erst `pnpm build`, dann `node packages/cli/dist/index.js version suggest` (usw.) — das `bin` heißt `ultracode-ai` und steht erst nach `npm install -g` bereit.
**EN:** Inside the repo without a global install: run `pnpm build` first, then `node packages/cli/dist/index.js version suggest` (etc.) — the `bin` is named `ultracode-ai` and is only available after `npm install -g`.

**DE:** Die Empfehlung ist ein Vorschlag — die Entscheidung trifft der Mensch (bzw. der Agent `release-manager` mit Begründung im Report). Bei Abweichung von der Empfehlung: Grund im Release-Commit oder MR dokumentieren.
**EN:** The suggestion is a proposal — the human decides (or the `release-manager` agent, with reasoning in its report). When deviating from the suggestion, document the reason in the release commit or MR.

### Entscheidungsbaum / Decision Tree

```
Enthält [Unreleased] einen Breaking Change (API-Bruch, entferntes Feature,
inkompatible CLI-Flags/Konfiguration)?
  Ja/Yes → MAJOR (1.3.1 → 2.0.0) — UPGRADE.md ist Pflicht / mandatory
  Nein/No →
    Neue Funktionalität, rückwärtskompatibel? / New backwards-compatible functionality?
      Ja/Yes → MINOR (1.3.1 → 1.4.0)
      Nein/No →
        Bugfix, Security-Patch, Audit-Fix? / Bugfix, security patch, audit fix?
          Ja/Yes → PATCH (1.3.1 → 1.3.2)
          Nein/No → docs/style/refactor/test/ci → KEIN Bump / NO bump
```

**DE:** Die Bump-Tabelle in `VERSIONING.md` ist maßgeblich; dieser Baum ist ihre Anwendung. Wichtig: Der Bump richtet sich nach dem **gesamten Inhalt von `[Unreleased]`**, nicht nach dem letzten Commit — ein einziger Breaking-Eintrag macht das ganze Release zum Major.
**EN:** The bump table in `VERSIONING.md` is authoritative; this tree is its application. Important: the bump is determined by the **entire content of `[Unreleased]`**, not by the last commit — a single breaking entry makes the whole release a major.

---

## Schritt 2 — Lock-Step-Bump / Step 2 — Lock-Step Bump

```bash
pnpm release patch          # oder / or: minor | major | 1.4.0 (explizit / explicit)
pnpm release minor --no-verify   # Hook überspringen — NUR wenn ci:local separat läuft
                                 # skip hook — ONLY if ci:local runs separately
```

**DE:** `scripts/release.sh` erledigt in einem Lauf:
**EN:** `scripts/release.sh` does in one run:

1. Neue Version ermitteln (Bump aus `VERSION` oder explizites `X.Y.Z`) / determine the new version
2. `VERSION`, `.release.json` (`currentVersion`) und **alle vier** `package.json` schreiben — Lock-Step / write all four `package.json` files — lock-step
3. `CHANGELOG.md` rollen: `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD`, neues leeres `[Unreleased]` darüber / roll the changelog, fresh empty `[Unreleased]` on top
4. preRelease-Hook **`pnpm ci:local`** ausführen (lokaler CI-Spiegel `scripts/ci.sh`), außer bei `--no-verify` / run the preRelease hook unless `--no-verify`

**DE:** Das Script macht **bewusst keinen Commit und keinen Tag** — erst Review, dann Git (Schritt 4). Vor dem Bump muss `[Unreleased]` inhaltlich vollständig und kundenlesbar sein; das Script prüft nur, dass der Abschnitt existiert.
**EN:** The script **deliberately makes no commit and no tag** — review first, then git (step 4). Before the bump, `[Unreleased]` must be complete and customer-readable; the script only checks that the section exists.

---

## Schritt 3 — Konsistenz-Gate / Step 3 — Consistency Gate

```bash
pnpm release:check    # scripts/release-check.sh — Exit 0 = konsistent, Exit 1 = Drift
```

**DE:** Geprüft wird: `VERSION` == `currentVersion` in `.release.json` == Version aller vier `package.json`, und `CHANGELOG.md` enthält sowohl `## [Unreleased]` als auch `## [VERSION]`. Dasselbe Gate läuft in CI als Job **`release_consistency`** (Stage `test`) bei **jedem** Push — Drift blockiert also jeden MR, nicht erst das Release.
**EN:** It verifies: `VERSION` == `currentVersion` in `.release.json` == the version of all four `package.json` files, and `CHANGELOG.md` contains both `## [Unreleased]` and `## [VERSION]`. The same gate runs in CI as the **`release_consistency`** job (stage `test`) on **every** push — so drift blocks every MR, not just the release.

**DE:** Regel: Versions-Felder **niemals von Hand** editieren — immer über `pnpm release`. Handedits sind die häufigste Drift-Ursache.
**EN:** Rule: **never** edit version fields by hand — always via `pnpm release`. Manual edits are the most common cause of drift.

---

## CHANGELOG-Regeln / CHANGELOG Rules (Keep a Changelog)

**DE:** Das Root-`CHANGELOG.md` ist das Release-Dokument des Gesamtsystems (Monorepo-Tag `vX.Y.Z`). Es gilt der SIMO-Standard:
**EN:** The root `CHANGELOG.md` is the release document of the whole system (monorepo tag `vX.Y.Z`). The SIMO standard applies:

1. **Zweisprachig / Bilingual** — jeder Eintrag DE + EN, beide idiomatisch (Muster: deutscher Satz, ` / `, englischer Satz — wie im bestehenden CHANGELOG-Kopf).
2. **`[Unreleased]`-Pflicht** — der Abschnitt existiert immer; jede kundenwirksame Änderung landet dort **im selben MR** wie der Code. / The section always exists; every customer-visible change lands there **in the same MR** as the code.
3. **Kategorien / Categories:** `Hinzugefügt / Added`, `Geändert / Changed`, `Veraltet / Deprecated`, `Entfernt / Removed`, `Behoben / Fixed`, `Sicherheit / Security`.
4. **ISO-Datum** — `## [1.4.0] - 2026-07-03`, neueste Version oben / newest version on top.
5. **Kundenlesbar / Customer-readable** — was sich für Nutzer ändert, nicht wie der Code aussieht. Issue-/MR-Referenzen (`#123`, `!45`) wo vorhanden. / What changes for users, not how the code looks. Reference issues/MRs where available.
6. **YANKED** — zurückgezogene Releases markieren, nie löschen: `## [1.4.1] - 2026-07-03 [YANKED]` (+ Grund als Zeile darunter / + reason on the line below). Zusätzlich `npm deprecate` für die betroffenen Paket-Versionen.

---

## Schritt 4 — Git, Tag & npm-Publish / Step 4 — Git, Tag & npm Publish

**DE:** Direkter Push auf `main` ist blockiert — der Release-Commit geht wie jede Änderung über einen Merge Request (`glab`). Der `v*`-Tag wird nach dem Merge auf den `main`-Stand gesetzt.
**EN:** Direct pushes to `main` are blocked — the release commit goes through a merge request (`glab`) like any other change. The `v*` tag is placed on `main` after the merge.

```bash
# 1) Release-Branch + Commit / release branch + commit
git switch -c release/v1.4.0
pnpm release minor && pnpm release:check
git commit -am "chore(release): v1.4.0

Co-Authored-By: SIMO GmbH, Aschaffenburg, Bavaria Germany"
git push -u origin release/v1.4.0
glab mr create --fill --target-branch main

# 2) Nach dem Merge: Tag auf main / after the merge: tag on main
git switch main && git pull
git tag -a v1.4.0 -m "Release v1.4.0"
git push origin v1.4.0

# 3) Optional: GitLab-Release mit Notes aus dem CHANGELOG-Abschnitt
glab release create v1.4.0 --notes "$(sed -n '/^## \[1.4.0\]/,/^## \[/p' CHANGELOG.md | sed '$d')"
```

**DE:** Der Tag-Push triggert in `.gitlab-ci.yml` den Job **`publish`** (Stage `publish`, Regel `$CI_COMMIT_TAG =~ /^v\d+/`): `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm -r publish --no-git-checks --access public`, authentifiziert über die CI/CD-Variable **`NPM_TOKEN`** (protected + masked). Publiziert wird in der Reihenfolge `ultracode-shared` → `ultracode-core` → `ultracode-ai` (CLI); pnpm schreibt `workspace:^`-Abhängigkeiten beim Publish auf die realen Versionen um. Verifikation vorab: `pnpm --filter ultracode-ai pack` und die `package.json` im Tarball prüfen.
**EN:** The tag push triggers the **`publish`** job in `.gitlab-ci.yml` (stage `publish`, rule `$CI_COMMIT_TAG =~ /^v\d+/`): `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm -r publish --no-git-checks --access public`, authenticated via the **`NPM_TOKEN`** CI/CD variable (protected + masked). Publish order is `ultracode-shared` → `ultracode-core` → `ultracode-ai` (CLI); pnpm rewrites `workspace:^` dependencies to the real versions at publish time. Verify beforehand: `pnpm --filter ultracode-ai pack` and inspect the `package.json` in the tarball.

---

## Hotfix-Prozess / Hotfix Process

**DE:** Für kritische Fehler in der veröffentlichten Version — gleicher Prozess, minimaler Scope:
**EN:** For critical bugs in the published version — same process, minimal scope:

1. Branch vom letzten Release-Tag bzw. `main`: `git switch -c hotfix/v1.4.1 v1.4.0` / branch off the last release tag (or `main` if identical)
2. Fix + Regressionstest implementieren (Skill **`test-management`**: erst roter Test, dann Fix) / implement fix + regression test (red test first)
3. CHANGELOG unter `[Unreleased]` → `Behoben / Fixed` (oder `Sicherheit / Security`) ergänzen
4. `pnpm release patch` → `pnpm release:check` → MR → Merge → Tag `v1.4.1` → Publish (automatisch)
5. **Nichts anderes mitnehmen** — ein Hotfix enthält genau den Fix, keine wartenden Features / a hotfix contains exactly the fix, no pending features
6. Root Cause nach DNA-Regel dokumentieren (`docs/lessons-learned/`) / document the root cause

---

## Pre-Releases (alpha / beta / rc)

| Phase | Format | Zweck / Purpose |
|---|---|---|
| Alpha | `2.0.0-alpha.1` | Frühe Validierung, instabil / early validation, unstable |
| Beta | `2.0.0-beta.1` | Feature-complete, aktives Testing / feature-complete, active testing |
| RC | `2.0.0-rc.1` | Release-Kandidat, nur noch kritische Fixes / release candidate, critical fixes only |

**DE:** Der konfigurierte Preview-Kanal in `.release.json` nutzt den Suffix **`rc`**. Wichtig: `scripts/release.sh` leitet aus `major|minor|patch` **kein** Pre-Release-Suffix ab — für einen Pre-Release ist die vollständige Version explizit zu übergeben. `pnpm release 2.0.0-rc.1` läuft dabei sauber durch (das Glob-Pattern `[0-9]*.[0-9]*.[0-9]*` in `scripts/release.sh` akzeptiert Suffix-Versionen und schreibt sie 1:1 in alle Artefakte), das Script **validiert den Suffix aber nicht** — nach jedem Pre-Release-Bump zwingend `pnpm release:check` ausführen. **Achtung:** Der `publish`-Job matcht auch `v2.0.0-rc.1` (Regel `^v\d+`) und setzt **keinen npm dist-tag** — ein Pre-Release-Tag würde daher als `latest` publiziert. Vor dem Push eines Pre-Release-Tags: Publish-Verhalten klären und den dist-tag danach von Hand korrigieren, z. B. `npm dist-tag add ultracode-ai@2.0.0-rc.1 rc`.
**EN:** The configured preview channel in `.release.json` uses the **`rc`** suffix. Important: `scripts/release.sh` derives **no** pre-release suffix from `major|minor|patch` — for a pre-release you must pass the full version explicitly. `pnpm release 2.0.0-rc.1` then runs cleanly (the glob pattern `[0-9]*.[0-9]*.[0-9]*` in `scripts/release.sh` accepts suffixed versions and writes them verbatim into every artifact), but the script does **not validate the suffix** — always run `pnpm release:check` after every pre-release bump. **Caution:** the `publish` job also matches `v2.0.0-rc.1` (rule `^v\d+`) and sets **no npm dist-tag** — so a pre-release tag would publish as `latest`. Before pushing a pre-release tag, clarify the publish behaviour and fix the dist-tag by hand afterwards, e.g. `npm dist-tag add ultracode-ai@2.0.0-rc.1 rc`.

---

## Breaking Changes & Deprecation

**DE:** Kein Feature wird ohne Vorwarnung entfernt. Pflicht-Ablauf:
**EN:** No feature is removed without prior warning. Mandatory sequence:

```
Minor N   (z. B. 1.5.0): als @deprecated markieren (TSDoc) + Laufzeit-Warnung
                          in CLI/Core + CHANGELOG "Veraltet / Deprecated"
Minor N+1 (z. B. 1.6.0): Warnung prominenter (CLI-Hinweis mit Migrationspfad)
Major     (z. B. 2.0.0): entfernen + CHANGELOG "Entfernt / Removed" + UPGRADE.md
```

### UPGRADE.md-Template

```markdown
# Upgrade Guide: v1.x → v2.0 / Upgrade-Anleitung: v1.x → v2.0

## Breaking Changes

### 1. <Änderung / change>
**Vorher / Before:** `ultracode-ai <alter Befehl / old command>`
**Nachher / After:** `ultracode-ai <neuer Befehl / new command>`
**Migration:** <konkrete Schritte, DE + EN / concrete steps, DE + EN>

### 2. <Konfigurationsänderung / config change>
**Vorher / Before:** <altes Format / old format>
**Nachher / After:** <neues Format / new format>
**Migration:** <Schritte / steps>

## Kompatibilität / Compatibility
- Node >= 22.13, Pakete im Lock-Step: ultracode-shared, ultracode-core, ultracode-ai (CLI)
- Alle drei npm-Pakete gemeinsam aktualisieren / update all three npm packages together

## Support
Fragen / questions: https://gitlab.simo-online.com/simo/ultracode-ai/-/issues
```

---

## Release-Checkliste / Release Checklist

### Pre-Release
- [ ] `ultracode-ai version suggest` eingeholt, Bump entschieden (Abweichung begründet) / AI suggestion obtained, bump decided (deviation justified)
- [ ] `[Unreleased]` vollständig, zweisprachig, kundenlesbar / complete, bilingual, customer-readable
- [ ] Bei Major: `UPGRADE.md` geschrieben, Deprecations aus Vor-Versionen abgearbeitet / for major: `UPGRADE.md` written, deprecations resolved
- [ ] `pnpm release <bump>` gelaufen (inkl. Hook `pnpm ci:local`) / ran incl. the `ci:local` hook
- [ ] `pnpm release:check` grün / green
- [ ] `pnpm --filter ultracode-ai pack` — Tarball-`package.json` ohne `workspace:*` / tarball free of `workspace:*` specifiers
- [ ] Qualitäts-Gates aus `VERSIONING.md` erfüllt (Audit-Befunde, Qualitäts-Score, Cross-Platform) / quality gates from `VERSIONING.md` met

### Release
- [ ] MR gemerged, CI-Pipeline auf `main` komplett grün: `install_and_build`, `unit_tests`, `e2e_tests`, `typecheck`, `lint`, `suppressions`, `release_consistency`, `coverage`, `audit`, `sast`, `secret_detection` / MR merged, full pipeline green on `main`
- [ ] Tag `vX.Y.Z` auf dem `main`-Merge-Commit erstellt und gepusht / tag created on the `main` merge commit and pushed
- [ ] `publish`-Job grün, Pakete auf npm sichtbar: `npm view ultracode-ai version` / publish job green, packages visible on npm
- [ ] GitLab-Release mit CHANGELOG-Notes erstellt (optional, empfohlen) / GitLab release with changelog notes (optional, recommended)

### Post-Release
- [ ] Installation verifiziert: `npx ultracode-ai@X.Y.Z --version` / installation verified
- [ ] Neues leeres `[Unreleased]` im CHANGELOG vorhanden (macht `pnpm release` automatisch) / fresh empty `[Unreleased]` present (done automatically)
- [ ] Bei Problemen: YANKED-Markierung + `npm deprecate` + Hotfix-Prozess / on problems: YANKED marker + `npm deprecate` + hotfix process
- [ ] Erkenntnisse in `docs/lessons-learned/` festgehalten / findings recorded

---

## Zusammenspiel / Interplay

| Baustein / Building block | Rolle / Role |
|---|---|
| Agent **`release-manager`** | Führt diesen Prozess autonom aus: Bump-Empfehlung prüfen, `pnpm release` + `release:check`, CHANGELOG-Qualität sichern, Checkliste abarbeiten, Report / executes this process autonomously |
| Agent **`dev-orchestrator`** | Bindet den `release-manager` am Ende eines Feature-Zyklus ein / involves the release manager at the end of a feature cycle |
| Skill **`dev-workflow`** | Branch-/MR-/Commit-Konventionen, `glab`-Nutzung / branch, MR and commit conventions |
| Skill **`test-management`** | Test-Gates vor dem Release (`pnpm test`, `pnpm test:e2e`, Coverage) / test gates before the release |
| Skill **`clean-code`** + Agent **`code-quality-reviewer`** | Code-Qualität vor dem Release-MR / code quality before the release MR |
| Skill **`documentation-management`** + Agent **`doc-curator`** | `docs/`-Aktualität, `UPGRADE.md`-Review / docs freshness, `UPGRADE.md` review |

## Referenzen / References

- `VERSIONING.md` — normative Versionierungs- und Release-Policy dieses Repos / normative policy of this repo
- `CHANGELOG.md`, `VERSION`, `.release.json` — Release-Artefakte / release artifacts
- `scripts/release.sh`, `scripts/release-check.sh`, `scripts/ci.sh` — Automatisierung / automation
- `.gitlab-ci.yml` — Jobs `release_consistency` und `publish` / the two release-relevant CI jobs
- Semantic Versioning: https://semver.org/ · Keep a Changelog: https://keepachangelog.com/
