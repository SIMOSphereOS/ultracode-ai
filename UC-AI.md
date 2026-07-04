# UltraCode AI — Leitdokument für Coding-Agenten / Guide for Coding Agents

**DE:** Verbindliche Arbeitsgrundlage für alle Coding-Agenten in diesem Repo (TypeScript-Monorepo, pnpm workspaces: `packages/shared` → `packages/core` → `packages/cli`, Lock-Step-Versionierung).
**EN:** Binding working baseline for all coding agents in this repo (TypeScript monorepo, pnpm workspaces: `packages/shared` → `packages/core` → `packages/cli`, lock-step versioning).

## Sprachregel / Language Rule

**DE:** Antworte in der Sprache der Anfrage — deutsche Befehle → deutsche Antworten, englische Befehle → englische Antworten. Doku-Lieferobjekte (README, ADRs, Lessons Learned, Standards, CHANGELOG-Einträge) sind IMMER zweisprachig DE+EN in einer Datei.
**EN:** Respond in the language of the request — German prompts → German answers, English prompts → English answers. Documentation deliverables (README, ADRs, lessons learned, standards, changelog entries) are ALWAYS bilingual DE+EN in a single file.

## Die 5 Standards / The 5 Standards — PFLICHT / MANDATORY

**DE:** Bei einschlägigen Aufgaben ist der jeweilige Skill Pflicht, nicht Option — vor der Arbeit lesen und anwenden.
**EN:** For matching tasks the respective skill is mandatory, not optional — read and apply it before working.

| Standard | Einzeiler / One-liner | Skill |
|---|---|---|
| Clean Code | **DE:** Naming, SOLID, Error Handling, Code Smells, Dependency Rule `shared → core → cli`. **EN:** Naming, SOLID, error handling, code smells, dependency rule. | [`.uc-ai/skills/clean-code/SKILL.md`](.uc-ai/skills/clean-code/SKILL.md) |
| Release Management | **DE:** SemVer-Bump im Lock-Step (`pnpm release`), CHANGELOG (DE+EN), `v*`-Tag → npm-Publish. **EN:** Lock-step SemVer bump, bilingual changelog, `v*` tag → npm publish. | [`.uc-ai/skills/release-management/SKILL.md`](.uc-ai/skills/release-management/SKILL.md) |
| Test Management | **DE:** TDD, vitest-Projekte shared/core/cli/e2e, Coverage-Gates 85/85/80, Gap-Analyse P1–P4. **EN:** TDD, vitest projects shared/core/cli/e2e, coverage gates 85/85/80, gap analysis P1–P4. | [`.uc-ai/skills/test-management/SKILL.md`](.uc-ai/skills/test-management/SKILL.md) |
| Dev-Workflow | **DE:** Phasen-Kaskade Verstehen → Plan → TDD → Verifikation → Review → Release; Git-Workflow. **EN:** Phase cascade understand → plan → TDD → verify → review → release; git workflow. | [`.uc-ai/skills/dev-workflow/SKILL.md`](.uc-ai/skills/dev-workflow/SKILL.md) |
| Documentation Management | **DE:** Doku-Landkarte, Doku-Pflichten pro Änderungstyp, ADRs, Lessons Learned, DE+EN-Standard. **EN:** Docs map, docs duties per change type, ADRs, lessons learned, DE+EN standard. | [`.uc-ai/skills/documentation-management/SKILL.md`](.uc-ai/skills/documentation-management/SKILL.md) |

Überblick / Overview: [`docs/DEVELOPMENT/standards.md`](docs/DEVELOPMENT/standards.md) · Begründung / Rationale: [ADR 0001](docs/decisions/0001-simo-dev-standards.md)

## Agenten-Routing / Agent Routing (`.uc-ai/agents/`)

