---
name: dev-workflow
description: "DE: Standardisierte Entwicklungs-Vorgehensweise für ultracode-ai — verbindliche Phasen-Kaskade (Verstehen → Plan → TDD → Verifikation → Review → Release), Git-Workflow (Feature-Branch, Merge Request via glab, niemals direkt auf main), Quality-Gates (pnpm ci:local vor jedem Commit, pnpm release:check vor jedem Release), Definition of Done, systematisches Debugging und Delegation an Subagenten. Trigger: entwickeln, implementieren, Feature bauen, Bug fixen, debuggen, Vorgehen, Workflow, Branch anlegen, committen, Merge Request, MR erstellen, Definition of Done, wie anfangen, Phasen. EN: Standardized development workflow for ultracode-ai — mandatory phase cascade (understand → plan → TDD → verification → review → release), Git workflow (feature branch, merge request via glab, never push to main directly), quality gates (pnpm ci:local before every commit, pnpm release:check before every release), definition of done, systematic debugging and subagent delegation. Trigger: develop, implement, build feature, fix bug, debug, workflow, how to start, create branch, commit, merge request, open MR, definition of done, phases."
---

# Dev-Workflow — ultracode-ai

**DE:** Dieser Skill definiert die verbindliche Entwicklungs-Vorgehensweise für dieses Repository (TypeScript-Monorepo, pnpm workspaces: `packages/shared`, `packages/core`, `packages/cli`). Er gilt für jede Änderung — Feature, Bugfix, Refactoring, Doku, CI.
**EN:** This skill defines the mandatory development workflow for this repository (TypeScript monorepo, pnpm workspaces: `packages/shared`, `packages/core`, `packages/cli`). It applies to every change — feature, bugfix, refactoring, docs, CI.

## 1. Phasen-Kaskade / Phase Cascade

**DE:** Die Phasen laufen IMMER in dieser Reihenfolge. Kein Überspringen — auch nicht bei "kleinen" Änderungen. Wer eine Phase auslässt, bezahlt sie später doppelt.
**EN:** The phases ALWAYS run in this order. No skipping — not even for "small" changes. A skipped phase costs double later.

| # | Phase | DE | EN |
|---|-------|----|----|
| 1 | **Verstehen / Brainstorming** | Anforderung klären, Ist-Zustand im Code prüfen (nie annehmen), betroffene Packages identifizieren, Randfälle sammeln. | Clarify the requirement, verify actual code state (never assume), identify affected packages, collect edge cases. |
| 2 | **Plan** | Teilschritte, Testfälle und betroffene Dateien festlegen. Bei ≥2 unabhängigen Teilaufgaben: Parallelisierung planen (siehe Abschnitt 5). | Define steps, test cases and affected files. With ≥2 independent subtasks: plan parallelization (see section 5). |
| 3 | **TDD-Implementierung** | Test zuerst (rot), dann Implementierung (grün), dann Refactoring. Details und Konventionen: Skill `test-management`. Code-Qualität nach Skill `clean-code`. | Test first (red), then implementation (green), then refactor. Details and conventions: skill `test-management`. Code quality per skill `clean-code`. |
| 4 | **Verifikation** | `pnpm ci:local` ausführen (lokaler CI-Spiegel, `scripts/ci.sh`). Erst wenn alles grün ist, gilt die Arbeit als verifiziert — Behauptungen ohne Kommando-Output zählen nicht. | Run `pnpm ci:local` (local CI mirror, `scripts/ci.sh`). Only when everything is green is the work verified — claims without command output do not count. |
| 5 | **Review** | Review durch Agent `code-quality-reviewer` (wendet Skill `clean-code` an). Findings beheben oder begründet ablehnen. | Review by agent `code-quality-reviewer` (applies skill `clean-code`). Fix findings or reject them with justification. |
| 6 | **Release** | CHANGELOG `[Unreleased]` pflegen; Release selbst über Agent `release-manager` und Skill `release-management` (`pnpm release:check`, `pnpm release`, v*-Tag → npm-Publish). | Maintain CHANGELOG `[Unreleased]`; the release itself via agent `release-manager` and skill `release-management` (`pnpm release:check`, `pnpm release`, v* tag → npm publish). |

