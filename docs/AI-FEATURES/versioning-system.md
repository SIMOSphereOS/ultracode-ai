# UltraCode AI — AI-Versionierungssystem

> Das Herzstück und Alleinstellungsmerkmal von UltraCode AI: ein KI-gestütztes Versionierungs- und Release-Management-System, das aus dem Git-Verlauf die nächste Version, den Changelog und die Freigabereife ableitet.

Diese Seite erklärt das System aus Anwendersicht und zeigt echte CLI-Beispiele mit der tatsächlichen Ausgabestruktur. Die technische Architektur findet sich unter [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md).

---

## Was es tut

Das System liest einen Git-Commit-Bereich und liefert in vier Schritten:

| Baustein | Frage | Ergebnis |
|---|---|---|
| **Change Analysis Engine** | Was hat sich geändert? | Dateien, Commits, Breaking Changes, Sicherheitsbefunde |
| **Version Recommender** | Welche Version kommt als Nächstes? | SemVer-Bump mit Confidence und Begründungen |
| **Release Planning Engine** | Wie sieht das Release aus? | Changelog-Entwurf, Meilensteine, Risiken |
| **Quality Gate System** | Ist es freigabereif? | gewichteter Score und Gate-Status |

Alles ist **deterministisch und offline lauffähig**. Ein LLM-Provider (Mistral, OpenAI, Anthropic, Ollama) ist optional und poliert nur den Changelog-Text — keine Funktion hängt von ihm ab.

> Das System arbeitet **direkt auf Git**. Es muss in einem Git-Work-Tree laufen, und `git` muss installiert sein. Andernfalls meldet es einen klaren Fehler.

---

## Voraussetzungen

- Node.js ≥ 20
- ein Git-Repository (Work-Tree) mit installiertem `git`-Binary
- die UltraCode AI-CLI (Binary `ultracode-ai`) bzw. die Kernbibliothek `ultracode-core`

Das System läuft plattformübergreifend auf **Linux, macOS und Windows**. Git wird ohne Shell aufgerufen; Quality-Gate-Kommandos werden unter Windows automatisch über `cmd.exe` gestartet, damit `npm`/`pnpm`/`vitest`-Shims funktionieren.

---

## CLI-Befehle im Überblick

| Befehl | Zweck |
|---|---|
| `ultracode-ai version analyze [range]` | Änderungen im Bereich analysieren |
| `ultracode-ai version suggest [range]` | nächste Version vorschlagen |
| `ultracode-ai release plan [version]` | Release-Plan entwerfen |
| `ultracode-ai quality` | Quality Gates ausführen (Exit-Code 1 bei Fehlschlag) |

Jeder Befehl unterstützt `--json` für maschinenlesbare Ausgabe. Der `range` ist ein Git-Bereich wie `v1.2.0..HEAD`; ohne Angabe wird vom letzten Tag bis `HEAD` analysiert (oder die volle Historie, falls kein Tag existiert).

---

## `version analyze` — Änderungen analysieren

```bash
ultracode-ai version analyze
ultracode-ai version analyze v0.2.3..HEAD
ultracode-ai version analyze v0.2.3..HEAD --json
```

Textausgabe (`formatChangeAnalysis`):

```text
Change Analysis
  Files:   7 changed (+412 / -38)
  Commits: 9 (feat 3, fix 2, docs 1, refactor 1, test 1, chore 1, perf 0, other 0)
  Breaking changes: 1
    - [api-diff] Exported symbol "createLegacyClient" was removed from packages/core/src/legacy.ts (packages/core/src/legacy.ts)
  Security findings: 1
    - [high] secret.hardcoded-credential in packages/core/src/demo.ts:42 — Hardcoded credential assignment (api key / token / password) with literal value
```

JSON-Struktur (`ChangeAnalysis`):

```json
{
  "files": [{ "path": "…", "status": "modified", "additions": 120, "deletions": 8 }],
  "commits": [{ "hash": "…", "type": "feat", "scope": "core", "subject": "feat(core): …", "breaking": false }],
  "breakingChanges": [{ "source": "api-diff", "description": "Exported symbol \"…\" was removed from …", "location": "…" }],
  "categories": { "feat": 3, "fix": 2, "docs": 1, "refactor": 1, "test": 1, "chore": 1, "perf": 0, "other": 0 },
  "securityFindings": [{ "severity": "high", "rule": "secret.hardcoded-credential", "file": "…", "line": 42, "description": "…" }]
}
```

### Wie erkannt wird

