# ADR 0001: Einführung der SIMO-Entwicklungsstandards und Projekt-Agenten / Adoption of the SIMO development standards and project agents

| Feld / Field | Wert / Value |
|---|---|
| **Status** | akzeptiert / accepted |
| **Datum / Date** | 2026-07-03 |
| **Entscheider / Deciders** | SIMO GmbH Engineering (ultracode-ai Maintainer) |
| **Betroffene Bereiche / Affected areas** | `.uc-ai/skills/`, `.uc-ai/agents/`, `docs/decisions/`, `docs/lessons-learned/`, `docs/DEVELOPMENT/standards.md` |

## Kontext / Context

**DE:** Das Repo hat in kurzer Folge ein vollständiges Release-System (`VERSION`,
`.release.json`, zweisprachiges `CHANGELOG.md`, `VERSIONING.md`, CI-Job
`release_consistency`), Biome-Tooling mit Pre-Commit-Gates und einen lokalen CI-Spiegel
(`pnpm ci:local`) bekommen. Das Wissen darüber, *wie* hier entwickelt, getestet,
released und dokumentiert wird, lag verstreut in Scripts, CI-Konfiguration und Köpfen —
für KI-Agenten und neue Contributors nicht zuverlässig auffindbar. Betrachtete
Alternativen: (a) alles in ein einzelnes großes `UC-AI.md` — skaliert nicht, lädt immer
alles; (b) nur externe Wiki-Doku — driftet vom Code weg und steuert keine Agenten.
**EN:** In quick succession the repo gained a complete release system (`VERSION`,
`.release.json`, bilingual `CHANGELOG.md`, `VERSIONING.md`, CI job
`release_consistency`), Biome tooling with pre-commit gates and a local CI mirror
(`pnpm ci:local`). The knowledge of *how* to develop, test, release and document here
was scattered across scripts, CI configuration and people's heads — not reliably
discoverable for AI agents or new contributors. Alternatives considered: (a) everything
in one large `UC-AI.md` — does not scale, always loads everything; (b) external wiki
docs only — drift away from the code and cannot steer agents.

## Entscheidung / Decision

**DE:** Wir führen fünf repo-spezifische Entwicklungsstandards als Skills unter
`.uc-ai/skills/` ein — `clean-code`, `release-management`, `test-management`,
`dev-workflow`, `documentation-management` — sowie fünf Projekt-Agenten unter
`.uc-ai/agents/` — `code-quality-reviewer`, `release-manager`, `test-engineer`,
`doc-curator`, `dev-orchestrator`. Ergänzend etablieren wir `docs/decisions/` (ADRs)
und `docs/lessons-learned/` als verbindliche Wissensablagen; die Übersicht liegt in
`docs/DEVELOPMENT/standards.md`.
**EN:** We introduce five repo-specific development standards as skills under
`.uc-ai/skills/` — `clean-code`, `release-management`, `test-management`,
`dev-workflow`, `documentation-management` — plus five project agents under
`.uc-ai/agents/` — `code-quality-reviewer`, `release-manager`, `test-engineer`,
`doc-curator`, `dev-orchestrator`. In addition we establish `docs/decisions/` (ADRs)
and `docs/lessons-learned/` as mandatory knowledge stores; the overview lives in
`docs/DEVELOPMENT/standards.md`.

## Konsequenzen / Consequences

- ✅ **DE:** Standards laden kontextabhängig statt pauschal: Skills triggern über
  `name`/`description`, Agenten kapseln Review-, Release-, Test- und Doku-Wissen mit
  echten Kommandos dieses Repos (`pnpm ci:local`, `pnpm release:check`, CI-Jobs).
  **EN:** Standards load contextually instead of wholesale: skills trigger via
  `name`/`description`, agents encapsulate review, release, test and docs knowledge
  with this repo's real commands (`pnpm ci:local`, `pnpm release:check`, CI jobs).
- ✅ **DE:** Entscheidungen und Fehler-Erkenntnisse haben ab jetzt einen Pflicht-Ort
  (ADR bzw. Lessons Learned) — „Wissen konservieren" und „Fehler nur einmal" werden
  prüfbar statt Appell.
  **EN:** Decisions and defect findings now have a mandatory home (an ADR or a
  lessons-learned entry) — "preserve knowledge" and "mistakes only once" become
  verifiable instead of aspirational.
- ⚠️ **DE:** Zehn zusätzliche Pflege-Artefakte: Bei Änderungen an Scripts, CI-Jobs oder
  Prozessen müssen Skills und Agenten mitgezogen werden, sonst dokumentieren sie einen
  veralteten Stand — Drift-Prüfung gehört zum Review durch `doc-curator`.
  **EN:** Ten additional artifacts to maintain: changes to scripts, CI jobs or
  processes must be propagated into skills and agents, otherwise they document a stale
  state — drift checking is part of the `doc-curator` review.
- ⚠️ **DE:** Zweisprachigkeit (DE+EN) verdoppelt den Schreibaufwand pro Dokument;
  dafür bleibt das Repo für das deutschsprachige Team und die Open-Source-Community
  gleichermaßen zugänglich.
  **EN:** Bilingual DE+EN roughly doubles the writing effort per document; in return
  the repo stays equally accessible to the German-speaking team and the open-source
  community.
