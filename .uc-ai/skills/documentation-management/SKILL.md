---
name: documentation-management
description: "DE: Dokumentationsmanagement für ultracode-ai — Doku-Landkarte (README, docs/-Kategorien, CHANGELOG, VERSIONING), Doku-Pflichten pro Änderungstyp, ADR-Prozess (docs/decisions/), Lessons-Learned-Prozess (docs/lessons-learned/), Zweisprachigkeits-Standard DE/EN und Qualitätsregeln. Anwenden bei: Dokumentation schreiben, Doku aktualisieren, README, CHANGELOG-Eintrag, ADR, Architecture Decision Record, Entscheidung dokumentieren, Lessons Learned, Erkenntnis festhalten, toter Link, Doku-Review, Upgrade-Guide. / EN: Documentation management for ultracode-ai — documentation map (README, docs/ categories, CHANGELOG, VERSIONING), documentation duties per change type, ADR process (docs/decisions/), lessons-learned process (docs/lessons-learned/), bilingual DE/EN standard and quality rules. Use when: writing documentation, updating docs, README, changelog entry, ADR, architecture decision record, document a decision, lessons learned, capture a finding, dead link, docs review, upgrade guide."
---

# Documentation Management — ultracode-ai

**DE:** Dieser Skill definiert, *welche* Dokumentation in diesem Repo existiert, *wann* sie
gepflegt werden muss und *wie* neue Doku aussieht. Regel Nr. 1: Kein Merge ohne die
zugehörige Doku-Pflicht (siehe Tabelle unten).
**EN:** This skill defines *which* documentation exists in this repo, *when* it must be
maintained and *what* new documentation looks like. Rule no. 1: no merge without the
matching documentation duty (see table below).

---

## 1. Doku-Landkarte / Documentation Map

**DE:** Alle Pfade sind repo-relativ. Jede Kategorie unter `docs/` hat ein eigenes
`README.md` als Index — neue Dateien dort immer eintragen.
**EN:** All paths are repo-relative. Every category under `docs/` has its own
`README.md` acting as index — always register new files there.

| Ort / Location | Rolle / Role |
|---|---|
| `README.md` (Root) | **DE:** Schaufenster des Projekts: Pitch, Quick Start, Feature-Überblick. **EN:** Project showcase: pitch, quick start, feature overview. |
| `docs/README.md` | **DE:** Einstieg und Navigationskarte in alle Kategorien. **EN:** Entry point and navigation map into all categories. |
| `docs/GETTING-STARTED/` | **DE:** Installation, Quick Start, Konfiguration. **EN:** Installation, quick start, configuration. |
| `docs/DEVELOPMENT/` | **DE:** Architektur, Kernsystem, AI-Versioning, Tool-/Agenten-Referenz des *Produkts*, Entwicklungsstandards (`standards.md`). **EN:** Architecture, core system, AI versioning, the *product's* tool/agent reference, development standards (`standards.md`). |
| `docs/REFERENCE/` | **DE:** API, `cli-commands.md`, `slash-commands.md`, Konfigurationsoptionen, Parameter. **EN:** API, `cli-commands.md`, `slash-commands.md`, configuration options, parameters. |
| `docs/INTEGRATION/` | **DE:** Migrationen (`opencode-migration.md`, `vibe-migration.md`, `assistant-migration.md` für andere AI-Coding-Assistenten), Plug-in-Entwicklung. **EN:** Migrations (`opencode-migration.md`, `vibe-migration.md`, `assistant-migration.md` for other AI coding assistants), plugin development. |
| `docs/ENTERPRISE/` | **DE:** Self-Hosting, Security, Team-Zusammenarbeit. **EN:** Self-hosting, security, team collaboration. |
| `docs/AI-FEATURES/` | **DE:** Versionierungssystem, Release-Planung, Quality Gates (Produktsicht). **EN:** Versioning system, release planning, quality gates (product view). |
| `docs/ROADMAP/` | **DE:** Phasenpläne und Zeitplan. **EN:** Phase plans and timeline. |
| `docs/decisions/` | **DE:** Architecture Decision Records (ADRs) — siehe Abschnitt 3. **EN:** Architecture Decision Records (ADRs) — see section 3. |
| `docs/lessons-learned/` | **DE:** Erkenntnisse aus behobenen Fehlern — siehe Abschnitt 4. **EN:** Findings from fixed defects — see section 4. |
| `CHANGELOG.md` | **DE:** Keep a Changelog, zweisprachig DE+EN, `[Unreleased]`-Abschnitt; wird von `pnpm release` gerollt. **EN:** Keep a Changelog, bilingual DE+EN, `[Unreleased]` section; rolled by `pnpm release`. |
| `VERSIONING.md` | **DE:** Release-Policy (SemVer, Lock-Step, Pflicht-Artefakte, Bump-Regeln). **EN:** Release policy (SemVer, lock-step, mandatory artifacts, bump rules). |
| `CONTRIBUTING.md` | **DE:** Contribution-Regeln, Branch-/MR-Workflow, Commit-Konvention. **EN:** Contribution rules, branch/MR workflow, commit convention. |
| `UPGRADE.md` | **DE:** Migrationsanleitung — existiert **nur bei Major-Releases** (laut `VERSIONING.md` dort Pflicht, wird aber von keinem Gate maschinell geprüft). **EN:** Migration guide — exists **only for major releases** (mandatory per `VERSIONING.md`, but not enforced by any automated gate). |