- **Conventional Commits** — Subjects der Form `type(scope)!: description` werden geparst; nicht-konforme Commits zählen als `type: null` (kein Fehler).
- **Breaking Changes** — `!`-Marker im Subject, `BREAKING CHANGE:`/`BREAKING-CHANGE:`-Footer im Body (`source: "commit"`) **und** entfernte Export-Symbole in modifizierten TypeScript-Dateien (`source: "api-diff"`).
- **Security** — zeilenbasierte Regeln (AWS-Key, PEM-Private-Key, hartkodierte Credentials, `eval`/`new Function`, `child_process` aus String-Konkatenation, unsicheres `http://`). Befunde in Testdateien werden um eine Stufe gedämpft.

---

## `version suggest` — nächste Version vorschlagen

```bash
ultracode-ai version suggest
ultracode-ai version suggest v0.2.3..HEAD
ultracode-ai version suggest --json
```

Textausgabe (`formatVersionSuggestion`):

```text
Version Suggestion
  0.2.4 → 0.3.0 (minor bump, confidence 86%)
  Reasons:
    - 1 breaking change(s) detected; on a 0.x version breaking changes map to a minor bump (SemVer pre-1.0 convention).
    - 8 of 9 commit(s) follow the Conventional Commits format.
```

JSON-Struktur (`VersionSuggestion`):

```json
{
  "currentVersion": "0.2.4",
  "suggestedVersion": "0.3.0",
  "bump": "minor",
  "confidence": 0.86,
  "reasons": ["…", "…"]
}
```

### Bump-Heuristik

Erste passende Regel gewinnt:

| Situation | Bump |
|---|---|
| nichts geändert | `none` |
| Breaking Change, Version `0.x` | `minor` (SemVer-pre-1.0-Konvention) |
| Breaking Change, Version `≥ 1.x` | `major` |
| neue `feat`-Commits | `minor` |
| `fix` / `perf` / `refactor` | `patch` |
| nur Doku/Chore/Test ohne Code | `none` |
| nur Doku/Chore/Test, aber Code verändert | `patch` (niedrige Confidence) |

Die **Confidence** (0–1) spiegelt die Conventional-Commit-Quote wider: je mehr Commits der Konvention folgen, desto höher die Confidence. Ein reiner Vorsichts-Patch wird auf maximal 0,40 gedeckelt.

Die Basisversion stammt aus dem Channel `stable` (`versioning.channels.stable`). Prerelease- und Channel-Optionen existieren in der Bibliothek (`system.suggest(range, { channel, prerelease })`), sind über die CLI aber nicht durchgereicht.

---

## `release plan` und `quality`

Siehe die eigenen Seiten mit vollständigen Beispielen:

- [Release Planning](./release-planning.md) — `ultracode-ai release plan`, Changelog-Entwurf, Meilensteine, Risiken
- [Quality Gates](./quality-gates.md) — `ultracode-ai quality`, Gewichtung und Gesamtscore

---

## Programmatische Nutzung

Über die Bibliothek `ultracode-core`:

```typescript
import { createVersioningSystem } from "ultracode-core";

const system = createVersioningSystem({ cwd: process.cwd(), logger, provider, config });

const analysis   = await system.analyze("v0.2.3..HEAD");
const suggestion = await system.suggest();        // VersionSuggestion
const plan       = await system.plan();           // ReleasePlan (Zielversion automatisch)
const report     = await system.quality();        // QualityReport
```

In der Kern-Fassade ist das System als `ultra.versioning` verfügbar (`UltraCode.create({ cwd })`). Details und Signaturen unter [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md).

---

## Typischer Release-Ablauf

```bash
# 1. Was hat sich seit dem letzten Tag getan?
ultracode-ai version analyze

# 2. Welche Version schlägt UltraCode AI vor?
ultracode-ai version suggest

# 3. Release-Plan für die vorgeschlagene Version entwerfen
ultracode-ai release plan

# 4. Quality Gates ausführen (Exit-Code 1 bricht die CI-Pipeline ab)
ultracode-ai quality
```

Beispiel für CI (plattformunabhängig):

```yaml
- name: Quality Gates
  run: ultracode-ai quality
```

`ultracode-ai quality` setzt bei nicht bestandenen Gates den Exit-Code auf 1 — die Pipeline bricht dann von selbst ab.

---

## Konfiguration (Kurzfassung)

Relevant ist der `[versioning]`-Abschnitt in `config.toml`:

```toml
[versioning.channels]
stable = "0.2.4"

[versioning.quality]
minCoverage = 80
requireReview = true

[versioning.changelog]
model = "mistral-medium"
```

Vollständige Schlüsselliste und Defaults: [AI-Versionierung (Entwicklung) → Konfiguration](../DEVELOPMENT/ai-versioning.md#konfiguration).

---

## Weiterführend

- [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md) — Architektur und Implementierung
- [Release Planning](./release-planning.md)
- [Quality Gates](./quality-gates.md)
- [`packages/shared/CONTRACTS.md`](../../packages/shared/CONTRACTS.md) — Typ- und Verhaltensverträge