### Bugs: Systematisches Debugging / Systematic Debugging

**DE:** Bei Bugs, Testfehlern oder unerwartetem Verhalten gilt — kein Trial-and-Error:
1. **Lessons-learned zuerst prüfen** (`docs/lessons-learned/`, falls vorhanden auch `docs/decisions/`) — DNA "Fehler nur einmal": Wurde das Problem schon einmal gelöst?
2. **Root Cause vor Fix**: Fehler reproduzieren (idealerweise als failing Test in einem der Unit-Projekte `shared`/`core`/`cli` oder im Projekt `e2e`), Ursache isolieren, erst dann fixen.
3. **Nach dem Fix dokumentieren**: Root Cause und Lösung in `docs/lessons-learned/` festhalten, Regressionstest bleibt im Repo.

**EN:** For bugs, test failures or unexpected behavior — no trial and error:
1. **Check lessons learned first** (`docs/lessons-learned/`, also `docs/decisions/` if present) — DNA "mistakes only once": has this problem been solved before?
2. **Root cause before fix**: reproduce the failure (ideally as a failing test in one of the unit projects `shared`/`core`/`cli` or in the `e2e` project), isolate the cause, only then fix.
3. **Document after the fix**: record root cause and solution in `docs/lessons-learned/`; the regression test stays in the repo.

## 2. Git-Workflow (dieses Repo / this repo)

**DE:**
- **Niemals direkt auf `main`** — der Push ist serverseitig blockiert und lokal verhindert der Hook `guard-bash` (`.uc-ai/settings.json`) den Versuch. Immer Feature-Branch.
- **Branch-Präfixe:** `feat/` | `fix/` | `docs/` | `refactor/` | `test/` | `chore/` | `ci/` — z. B. `feat/version-suggest-json-output`; für Release-Vorbereitung und Hotfixes zusätzlich `release/` (z. B. `release/v1.4.0`) und `hotfix/` (z. B. `hotfix/v1.4.1`), siehe Skill `release-management`.
- **Commit-Konvention:** `feat|fix|docs|refactor|test|chore|ci: Beschreibung` plus Trailer in jeder Commit-Message:
  `Co-Authored-By: SIMO GmbH, Aschaffenburg, Bavaria Germany`
- **Merge Request via `glab`:** Remote ist `gitlab.simo-online.com/simo/ultracode-ai` (HTTPS nutzen, SSH hängt). MR anlegen mit `glab mr create --fill --target-branch main`.
- **Pipeline muss grün sein vor Merge:** alle Jobs der `.gitlab-ci.yml` — `install_and_build`, `unit_tests`, `e2e_tests`, `typecheck`, `lint`, `suppressions`, `release_consistency`, `coverage`, `sast`, `secret_detection`, `audit`. Status prüfen mit `glab ci status` bzw. `glab mr view`.

**EN:**
- **Never push to `main` directly** — the push is blocked server-side and locally the `guard-bash` hook (`.uc-ai/settings.json`) prevents the attempt. Always use a feature branch.
- **Branch prefixes:** `feat/` | `fix/` | `docs/` | `refactor/` | `test/` | `chore/` | `ci/` — e.g. `feat/version-suggest-json-output`; for release preparation and hotfixes additionally `release/` (e.g. `release/v1.4.0`) and `hotfix/` (e.g. `hotfix/v1.4.1`), see the `release-management` skill.
- **Commit convention:** `feat|fix|docs|refactor|test|chore|ci: description` plus this trailer in every commit message:
  `Co-Authored-By: SIMO GmbH, Aschaffenburg, Bavaria Germany`
- **Merge request via `glab`:** remote is `gitlab.simo-online.com/simo/ultracode-ai` (use HTTPS, SSH hangs). Create the MR with `glab mr create --fill --target-branch main`.
- **Pipeline must be green before merge:** all jobs in `.gitlab-ci.yml` — `install_and_build`, `unit_tests`, `e2e_tests`, `typecheck`, `lint`, `suppressions`, `release_consistency`, `coverage`, `sast`, `secret_detection`, `audit`. Check status with `glab ci status` or `glab mr view`.

## 3. Quality-Gates / Quality Gates