> **Achtung / Caution:** `docs/DEVELOPMENT/agents-reference.md` dokumentiert die
> **Produkt-Agenten des UltraCode-Tools selbst** — nicht verwechseln mit den
> Repo-Entwicklungs-Agenten unter `.uc-ai/agents/` (dokumentiert in
> `docs/DEVELOPMENT/standards.md`). /
> `docs/DEVELOPMENT/agents-reference.md` documents the **product agents of the
> UltraCode tool itself** — do not confuse them with the repo development agents
> under `.uc-ai/agents/` (documented in `docs/DEVELOPMENT/standards.md`).

---

## 2. Doku-Pflichten pro Änderungstyp / Documentation Duties per Change Type

**DE:** Vor jedem Commit prüfen: Welche Zeile trifft zu? Alle genannten Ziele pflegen.
**EN:** Before every commit, check which row applies and update all listed targets.

| Änderungstyp / Change type | Pflicht-Doku / Mandatory docs |
|---|---|
| **Neues Feature / New feature** | `docs/REFERENCE/` (passende Seite / matching page) **+** `CHANGELOG.md` → `[Unreleased]` → *Hinzugefügt / Added* |
| **CLI-Änderung / CLI change** (neues Kommando, Flag, geändertes Verhalten / new command, flag, changed behaviour) | `docs/REFERENCE/cli-commands.md` (ggf. auch / possibly also `slash-commands.md`) **+** `CHANGELOG.md` |
| **Architektur-Entscheidung / Architecture decision** | Neue ADR in `docs/decisions/000N-titel.md` (Abschnitt 3) **+** Index in `docs/decisions/README.md` |
| **Behobener Bug mit Erkenntnis / Fixed bug with a lesson** | `docs/lessons-learned/` (Abschnitt 4) **+** `CHANGELOG.md` → *Behoben / Fixed* |
| **Breaking Change** | `UPGRADE.md` (Migrationsschritte / migration steps) **+** `CHANGELOG.md` mit `**BREAKING**`-Markierung **+** ggf. ADR; Major-Bump via `pnpm release` (Skill `release-management`) |
| **Konfigurationsoption / Configuration option** | `docs/REFERENCE/configuration-options.md` **+** `CHANGELOG.md` |
| **Release-Prozess geändert / Release process changed** | `VERSIONING.md` **+** ggf. `.release.json`-Konsistenz prüfen via `pnpm release:check` |
| **Nur interne Refactorings / Internal refactoring only** | Keine Nutzer-Doku; bei Architektur-Relevanz ADR erwägen. / No user docs; consider an ADR if architecturally relevant. |

