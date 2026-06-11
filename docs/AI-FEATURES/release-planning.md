# UltraCode Release Planning

> Aus einer Change-Analyse einen vollständigen Release-Plan ableiten: Changelog-Entwurf im Keep-a-Changelog-Format, Meilensteine und eine Risikobewertung.

Die `ReleasePlanningEngine` (in `packages/core/src/versioning/ReleasePlanningEngine.ts`) baut den Plan rein aus der `ChangeAnalysis`. Sie ist voll offline lauffähig; ein optionaler LLM-Provider poliert nur den Changelog-Text. Architekturdetails: [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md#release-planning-engine).

---

## Befehl

```bash
ultracode release plan
ultracode release plan 0.3.0
ultracode release plan 0.3.0 --json
```

- Ohne `version` wird die Zielversion **automatisch** über den Version Recommender vorgeschlagen (Basis: Channel `stable`).
- `--json` liefert den `ReleasePlan` als JSON.

Analysebereich ist der Standardbereich (letztes Tag bis `HEAD`, sonst volle Historie).

---

## Textausgabe

Formatiert über `formatReleasePlan`:

```text
Release Plan 0.3.0
  Milestones: 3
    [x] Scope: core
        - feat(core): add streaming provider adapter
        - fix(core): guard against empty tool output
    [x] Features
        - feat: expose createVersioningSystem factory
    [x] Bug fixes
        - fix: correct numstat parsing for renamed files
  Risks: 2
    - [high] 1 breaking change(s) may break downstream consumers. — mitigation: Document every breaking change in a migration guide and communicate the major version bump clearly.
    - [medium] Large changeset (2410 changed lines across 18 files) increases regression risk. — mitigation: Schedule an extra review pass and roll the release out in stages.
  Changelog draft:
    ## [0.3.0] - 2026-06-11

    ### Added
    - feat: expose createVersioningSystem factory
    - **core:** add streaming provider adapter

    ### Changed
    - **BREAKING:** Exported symbol "createLegacyClient" was removed from packages/core/src/legacy.ts (packages/core/src/legacy.ts)

    ### Fixed
    - **core:** guard against empty tool output
```

---

## JSON-Struktur (`ReleasePlan`)

```json
{
  "version": "0.3.0",
  "targetDate": "2026-09-01",
  "milestones": [
    { "title": "Scope: core", "items": ["feat(core): …", "fix(core): …"], "done": true }
  ],
  "risks": [
    { "description": "1 breaking change(s) may break downstream consumers.", "severity": "high", "mitigation": "…" }
  ],
  "changelogDraft": "## [0.3.0] - 2026-06-11\n\n### Added\n- …\n"
}
```

`targetDate` erscheint nur, wenn es gesetzt wurde (Bibliotheks-Option `PlanOptions.targetDate`, ISO-8601 UTC).

---

## Changelog-Entwurf

Der Entwurf folgt dem [Keep-a-Changelog](https://keepachangelog.com/)-Format mit Datumszeile `## [<version>] - YYYY-MM-DD`. Gruppierung:

| Abschnitt | Quelle |
|---|---|
| **Added** | `feat`-Commits |
| **Changed** | Breaking Changes (`**BREAKING:** …`) plus `perf`- und `refactor`-Commits |
| **Fixed** | `fix`-Commits |
| **Security** | Sicherheitsbefunde (`rule: description (file:line, severity …)`) |

- Commits mit Scope erscheinen als `**scope:** description`, sonst nur als Beschreibung.
- Gibt es nichts Nennenswertes, steht im Entwurf `_No notable changes._`.
- Das Datum kommt aus der injizierbaren Uhr `now` der Engine (für deterministische Tests überschreibbar).

---

## Meilensteine

`buildMilestones` leitet die Meilensteine aus den Commits ab:

- Commits **mit Scope** werden je Scope gebündelt → Titel `Scope: <scope>`.
- Scopelose Commits werden nach Kategorie gebündelt. Titel-Mapping:

  | Typ | Titel |
  |---|---|
  | `feat` | Features |
  | `fix` | Bug fixes |
  | `perf` | Performance |
  | `refactor` | Refactoring |
  | `docs` | Documentation |
  | `test` | Testing |
  | `chore` | Maintenance |
  | sonst | General changes |

Alle erzeugten Meilensteine sind als `done: true` markiert, da sie bereits committete Arbeit zusammenfassen.

---

## Risikobewertung

`assessRisks` ist eine deterministische Heuristik:

| Auslöser | Severity | Mitigation (verkürzt) |
|---|---|---|
| Breaking Changes vorhanden | `high` | Migrationsleitfaden, Major-Bump klar kommunizieren |
| Sicherheitsbefunde vorhanden | aus maximaler Befund-Severity (`critical`/`high` → `high`, `medium` → `medium`, sonst `low`) | exponierte Credentials rotieren, jeden Befund beheben oder formal akzeptieren |
| großer Diff (> 2000 geänderte Zeilen) | `medium` | zusätzliche Review-Runde, gestaffeltes Rollout |
| Conventional-Commit-Quote < 50 % | `low` | Conventional Commits einführen |

---

## Optionaler LLM-Provider

Ist ein `ILLMProvider` konfiguriert, wird der heuristische Changelog-Entwurf von ihm poliert:

- Modell: `versioning.changelog.model` (Default `mistral-medium`),
- `temperature: 0.2`, `maxTokens: 2048`,
- der Provider erhält die Anweisung, **Struktur und Markdown beizubehalten** und nur die Formulierung zu verbessern.

**Ausfallsicher:** schlägt der Provider-Aufruf fehl oder liefert er leeren Text, bleibt der heuristische Entwurf erhalten (mit Warn-Log). Der Provider kann ein Release also nie blockieren. Unterstützte Provider: Mistral, OpenAI, Anthropic, Ollama.

---

## Programmatische Nutzung

```typescript
import { ReleasePlanningEngine } from "@ultracode/core";

const planner = new ReleasePlanningEngine({ logger, provider, config });
const plan = await planner.plan("0.3.0", analysis, { targetDate: "2026-09-01" });
```

Über das verdrahtete System:

```typescript
const plan = await system.plan();           // Zielversion automatisch vorgeschlagen
const plan2 = await system.plan("0.3.0");    // explizite Zielversion
```

---

## Weiterführend

- [Versionierungssystem](./versioning-system.md) — Gesamtüberblick und `version`-Befehle
- [Quality Gates](./quality-gates.md) — Freigabeprüfung vor dem Release
- [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md) — Architektur und Implementierung