**DE:** Vor JEDEM Commit — nicht erst vor dem MR:

```bash
pnpm ci:local        # scripts/ci.sh — lokaler Spiegel der GitLab-Pipeline
```

Der lokale Spiegel fasst zusammen, was die Pipeline serverseitig prüft — alle zehn Schritte aus `scripts/ci.sh` in dieser Reihenfolge (`lint suppressions branding release typecheck build test e2e coverage audit`): Biome (`pnpm biome:ci`), Suppression-Gate (`pnpm check:suppressions`), Branding-Gate (`scripts/check-branding.sh` bzw. `pnpm check:branding`), Release-Konsistenz (`scripts/release-check.sh`), Typecheck (`pnpm typecheck`), Build (`pnpm build`), Unit-Tests (`pnpm test`), E2E-Tests (`pnpm test:e2e`), Coverage (`pnpm test:coverage`) und Dependency-Audit (`pnpm audit --audit-level=high`). Ein Detail zum Branding-Gate: `scripts/ci.sh` ruft es lokal noch mit `--allow-legacy` auf (toleriert übergangsweise verbliebene Legacy-Branding-Referenzen aus der laufenden Migration), während der CI-Job `branding` es **strikt ohne** diese Option fährt — lokal grün heißt hier also nicht automatisch CI-grün. Zusätzlich läuft husky/lint-staged als Pre-Commit-Hook — Biome-Fehler dort niemals mit `--no-verify` umgehen, sondern mit `pnpm lint:fix` beheben.

Der Release-Konsistenz-Check läuft in `ci:local` also bereits mit; vor JEDEM Release trotzdem erneut isoliert ausführen:

```bash
pnpm release:check   # scripts/release-check.sh — Lock-Step-Konsistenz VERSION, 4x package.json, .release.json, CHANGELOG
```

**EN:** Before EVERY commit — not just before the MR — run `pnpm ci:local` (see above). It mirrors what the pipeline checks server-side — all ten steps from `scripts/ci.sh`, in this order (`lint suppressions branding release typecheck build test e2e coverage audit`): Biome (`pnpm biome:ci`), the suppression gate (`pnpm check:suppressions`), the branding gate (`scripts/check-branding.sh` / `pnpm check:branding`), release consistency (`scripts/release-check.sh`), typecheck (`pnpm typecheck`), build (`pnpm build`), unit tests (`pnpm test`), e2e tests (`pnpm test:e2e`), coverage (`pnpm test:coverage`) and the dependency audit (`pnpm audit --audit-level=high`). One detail about the branding gate: `scripts/ci.sh` still invokes it locally with `--allow-legacy` (temporarily tolerating leftover legacy branding references from the ongoing migration), whereas the CI `branding` job runs it **strictly without** that option — so green locally does not automatically mean green in CI. husky/lint-staged also runs as a pre-commit hook — never bypass Biome failures with `--no-verify`; fix them with `pnpm lint:fix`.

The release consistency check is therefore already part of `ci:local`; before EVERY release, still run `pnpm release:check` (`scripts/release-check.sh`) once more in isolation — lock-step consistency of VERSION, the 4 package.json files, `.release.json` and the CHANGELOG.

## 4. Definition of Done

**DE:** Eine Aufgabe ist erst fertig, wenn ALLE Punkte erfüllt sind:

- [ ] Tests grün: `pnpm test` und `pnpm test:e2e` (Teststrategie: Skill `test-management`, bei Lücken Agent `test-engineer`)
- [ ] `pnpm typecheck` und `pnpm lint` grün (bzw. gesamthaft `pnpm ci:local`)
- [ ] Doku aktualisiert: betroffene Seiten unter `docs/` (GETTING-STARTED, DEVELOPMENT, REFERENCE, INTEGRATION, ENTERPRISE, AI-FEATURES, ROADMAP) — Regeln im Skill `documentation-management`, Pflege durch Agent `doc-curator`
- [ ] `CHANGELOG.md` unter `[Unreleased]` ergänzt, zweisprachig DE+EN — Format im Skill `release-management`
- [ ] Review durch Agent `code-quality-reviewer` durchgeführt, Findings adressiert

**EN:** A task is only done when ALL items hold:

- [ ] Tests green: `pnpm test` and `pnpm test:e2e` (test strategy: skill `test-management`; for gaps, agent `test-engineer`)
- [ ] `pnpm typecheck` and `pnpm lint` green (or `pnpm ci:local` as a whole)
- [ ] Docs updated: affected pages under `docs/` (GETTING-STARTED, DEVELOPMENT, REFERENCE, INTEGRATION, ENTERPRISE, AI-FEATURES, ROADMAP) — rules in skill `documentation-management`, curation by agent `doc-curator`
- [ ] `CHANGELOG.md` updated under `[Unreleased]`, bilingual DE+EN — format in skill `release-management`
- [ ] Review by agent `code-quality-reviewer` completed, findings addressed

## 5. Parallelisierung / Parallelization

**DE:** Unabhängige Teilaufgaben (kein gemeinsamer Zustand, keine Reihenfolge-Abhängigkeit) werden an Subagenten delegiert statt sequenziell abgearbeitet. Das Routing übernimmt der Agent `dev-orchestrator`: Er zerlegt den Auftrag, wählt pro Teilaufgabe den passenden Spezial-Agenten (`test-engineer`, `code-quality-reviewer`, `doc-curator`, `release-manager`), startet unabhängige Läufe parallel und konsolidiert die Ergebnisse. Faustregeln:
- Änderungen an derselben Datei nie parallel vergeben.
- Package-Grenzen (`shared` / `core` / `cli`) sind natürliche Schnittlinien für parallele Arbeit.
- Nach jedem Agent-Batch: Ergebnisse konsolidieren, dann erst weiter.

**EN:** Independent subtasks (no shared state, no ordering dependency) are delegated to subagents instead of processed sequentially. Routing is handled by the `dev-orchestrator` agent: it decomposes the task, picks the right specialist agent per subtask (`test-engineer`, `code-quality-reviewer`, `doc-curator`, `release-manager`), runs independent pieces in parallel and consolidates the results. Rules of thumb:
- Never assign changes to the same file in parallel.
- Package boundaries (`shared` / `core` / `cli`) are natural seams for parallel work.
- After every agent batch: consolidate the results before moving on.

## 6. Eskalationstabelle / Escalation Table

**DE:** Wann welcher Baustein greift. / **EN:** Which building block applies when.

| Situation (DE) | Situation (EN) | Skill | Agent |
|---|---|---|---|
| Feature/Bugfix implementieren, Vorgehen unklar | Implement feature/bugfix, approach unclear | `dev-workflow` (dieser Skill / this skill) | `dev-orchestrator` |
| Code schreiben oder refactorn, Naming/Struktur/SOLID | Writing or refactoring code, naming/structure/SOLID | `clean-code` | `code-quality-reviewer` |
| Tests schreiben, Coverage-Lücken, flaky Tests, vitest-Projekte `shared`/`core`/`cli`/`e2e` | Writing tests, coverage gaps, flaky tests, vitest projects `shared`/`core`/`cli`/`e2e` | `test-management` | `test-engineer` |
| Version bumpen, CHANGELOG, Tag, npm-Publish, CI-Job `release_consistency` rot | Version bump, changelog, tag, npm publish, CI job `release_consistency` red | `release-management` | `release-manager` |
| Doku unter `docs/` anlegen/aktualisieren, README-Struktur | Create/update docs under `docs/`, README structure | `documentation-management` | `doc-curator` |
| Mehrere unabhängige Teilaufgaben, großer Umbau | Multiple independent subtasks, large rework | `dev-workflow` (Abschnitt 5 / section 5) | `dev-orchestrator` |
| Review vor Merge, Pipeline-Findings aus `lint`/`suppressions` | Review before merge, pipeline findings from `lint`/`suppressions` | `clean-code` | `code-quality-reviewer` |
| Bug/Regression, Ursache unbekannt | Bug/regression, cause unknown | `dev-workflow` (Debugging, Abschnitt 1) + `test-management` | `test-engineer` |

**DE:** Im Zweifel: Phase 1 (Verstehen) wiederholen statt raten — Fakten, nicht Spekulation.
**EN:** When in doubt: repeat phase 1 (understand) instead of guessing — facts, not speculation.