---

## 3. ADR-Prozess / ADR Process (Architecture Decision Records)

**DE:** Jede Entscheidung mit langfristiger Wirkung auf Architektur, Tooling oder Prozess
wird als ADR festgehalten — kurz, datiert, unveränderlich.
**EN:** Every decision with long-term impact on architecture, tooling or process is
captured as an ADR — short, dated, immutable.

- **Ort / Location:** `docs/decisions/`
- **Nummerierung / Numbering:** fortlaufend vierstellig, `000N-titel.md`
  (z. B. / e.g. `0001-simo-dev-standards.md`, `0002-provider-katalog.md`).
  Kebab-case, sprechender Kurztitel. / Kebab-case, descriptive short title.
- **Vorlage / Template:** `docs/decisions/TEMPLATE.md` kopieren. / Copy `docs/decisions/TEMPLATE.md`.
- **Status:** `vorgeschlagen / proposed` → `akzeptiert / accepted` → ggf. `abgelöst / superseded`.
  **DE:** Abgelöste ADRs werden **nicht gelöscht**, sondern erhalten den Status
  „abgelöst durch 000M" und die neue ADR verweist zurück.
  **EN:** Superseded ADRs are **never deleted**; they get status
  "superseded by 000M" and the new ADR links back.
- **Index:** Jede neue ADR in die Tabelle in `docs/decisions/README.md` eintragen. /
  Register every new ADR in the table in `docs/decisions/README.md`.
- **Commit:** `docs: ADR 000N <Kurztitel>` (kein Version-Bump — siehe `VERSIONING.md`). /
  `docs: ADR 000N <short title>` (no version bump — see `VERSIONING.md`).

---

## 4. Lessons-Learned-Prozess / Lessons-Learned Process

**DE:** SIMO-DNA: **Fehler nur einmal.** VOR jedem Bugfix `docs/lessons-learned/` nach
ähnlichen Fällen durchsuchen (`rg -i "<stichwort>" docs/lessons-learned/`). NACH jedem
Fix mit nicht-trivialer Ursache die Erkenntnis dokumentieren.
**EN:** SIMO DNA: **mistakes only once.** BEFORE every bugfix, search
`docs/lessons-learned/` for similar cases (`rg -i "<keyword>" docs/lessons-learned/`).
AFTER every fix with a non-trivial cause, document the finding.

- **Ort / Location:** `docs/lessons-learned/`
- **Dateiname / Filename:** `YYYY-MM-DD-kurz-titel.md` (Datum des Fixes / date of the fix).
- **Vorlage / Template:** `docs/lessons-learned/TEMPLATE.md` — Pflichtfelder / mandatory fields:
  1. **Symptom** — was sichtbar war / what was observable
  2. **Root Cause** — die tatsächliche Ursache, nicht das Symptom / the actual cause, not the symptom
  3. **Fix** — was geändert wurde (Commits, Dateien) / what was changed (commits, files)
  4. **Prävention / Prevention** — Test, Gate, Hook oder Regel, die die Wiederholung verhindert /
     test, gate, hook or rule that prevents recurrence
- **Index:** Eintrag in `docs/lessons-learned/README.md`. / Entry in `docs/lessons-learned/README.md`.
- **DE:** Eine Lesson ohne Präventionsmaßnahme ist unvollständig — im Zweifel einen
  Regressionstest ergänzen (Skill `test-management`).
  **EN:** A lesson without a prevention measure is incomplete — when in doubt, add a
  regression test (skill `test-management`).

---

## 5. Zweisprachigkeits-Standard / Bilingual Standard (DE + EN)

**DE:** Neue Doku ist immer zweisprachig. Zwei zulässige Muster:
**EN:** New documentation is always bilingual. Two accepted patterns:

1. **Inline (bevorzugt für kurze Dokumente / preferred for short documents):**
   „**DE:** … / **EN:** …"-Paare oder parallele Absätze in **einer** Datei —
   so wie `CHANGELOG.md` und diese Skill-Datei. /
   "**DE:** … / **EN:** …" pairs or parallel paragraphs in **one** file —
   like `CHANGELOG.md` and this skill file.
