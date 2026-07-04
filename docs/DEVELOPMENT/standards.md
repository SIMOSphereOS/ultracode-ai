# Entwicklungsstandards / Development Standards

**DE:** Diese Seite ist der Einstieg in die fünf Entwicklungsstandards (Skills) und fünf
Projekt-Agenten dieses Repos sowie in die Quality Gates, die sie durchsetzen. Grundlage:
[ADR 0001](../decisions/0001-simo-dev-standards.md).
**EN:** This page is the entry point to this repo's five development standards (skills)
and five project agents, plus the quality gates they enforce. Foundation:
[ADR 0001](../decisions/0001-simo-dev-standards.md).

> **DE:** Nicht verwechseln: [`agents-reference.md`](./agents-reference.md) beschreibt die
> **Produkt-Agenten des UltraCode-Tools selbst**. Diese Seite beschreibt die Agenten für
> die **Entwicklung dieses Repos** (`.ultracode/agents/`).
> **EN:** Do not confuse: [`agents-reference.md`](./agents-reference.md) describes the
> **product agents of the UltraCode tool itself**. This page describes the agents for
> **developing this repo** (`.ultracode/agents/`).

---

## Skills (`.ultracode/skills/`)

| Skill | Zweck / Purpose | Greift bei / Applies when |
|---|---|---|
| `clean-code` | **DE:** Naming, Funktionsgröße, SOLID, Fehlerbehandlung, TypeScript-Patterns. **EN:** Naming, function size, SOLID, error handling, TypeScript patterns. | **DE:** Jede Implementierung und jedes Refactoring in `packages/*`. **EN:** Every implementation and refactoring in `packages/*`. |
| `release-management` | **DE:** SemVer-Bump (Lock-Step über `VERSION` + 4× `package.json` + `.release.json`), CHANGELOG-Roll, `v*`-Tag → npm-Publish. **EN:** SemVer bump (lock-step across `VERSION` + 4× `package.json` + `.release.json`), changelog roll, `v*` tag → npm publish. | **DE:** Version-Bump, Release, Hotfix, CHANGELOG-Pflege (`pnpm release`, `pnpm release:check`). **EN:** Version bump, release, hotfix, changelog maintenance. |
| `test-management` | **DE:** vitest-Projekte `shared`/`core`/`cli` (Unit) und `e2e` (`vitest.config.ts`), Coverage via `@vitest/coverage-v8` (Gates 85/85/80), JUnit-Testreport in CI, Regressionstests. **EN:** vitest projects `shared`/`core`/`cli` (unit) and `e2e` (`vitest.config.ts`), coverage via `@vitest/coverage-v8` (gates 85/85/80), JUnit test report in CI, regression tests. | **DE:** Tests schreiben/reparieren, Coverage-Fragen, `pnpm test`, `pnpm test:e2e`, `pnpm test:coverage`. **EN:** Writing/fixing tests, coverage questions. |
| `dev-workflow` | **DE:** Feature-Branch + Merge Request (main-Push blockiert), Commit-Konvention, lokaler CI-Spiegel vor dem Push. **EN:** Feature branch + merge request (main push blocked), commit convention, local CI mirror before pushing. | **DE:** Jeder Branch, Commit, MR; `pnpm ci:local` vor jedem Push. **EN:** Every branch, commit, MR; `pnpm ci:local` before every push. |
| `documentation-management` | **DE:** Doku-Landkarte, Doku-Pflichten pro Änderungstyp, ADRs, Lessons Learned, Zweisprachigkeits-Standard DE+EN. **EN:** Documentation map, docs duties per change type, ADRs, lessons learned, bilingual DE+EN standard. | **DE:** Jede Änderung mit Doku-Pflicht: Feature, CLI-Änderung, Breaking Change, Bug mit Erkenntnis, Architektur-Entscheidung. **EN:** Every change carrying a docs duty: feature, CLI change, breaking change, bug with a lesson, architecture decision. |

---

## Agenten / Agents (`.ultracode/agents/`)

| Agent | Zweck / Purpose | Greift bei / Applies when |
|---|---|---|
| `code-quality-reviewer` | **DE:** Review auf Clean-Code-Verstöße, Code Smells, Suppressions (`@ts-ignore`-Gate) — wendet Skill `clean-code` an. **EN:** Reviews for clean-code violations, code smells, suppressions — applies the `clean-code` skill. | **DE:** Vor jedem MR, nach größeren Implementierungen. **EN:** Before every MR, after larger implementations. |
| `release-manager` | **DE:** Führt Release-Prüfung und -Bump durch, hält `VERSION`/`.release.json`/CHANGELOG konsistent — wendet Skill `release-management` an. **EN:** Runs release check and bump, keeps `VERSION`/`.release.json`/changelog consistent — applies the `release-management` skill. | **DE:** Release vorbereiten, `release_consistency` rot, Tag setzen. **EN:** Preparing a release, red `release_consistency`, tagging. |
| `test-engineer` | **DE:** Entwirft und härtet Tests (unit/e2e), schließt Coverage-Lücken, baut Regressionstests aus Lessons Learned — wendet Skill `test-management` an. **EN:** Designs and hardens tests (unit/e2e), closes coverage gaps, builds regression tests from lessons learned — applies the `test-management` skill. | **DE:** Neue Features ohne Tests, flakige Tests, `unit_tests`/`e2e_tests` rot. **EN:** New untested features, flaky tests, red `unit_tests`/`e2e_tests`. |
| `doc-curator` | **DE:** Reviewt Doku auf tote Links, veraltete Beispiele, fehlende Index-Einträge und Zweisprachigkeit — wendet Skill `documentation-management` an. **EN:** Reviews docs for dead links, stale samples, missing index entries and bilingualism — applies the `documentation-management` skill. | **DE:** Doku-lastige MRs, neue ADRs/Lessons, Release-Notes. **EN:** Docs-heavy MRs, new ADRs/lessons, release notes. |
| `dev-orchestrator` | **DE:** Zerlegt größere Aufträge, plant die passenden Agenten ein (inkl. Doku-Pflichten) und konsolidiert Ergebnisse — wendet Skill `dev-workflow` an. **EN:** Decomposes larger tasks, schedules the right agents (incl. docs duties) and consolidates results — applies the `dev-workflow` skill. | **DE:** Mehrschrittige Vorhaben über mehrere Packages oder Standards hinweg. **EN:** Multi-step efforts spanning packages or standards. |