| Agent | Zweck / Purpose | Trigger |
|---|---|---|
| [`dev-orchestrator`](.uc-ai/agents/dev-orchestrator.md) | **DE:** Zerlegt komplexe Aufträge, routet an Spezial-Agenten, erzwingt Gates. **EN:** Decomposes complex tasks, routes to specialists, enforces gates. | **DE:** Mehrteilige/paketübergreifende Aufgaben. **EN:** Multi-step, cross-package work. |
| [`code-quality-reviewer`](.uc-ai/agents/code-quality-reviewer.md) | **DE:** Clean-Code-Review von Diffs; ändert keinen Code. **EN:** Clean-code diff review; changes no code. | **DE:** Nach Implementierung, vor jedem MR. **EN:** After implementation, before every MR. |
| [`test-engineer`](.uc-ai/agents/test-engineer.md) | **DE:** Test-Gap-Analyse, vitest-Scaffolding, Coverage-Bericht. **EN:** Test gap analysis, vitest scaffolding, coverage report. | **DE:** Features ohne Tests, flaky Tests, Coverage. **EN:** Untested features, flaky tests, coverage. |
| [`release-manager`](.uc-ai/agents/release-manager.md) | **DE:** SemVer-Empfehlung, CHANGELOG-Pflege, Release-Checkliste; Tags nur nach Freigabe. **EN:** SemVer recommendation, changelog, release checklist; tags only after approval. | **DE:** Release, Version, Bump, Tag, Publish. **EN:** Release, version, bump, tag, publish. |
| [`doc-curator`](.uc-ai/agents/doc-curator.md) | **DE:** Doku-Pflichten prüfen, ADR-/Lessons-Index pflegen, tote Links finden. **EN:** Check docs duties, maintain ADR/lessons index, find dead links. | **DE:** Doku-lastige Änderungen, neue ADRs/Lessons. **EN:** Docs-heavy changes, new ADRs/lessons. |

**Achtung / Caution:** `docs/DEVELOPMENT/agents-reference.md` beschreibt die PRODUKT-Agenten des UltraCode-Tools — nicht diese Repo-Entwicklungs-Agenten. / describes the PRODUCT agents of the UltraCode tool — not these repo development agents.

## Quality Gates

- **Vor jedem Commit / before every commit:** `pnpm ci:local` (lokaler CI-Spiegel / local CI mirror, `scripts/ci.sh`) muss grün sein / must be green.
- **Vor jedem Release / before every release:** `pnpm release:check` (`scripts/release-check.sh`) — Konsistenz `VERSION` ↔ 4× `package.json` ↔ `.release.json` ↔ CHANGELOG.
- **Niemals direkt auf `main` pushen / never push to `main` directly** — ein Hook blockiert das. Immer Feature-Branch + Merge Request via `glab`. / A hook blocks it. Always feature branch + merge request via `glab`.
- **Commit-Konvention / commit convention:** `feat|fix|docs|refactor|test|chore|ci: Beschreibung` + Trailer:

  ```
  Co-Authored-By: SIMO GmbH, Aschaffenburg, Bavaria Germany
  ```

## Definition of Done

**DE:** Eine Änderung ist fertig, wenn: Tests zuerst geschrieben und grün (unit + ggf. e2e), `pnpm ci:local` grün, Doku-Pflicht laut `documentation-management` erfüllt (inkl. CHANGELOG `[Unreleased]` bei nutzersichtbaren Änderungen), Review durch `code-quality-reviewer` bestanden, MR erstellt. Vollständige Checkliste: Skill [`dev-workflow`](.uc-ai/skills/dev-workflow/SKILL.md).
**EN:** A change is done when: tests written first and green (unit + e2e where relevant), `pnpm ci:local` green, docs duty per `documentation-management` fulfilled (incl. changelog `[Unreleased]` for user-visible changes), review by `code-quality-reviewer` passed, MR created. Full checklist: skill [`dev-workflow`](.uc-ai/skills/dev-workflow/SKILL.md).

## Referenzen / References

- [`docs/DEVELOPMENT/standards.md`](docs/DEVELOPMENT/standards.md) — Standards, Agenten, Gates im Detail / in detail
- [`VERSIONING.md`](VERSIONING.md) — Release-Policy · [`CONTRIBUTING.md`](CONTRIBUTING.md) — Contribution-Workflow
- [`docs/decisions/`](docs/decisions/README.md) — ADRs · [`docs/lessons-learned/`](docs/lessons-learned/README.md) — Fehler nur einmal / mistakes only once
