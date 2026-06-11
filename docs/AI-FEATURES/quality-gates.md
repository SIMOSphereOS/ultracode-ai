# UltraCode Quality Gates

> Freigabeprüfung vor dem Release: fünf gewichtete Gates ergeben einen Gesamtscore von 0–100 und ein klares Pass/Fail.

Das `QualityGateSystem` (in `packages/core/src/versioning/QualityGateSystem.ts`) führt die Gates deterministisch aus. Jeder externe Effekt ist injizierbar (Command-Runner) oder wird aus dem lokalen Dateisystem gelesen — dadurch offline testbar und reproduzierbar. Architekturdetails: [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md#quality-gate-system).

---

## Befehl

```bash
ultracode quality
ultracode quality --json
```

`ultracode quality` setzt bei nicht bestandenen Gates `process.exitCode = 1` und ist damit **CI-freundlich** — die Pipeline bricht von selbst ab. `--json` liefert den `QualityReport`.

```yaml
# CI-Schritt (plattformunabhängig)
- name: Quality Gates
  run: ultracode quality
```

---

## Die fünf Gates und ihre Gewichtung

```typescript
const GATE_WEIGHTS = { tests: 35, coverage: 25, security: 25, docs: 10, review: 5 };
```

| Gate | Gewicht | Prüfung | Bestanden, wenn |
|---|---:|---|---|
| `tests` | 35 | Test-Kommando über den `CommandRunner` ausführen | Exit-Code 0 |
| `coverage` | 25 | `coverage/coverage-summary.json` → `total.lines.pct` | `pct >= minCoverage` |
| `security` | 25 | Sicherheitsbefunde der Change-Analyse | keine `high`/`critical`-Befunde |
| `docs` | 10 | `README.md` + `CHANGELOG.md` plus JSDoc-Heuristik | beide Dateien vorhanden |
| `review` | 5 | Code-Review-Pflicht | `reviewApproved === true` |

---

## Score-Berechnung

Jedes Gate liefert einen Einzelscore (0–100). Der Gesamtscore ist die **gewichtete Summe der aktiven Gates geteilt durch ihr Gesamtgewicht**, gerundet:

```text
overallScore = round( Σ (gewicht_gate · score_gate) / Σ gewicht_gate )   über aktive Gates
```

**Übersprungene Gates verteilen ihr Gewicht** auf die verbleibenden — sie ziehen den Score also nicht nach unten. Ein Gate wird übersprungen, wenn:

- `tests`: kein `testCommand` gesetzt **oder** `skipTests = true`,
- `coverage`: keine `coverage-summary.json` gefunden,
- `security`: keine `ChangeAnalysis` übergeben,
- `review`: `versioning.quality.requireReview = false`.

Sind **alle** Gates übersprungen, ist der `overallScore` 100. `passed` ist `true`, wenn **jedes aktive** Gate besteht.

---

## Gate-Details

### tests (35)

Führt `input.testCommand` (`{ command, args? }`) über den `CommandRunner` aus. Exit-Code 0 → Score 100/bestanden, sonst Score 0; die erste stderr-Zeile wird als Hinweis übernommen. Lässt sich das Kommando gar nicht starten, gilt das Gate als nicht bestanden (Score 0) mit Begründung. Ohne `testCommand` (oder mit `skipTests`) wird das Gate übersprungen.

> Der `CommandRunner` ist cross-platform: unter **Windows** werden `.cmd`/`.bat`-Shims (npm/pnpm/vitest) über `cmd.exe /d /s /c …` gestartet, auf **Linux/macOS** wird direkt ohne Shell gespawnt.

### coverage (25)

Liest `coverage/coverage-summary.json` relativ zur Projektwurzel und vergleicht `total.lines.pct` mit `versioning.quality.minCoverage` (Default 80). Score ist die gerundete Abdeckung in Prozent. Fehlt die Datei, wird das Gate übersprungen; ist sie vorhanden, aber unbrauchbar, gilt es als nicht bestanden.

Die Summary erzeugt der Test-Lauf, z. B.:

```bash
pnpm test:coverage   # → vitest run --coverage, schreibt coverage/coverage-summary.json
```

### security (25)

Wertet `analysis.securityFindings` aus. Das Gate ist **bestanden**, wenn es **keine** `high`- oder `critical`-Befunde gibt. Der Score sinkt mit der Schwere der Befunde:

```text
score = clamp( 100 − 40·critical − 25·high − 10·medium − 5·low , 0, 100 )
```

Ohne `ChangeAnalysis` wird das Gate übersprungen. Auf System-Ebene berechnet `system.quality()` die Analyse bei Bedarf selbst und füttert sie diesem Gate. Welche Regeln Befunde erzeugen, steht unter [Versionierungssystem → Security-Erkennung](./versioning-system.md#wie-erkannt-wird).

### docs (10)

Prüft die Anwesenheit von `README.md` und `CHANGELOG.md` (für `passed` müssen **beide** vorhanden sein) und ergänzt eine JSDoc-Heuristik über die Quellbäume (`packages/*/src` bzw. `src`):

```text
score = round( (README? 25 : 0) + (CHANGELOG? 25 : 0) + JSDoc-Quote · 50 )
```

Die JSDoc-Quote ist der Anteil exportierter Top-Level-Symbole, denen ein `/** … */`-Block direkt vorausgeht (gescannt werden bis zu 200 Dateien, Tests und `.d.ts` ausgenommen).

### review (5)

Steuerung über `versioning.quality.requireReview` (Default `true`). Ist Review erforderlich, besteht das Gate nur mit `input.reviewApproved = true` (Score 100), sonst Score 0 mit dem Hinweis, `reviewApproved: true` nach erfolgtem Review zu setzen. Ist Review nicht erforderlich, wird das Gate übersprungen.

---

## Textausgabe

Formatiert über `formatQualityReport` (`✓`/`✗` je Gate, Score in Klammern):

```text
Quality Report — ✗ FAILED (overall score 78)
  ✓ tests (100) — test command "pnpm" exited with code 0
  ✓ coverage (94) — line coverage 94% (minimum 80%)
  ✗ security (75) — 1 high/critical security finding(s) block the release
  ✓ docs (96) — JSDoc coverage 184/192 exported symbol(s) (96%)
  ✓ review (100) — code review confirmed
```

Ein bestandener Bericht beginnt mit `✓ PASSED`.

---

## JSON-Struktur (`QualityReport`)

```json
{
  "passed": false,
  "overallScore": 78,
  "gates": [
    { "gate": "tests", "passed": true, "score": 100, "details": "test command \"pnpm\" exited with code 0" },
    { "gate": "coverage", "passed": true, "score": 94, "details": "line coverage 94% (minimum 80%)" },
    { "gate": "security", "passed": false, "score": 75, "details": "1 high/critical security finding(s) block the release" },
    { "gate": "docs", "passed": true, "score": 96, "details": "JSDoc coverage 184/192 exported symbol(s) (96%)" },
    { "gate": "review", "passed": true, "score": 100, "details": "code review confirmed" }
  ]
}
```

Übersprungene Gates erscheinen mit `details: "skipped: …"` und ohne `score`.

---

## Programmatische Nutzung

```typescript
import { QualityGateSystem } from "@ultracode/core";

const gates = new QualityGateSystem({ cwd: process.cwd(), logger, config: versioningConfig });
const report = await gates.check({
  analysis,                                  // füttert das security-Gate
  testCommand: { command: "pnpm", args: ["test"] },
  reviewApproved: true,
});
```

Über das verdrahtete System (berechnet die Analyse bei Bedarf selbst):

```typescript
const report = await system.quality({
  testCommand: { command: "pnpm", args: ["test"] },
  reviewApproved: true,
});
```

`QualityCheckInput` akzeptiert zusätzlich `skipTests` und ein `signal` (`AbortSignal`), das an den Command-Runner durchgereicht wird.

---

## Konfiguration

```toml
[versioning.quality]
minCoverage = 80      # Schwelle des coverage-Gates
requireReview = true  # review-Gate aktiv
```

Vollständige Schlüsselliste: [AI-Versionierung (Entwicklung) → Konfiguration](../DEVELOPMENT/ai-versioning.md#konfiguration).

---

## Weiterführend

- [Versionierungssystem](./versioning-system.md) — Gesamtüberblick und `version`-Befehle
- [Release Planning](./release-planning.md) — Changelog, Meilensteine, Risiken
- [AI-Versionierung (Entwicklung)](../DEVELOPMENT/ai-versioning.md) — Architektur und Implementierung