---

## Laufzeit-Loader / Runtime Loader

**DE:** Die obigen Skills und Agenten sind **laufzeit-aktiv, nicht nur Doku**: UltraCode lädt
sie beim Start aus dem projektlokalen Store `<cwd>/.ultracode/` — Skills aus
`.ultracode/skills/<name>/SKILL.md`, Agenten aus `.ultracode/agents/<name>.md`. Der
projektlokale Store hat **Vorrang vor dem Home-Store** `~/.ultracode/`; leichtgewichtiges
Frontmatter (`name` + `description`, optional `triggers`) wird per Adapter mit Defaults auf
das volle Format gehoben, ein Agenten-Body landet als additiver `systemPrompt` in der
Agentendefinition. **Hooks werden bewusst nicht geladen** (kein Produkt-Hook-Runtime).
Details und Begründung: [ADR 0002](../decisions/0002-project-local-assistant-loader.md).
**EN:** The skills and agents above are **runtime-active, not just docs**: UltraCode loads
them at startup from the project-local store `<cwd>/.ultracode/` — skills from
`.ultracode/skills/<name>/SKILL.md`, agents from `.ultracode/agents/<name>.md`. The
project-local store **takes precedence over the home store** `~/.ultracode/`; lightweight
frontmatter (`name` + `description`, optional `triggers`) is lifted to the full format via an
adapter with defaults, and an agent body is adopted as an additive `systemPrompt` on the
agent definition. **Hooks are deliberately not loaded** (no product hook runtime). Details
and rationale: [ADR 0002](../decisions/0002-project-local-assistant-loader.md).

---

## Quality Gates

**DE:** Drei Verteidigungslinien — lokal vor dem Commit, lokal vor dem Push, zentral in
der GitLab-Pipeline (`.gitlab-ci.yml`).
**EN:** Three lines of defence — locally before the commit, locally before the push,
centrally in the GitLab pipeline (`.gitlab-ci.yml`).

### Lokal / Local

| Gate | Kommando / Command | Prüft / Checks |
|---|---|---|
| Pre-Commit (husky + lint-staged) | automatisch bei `git commit` / automatic on `git commit` | **DE:** Biome Lint+Format auf gestagten Dateien. **EN:** Biome lint+format on staged files. |
| CI-Spiegel / CI mirror | `pnpm ci:local` (`scripts/ci.sh`) | **DE:** Die komplette Pipeline lokal — vor jedem Push Pflicht. **EN:** The full pipeline locally — mandatory before every push. |
| Release-Konsistenz / Release consistency | `pnpm release:check` (`scripts/release-check.sh`) | **DE:** `VERSION` ↔ 4× `package.json` ↔ `.release.json` ↔ CHANGELOG-Abschnitt. **EN:** `VERSION` ↔ 4× `package.json` ↔ `.release.json` ↔ changelog section. |
| Einzelgates / Individual gates | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm test:coverage`, `pnpm biome:ci`, `pnpm check:suppressions` | **DE:** Gezielter Lauf einzelner Prüfungen. **EN:** Targeted run of single checks. |

### GitLab CI (`.gitlab-ci.yml`)

| Stage | Jobs | Zweck / Purpose |
|---|---|---|
| `install_build` | `install_and_build` | **DE:** `pnpm install` + `tsc -b` in einem Job (erhält Workspace-Symlinks). **EN:** `pnpm install` + `tsc -b` in one job (preserves workspace symlinks). |
| `test` | `unit_tests`, `e2e_tests`, `typecheck`, `lint`, `suppressions`, `release_consistency` | **DE:** Tests (JUnit-Report), Typen, Biome, Suppression-Gate, Release-Artefakt-Konsistenz. **EN:** Tests (JUnit report), types, Biome, suppression gate, release artifact consistency. |
| `coverage` | `coverage` | **DE:** Coverage via `@vitest/coverage-v8`. **EN:** Coverage via `@vitest/coverage-v8`. |
| `security` | `audit`, `sast`, `secret_detection` | **DE:** Dependency-Audit, SAST, Secret-Erkennung. **EN:** Dependency audit, SAST, secret detection. |
| `publish` | `publish` | **DE:** npm-Publish, nur bei `v*`-Tags (`NPM_TOKEN`). **EN:** npm publish, only on `v*` tags (`NPM_TOKEN`). |

---

## Weiterführend / Further Reading

- [`VERSIONING.md`](../../VERSIONING.md) — Release-Policy / release policy
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — Contribution-Workflow
- [`docs/decisions/`](../decisions/README.md) — Architecture Decision Records
- [`docs/lessons-learned/`](../lessons-learned/README.md) — Fehler nur einmal / mistakes only once