2. **`.en.md`-Paar (für lange Anleitungen / for long guides):**
   deutsche Hauptdatei + englisches Pendant mit Suffix `.en.md`, gegenseitig verlinkt
   im Kopf. Bestehendes Muster / existing pattern:
   `docs/GETTING-STARTED/installation.md` + `installation.en.md`
   (`> 🇬🇧 English version: …` / `> 🇩🇪 Deutsche Version: …`).

**DE:** Beide Sprachfassungen müssen inhaltsgleich und idiomatisch sein — keine
Maschinenübersetzungs-Anmutung. Echte Umlaute (ä, ö, ü, ß) verwenden, niemals ae/oe/ue.
Wer eine Sprachfassung ändert, ändert die andere im selben Commit.
**EN:** Both language versions must be equivalent in content and idiomatic — no
machine-translation feel. Use real German umlauts (ä, ö, ü, ß) in German text — never
ae/oe/ue substitutes. Whoever changes one language version updates the other in
the same commit.

---

## 6. Qualitätsregeln / Quality Rules

**DE:** Diese Regeln prüft der Agent `code-quality-reviewer` mit, die Doku-Tiefe prüft
der Agent `doc-curator` (`.uc-ai/agents/doc-curator.md`).
**EN:** These rules are co-checked by the `code-quality-reviewer` agent; documentation
depth is reviewed by the `doc-curator` agent (`.uc-ai/agents/doc-curator.md`).

- **Keine toten Links / No dead links:** relative Links müssen auf existierende Dateien
  zeigen. Schnelltest / quick check:
  `rg -o '\]\((\./|\.\./)[^)]+\)' docs/ -r '$0'` und Ziele mit `test -f` prüfen. /
  relative links must point to existing files; verify targets with `test -f`.
- **Code-Beispiele müssen zum Stand passen / Code samples must match reality:**
  Script-Namen gegen `package.json`, CLI-Beispiele gegen `packages/cli`, CI-Job-Namen
  gegen `.gitlab-ci.yml` prüfen. Nichts dokumentieren, was nicht verifiziert wurde. /
  check script names against `package.json`, CLI samples against `packages/cli`, CI job
  names against `.gitlab-ci.yml`. Never document anything unverified.
- **Index-Pflege / Index maintenance:** neue Datei ⇒ Eintrag im Kategorie-`README.md`. /
  new file ⇒ entry in the category `README.md`.
- **CHANGELOG-Hygiene:** Einträge nach `[Unreleased]` in die richtige Rubrik
  (*Hinzugefügt/Added*, *Geändert/Changed*, *Behoben/Fixed*), zweisprachig, mit
  `pnpm release:check` gegen die Release-Artefakte konsistent halten. /
  entries go under `[Unreleased]` into the correct section, bilingual, kept consistent
  with the release artifacts via `pnpm release:check`.
- **Review:** Doku-lastige MRs vom Agent `doc-curator` reviewen lassen; er wird vom
  Agent `dev-orchestrator` bei Doku-Pflichten automatisch eingeplant. /
  have docs-heavy MRs reviewed by the `doc-curator` agent; the `dev-orchestrator`
  agent schedules it automatically whenever documentation duties apply.

---

## Querverweise / Cross-References

- Skill `release-management` — CHANGELOG-Roll, `VERSION`/`.release.json`, `pnpm release`.
- Skill `test-management` — Regressionstests als Präventionsmaßnahme. / Regression tests as prevention.
- Skill `dev-workflow` — Branch-/MR-Workflow, Commit-Konvention, `pnpm ci:local`.
- Skill `clean-code` — Benennung und Lesbarkeit gelten auch für Doku-Beispiele. / Naming and readability also apply to doc samples.
- Agent `doc-curator` — Doku-Review; Agent `dev-orchestrator` — plant Doku-Pflichten ein. / schedules documentation duties.
- Übersicht / Overview: `docs/DEVELOPMENT/standards.md`.
