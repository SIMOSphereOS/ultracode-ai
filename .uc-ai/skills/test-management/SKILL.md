---
name: test-management
description: "DE: Test-Management für ultracode-ai — Teststrategie (vitest-Projekte shared/core/cli/e2e), TDD als Standard, Test-Gap-Analyse mit Risiko-Priorisierung P1–P4, Test-Scaffolding, Coverage-Gates (v8, 85/85/80) und CI-Testreport (junit.xml). Trigger: Tests schreiben, Testabdeckung, fehlende Tests, Coverage, Test-Lücken, flaky Test, Test-Skip, TDD, Unit-Test, E2E-Test, vitest. EN: Test management for ultracode-ai — test strategy (vitest projects shared/core/cli/e2e), TDD as the default, test gap analysis with risk priorities P1–P4, test scaffolding, coverage gates (v8, 85/85/80) and CI test report (junit.xml). Trigger: write tests, test coverage, missing tests, coverage gaps, untested code, flaky test, skipped test, TDD, unit test, e2e test, vitest."
---

# Test-Management — ultracode-ai

**DE:** Verbindlicher Standard für alle Test-Arbeiten in diesem Repo: Strategie, TDD, Gap-Analyse, Scaffolding, Qualitätsregeln und CI-Zusammenspiel. Regeln gelten für jede Feature-, Bugfix- und Refactoring-Arbeit.
**EN:** Binding standard for all testing work in this repo: strategy, TDD, gap analysis, scaffolding, quality rules and CI integration. These rules apply to every feature, bugfix and refactoring task.

## Grundregeln / Ground Rules

**DE:**
1. Code IMMER lesen, bevor Test-Lücken behauptet werden — keine Annahmen.
2. Test zuerst (TDD) bei jedem Feature und jedem Bugfix — Ausnahme nur mit expliziter Begründung im Report.
3. Coverage-Zahlen nur nennen, wenn gemessen `[M]` — sonst als Schätzung `[E]` kennzeichnen.
4. Kein `it.skip`/`describe.skip` ohne referenziertes Ticket. Kein Löschen fehlschlagender Tests, um CI grün zu bekommen.
5. Triviale Pfade (Re-Exports, reine Typ-Dateien, Config-Loader) NICHT zwanghaft testen — Fokus auf Risiko.

**EN:**
1. ALWAYS read the code before claiming test gaps — no assumptions.
2. Test first (TDD) for every feature and every bugfix — deviations only with an explicit justification in the report.
3. Quote coverage numbers only when measured `[M]` — otherwise mark them as estimates `[E]`.
4. No `it.skip`/`describe.skip` without a referenced ticket. Never delete failing tests to make CI green.
5. Do NOT force tests onto trivial paths (re-exports, pure type files, config loaders) — focus on risk.

## 1. Teststrategie des Repos / Repository Test Strategy

**DE:** Eine einzige `vitest.config.ts` im Root definiert **vier vitest-Projekte**. Drei davon bilden die Unit-Ebene (je Package eines), das vierte die E2E-Ebene:

**EN:** A single root-level `vitest.config.ts` defines **four vitest projects**. Three of them form the unit level (one per package), the fourth is the e2e level:

| vitest-Projekt / project | Include | Ebene / Level | CI-Job |
|---|---|---|---|
| `shared` | `packages/shared/src/**/*.test.ts`, `packages/shared/tests/**` | Unit | `unit_tests` |
| `core` | `packages/core/src/**/*.test.ts`, `packages/core/tests/**` | Unit | `unit_tests` |
| `cli` | `packages/cli/src/**/*.test.ts(x)`, `packages/cli/tests/**` (Ink-UI: `FORCE_COLOR=0` gepinnt / pinned) | Unit | `unit_tests` |
| `e2e` | `tests/**/*.test.ts` (`testTimeout: 120_000`) | E2E | `e2e_tests` |

**Konventionen / Conventions:**

- **DE:** Namenskonvention `*.test.ts` (CLI-UI zusätzlich `*.test.tsx`), Co-Location neben dem Quellcode (`Foo.ts` → `Foo.test.ts` im selben Verzeichnis). E2E-Tests liegen ausschließlich in `tests/` im Root.
  **EN:** Naming convention `*.test.ts` (CLI UI additionally `*.test.tsx`), co-located next to the source (`Foo.ts` → `Foo.test.ts` in the same directory). E2E tests live exclusively in the root `tests/` directory.
- **DE:** Coverage via `@vitest/coverage-v8`, Scope `packages/*/src/**` (ohne `*.test.*` und `dist/`). Schwellen sind CI-Gates: **lines 85 / statements 85 / branches 80** — vitest bricht bei Unterschreitung mit Exit ≠ 0 ab.
  **EN:** Coverage via `@vitest/coverage-v8`, scoped to `packages/*/src/**` (excluding `*.test.*` and `dist/`). Thresholds are CI gates: **lines 85 / statements 85 / branches 80** — vitest exits non-zero when any threshold is missed.
- **DE:** Bei `CI=true` schreibt vitest zusätzlich `junit.xml` (Reporter `["default", "junit"]`); die Jobs `unit_tests` und `e2e_tests` laden es als GitLab-Testreport hoch. Lokal entsteht KEIN `junit.xml`.
  **EN:** With `CI=true`, vitest additionally emits `junit.xml` (reporters `["default", "junit"]`); the `unit_tests` and `e2e_tests` jobs upload it as the GitLab test report. Locally NO `junit.xml` is written.

**Kommandos / Commands:**

```bash
pnpm test                    # alle vier Projekte / all four projects (vitest run)
pnpm test -- --project core  # nur ein Projekt / a single project
pnpm test:watch              # Watch-Modus lokal / local watch mode
pnpm test:e2e                # nur e2e (braucht vorher `pnpm build`! / requires `pnpm build` first!)
pnpm test:coverage           # Coverage-Lauf mit Gates / coverage run with gates
pnpm ci:local                # lokaler CI-Spiegel / local CI mirror (scripts/ci.sh)
```

## 2. TDD als Standard / TDD as the Default

**DE:** Red–Green–Refactor ist der Normalfall, nicht die Ausnahme:
1. **Red** — Fehlschlagenden Test schreiben, der das gewünschte Verhalten (Feature) oder den Bug (Regression) exakt beschreibt. Test laufen lassen und den Fehlschlag SEHEN.
2. **Green** — Minimale Implementierung, bis der Test grün ist.
3. **Refactor** — Aufräumen nach Skill `clean-code`; Tests bleiben grün.

Bei **Bugfixes** ist der Reproduktions-Test Pflicht: Erst ein Test, der den Bug nachstellt und fehlschlägt, dann der Fix. So wird jeder Bug zur permanenten Regression-Barriere.

**EN:** Red–green–refactor is the norm, not the exception:
1. **Red** — Write a failing test that precisely describes the desired behaviour (feature) or the bug (regression). Run it and SEE it fail.
2. **Green** — Minimal implementation until the test passes.
3. **Refactor** — Clean up per the `clean-code` skill; tests stay green.

For **bugfixes** a reproduction test is mandatory: first a test that reproduces the bug and fails, then the fix. Every bug becomes a permanent regression barrier.

## 3. Test-Gap-Analyse / Test Gap Analysis (SIMO-Muster)

### Daten-Provenienz / Data Provenance

| Label | DE | EN | Marker |
|---|---|---|---|
| Gemessen / Measured | aus `pnpm test:coverage` (v8-Report) | from `pnpm test:coverage` (v8 report) | `[M]` |
| Geschätzt / Estimated | aus Code-Analyse ohne Coverage-Lauf | from code analysis without a coverage run | `[E]` |

### Risiko-Priorisierung / Risk Prioritisation

**DE:** Lücken nach Geschäftsrisiko einordnen, nicht nach Zeilenanzahl. Für dieses Repo konkret:
**EN:** Rank gaps by business risk, not by line count. Concretely for this repo:

| Priorität / Priority | Kriterium / Criterion | Beispiele in ultracode-ai / Examples |
|---|---|---|
| **P1 CRITICAL** | Business-Logik, Sicherheits- und Release-Pfade / business logic, security and release paths | `packages/core/src/versioning/` (SemVer-Empfehlung, Release-Gates), `packages/core/src/execution/` (ExecutionEngine, QueryPipeline, Env-Leak-Schutz), Agenten-Orchestrierung in `packages/core/src/agents/` |
| **P2 HIGH** | Öffentliche Schnittstellen / public surfaces | CLI-Commands (`packages/cli/src/commands/`), `program.ts`, Package-Exports (`index.ts`-APIs) |
| **P3 MEDIUM** | Utilities mit Seiteneffekten / utilities with side effects | File-I/O, `SqliteSessionStore`, Prozess-Spawning, Logger-Senken / logger sinks |
| **P4 LOW** | Pure Functions ohne Tests / untested pure functions | Formatter (`format.ts`), Text-Utils (`utils/text.ts`), Validatoren |
| **SKIP** | Triviale Pfade / trivial paths | Re-Exports, reine Typdefinitionen, Getter/Setter, generierte Dateien |

### Workflow

```bash
# 1. Baseline messen / measure the baseline [M]
pnpm test:coverage
# Report unter coverage/ — pro Datei auswertbar. vitest.config.ts setzt KEINEN
# coverage.reporter, daher greifen die v8-Defaults: text (stdout) + html/clover/json.
# Report under coverage/ — inspectable per file. vitest.config.ts sets NO
# coverage.reporter, so the v8 defaults apply: text (stdout) + html/clover/json.

# 2. Quelldateien ohne Test-Nachbarn finden / find sources without test siblings [E]
find packages/*/src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts"
```

**DE:** Danach jede Kandidaten-Datei LESEN, Risiko-Stufe zuweisen, nur testbare Lücken melden.
**EN:** Then READ every candidate file, assign a risk tier, report only testable gaps.

### Report-Format

```
## Test Coverage Gap Report — ultracode-ai

Baseline: lines <X>% / branches <Y>% [M|E]   (Gates: 85/85/80)
Lücken gefunden / gaps found: <N>
Scaffolding erstellt / scaffolds created: <N> Dateien / files

### P1 CRITICAL
- [ ] <Funktion/function> in <packages/…/Datei.ts> — <Risiko-Begründung / risk rationale>

### P2 HIGH
- [ ] …

### P3 MEDIUM / P4 LOW
- [ ] …

SKIP (bewusst nicht getestet / deliberately untested): <Liste + Grund / list + reason>
```

## 4. Test-Scaffolding-Vorlage / Test Scaffolding Template

**DE:** Pro Lücke ein Skeleton mit Arrange/Act/Assert, Edge-Case-TODOs und Mock-Setup. Repo-Idiome: ESM mit `.js`-Import-Suffix, Builder-Helper für Fixtures (siehe `VersionRecommender.test.ts`), `vi.mock` nur für echte Seiteneffekte.
**EN:** One skeleton per gap with arrange/act/assert, edge-case TODOs and mock setup. Repo idioms: ESM with `.js` import suffix, builder helpers for fixtures (see `VersionRecommender.test.ts`), `vi.mock` only for real side effects.

```typescript
// packages/core/src/example/Example.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Example } from "./Example.js"; // ESM: .js-Suffix zwingend / .js suffix mandatory

// Seiteneffekte mocken, keine reine Logik / mock side effects, never pure logic
vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

/** Fixture-Builder statt Copy-Paste-Objekte / fixture builder instead of copy-paste objects */
function makeInput(partial: Partial<Input> = {}): Input {
  return { id: "x", value: 0, ...partial };
}

describe("Example.process", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("verarbeitet den Normalfall / handles the happy path", () => {
    // Arrange
    const input = makeInput({ value: 42 });
    // Act
    const result = new Example().process(input);
    // Assert
    expect(result.status).toBe("ok");
  });

  it("wirft bei ungültiger Eingabe / throws on invalid input", () => {
    expect(() => new Example().process(makeInput({ value: -1 }))).toThrow(/invalid/i);
  });

  // TODO Edge Cases:
  // - leere Eingabe / empty input
  // - Grenzwerte (0, MAX_SAFE_INTEGER) / boundary values
  // - Unicode/Umlaute in Strings / unicode input
  // - Nebenläufigkeit, falls async / concurrency if async
});
```

**DE:** E2E-Skeletons folgen `tests/e2e.test.ts`: gebaute CLI (`packages/cli/dist/index.js`) via `process.execPath` spawnen, `shell: false`, Provider-Keys aus dem Env kopieren und LÖSCHEN (offline-deterministisch), Assertions auf Exit-Code + stdout.
**EN:** E2E skeletons follow `tests/e2e.test.ts`: spawn the built CLI (`packages/cli/dist/index.js`) via `process.execPath`, `shell: false`, copy the env and DELETE all provider keys (offline-deterministic), assert on exit code + stdout.

## 5. Qualitätsregeln / Quality Rules

- **Kein Skip ohne Ticket / No skip without a ticket:**
  **DE:** Unbedingtes `it.skip`/`describe.skip`/`test.skip` nur mit Kommentar, der ein Ticket/Issue referenziert (`// SKIP: <issue-URL> — <Grund>`). Fähigkeits-Gates wie `describe.skipIf(!SQLITE_AVAILABLE)` (siehe `SqliteSessionStore.test.ts`) sind erlaubt — sie dokumentieren eine Umgebungsbedingung, keinen kaputten Test.
  **EN:** Unconditional `it.skip`/`describe.skip`/`test.skip` only with a comment referencing a ticket/issue (`// SKIP: <issue URL> — <reason>`). Capability gates like `describe.skipIf(!SQLITE_AVAILABLE)` (see `SqliteSessionStore.test.ts`) are allowed — they document an environment condition, not a broken test.
- **Flaky-Policy:**
  **DE:** Ein Test, der ohne Code-Änderung mal grün, mal rot ist, wird SOFORT behandelt: Ursache finden (Timing, Umgebungs-Abhängigkeit, geteilter Zustand) statt Retry-Schleifen oder höhere Timeouts als Pflaster. Umgebungs-Abhängigkeiten explizit pinnen — Vorbild: `FORCE_COLOR: "0"` im cli-Projekt, nachdem eine `FORCE_COLOR=3`-Shell 6 UI-Tests brach. Kein `retry` in der vitest-Config als Dauerlösung.
  **EN:** A test that flips between green and red without code changes is handled IMMEDIATELY: find the cause (timing, environment dependency, shared state) instead of retry loops or inflated timeouts as band-aids. Pin environment dependencies explicitly — role model: `FORCE_COLOR: "0"` in the cli project after a `FORCE_COLOR=3` shell broke 6 UI tests. No `retry` in the vitest config as a permanent fix.
- **E2E-Pflichtbereiche / Mandatory e2e coverage:**
  **DE:** Beobachtbares CLI-Verhalten (Exit-Codes, stdout, Key-Redaction) gehört in `tests/e2e.test.ts`; npm-Publish-Invarianten (`files`, `main`/`types`, `prepublishOnly`, keine `workspace:*`-Specifier, Repo-URLs) in `tests/packaging.test.ts`. Änderungen an `package.json`-Manifesten oder am CLI-Einstieg OHNE angepassten E2E-/Packaging-Test sind unvollständig.
  **EN:** Observable CLI behaviour (exit codes, stdout, key redaction) belongs in `tests/e2e.test.ts`; npm publish invariants (`files`, `main`/`types`, `prepublishOnly`, no `workspace:*` specifiers, repo URLs) in `tests/packaging.test.ts`. Changes to `package.json` manifests or the CLI entry point WITHOUT an updated e2e/packaging test are incomplete.
- **Suppression-Gate:**
  **DE:** `@ts-expect-error` ist NUR in Tests erlaubt, `@ts-ignore`/`@ts-nocheck` nirgends — erzwungen vom CI-Job `suppressions` (`pnpm check:suppressions`).
  **EN:** `@ts-expect-error` is allowed ONLY in tests, `@ts-ignore`/`@ts-nocheck` nowhere — enforced by the `suppressions` CI job (`pnpm check:suppressions`).

## 6. Zusammenspiel mit Agent und CI / Interplay with Agent and CI

**DE:** Der Repo-Agent **test-engineer** (`.uc-ai/agents/test-engineer.md`) wendet diesen Skill an: Er führt Gap-Analysen nach Abschnitt 3 aus, erstellt Scaffolding nach Abschnitt 4 und implementiert Tests TDD-konform. Der **dev-orchestrator** delegiert Test-Aufgaben an ihn; der **code-quality-reviewer** prüft Testqualität im Review (Skill `clean-code`); der **release-manager** verlangt vor jedem Release grüne Gates (Skill `release-management`).
**EN:** The repo agent **test-engineer** (`.uc-ai/agents/test-engineer.md`) applies this skill: it runs gap analyses per section 3, creates scaffolding per section 4 and implements tests TDD-style. The **dev-orchestrator** delegates testing tasks to it; the **code-quality-reviewer** checks test quality during review (skill `clean-code`); the **release-manager** requires green gates before every release (skill `release-management`).

**CI-Gates (`.gitlab-ci.yml`):**

| Job | Gate |
|---|---|
| `unit_tests` | `pnpm test -- --project shared --project core --project cli`; `junit.xml` → GitLab-Testreport |
| `e2e_tests` | `pnpm test:e2e` (tests/-Projekt); `junit.xml` → GitLab-Testreport |
| `coverage` | `pnpm test:coverage` auf main + MRs; Schwellen 85/85/80 als harter Fail / hard fail. Kein `coverage.reporter` konfiguriert → v8-Defaults (text/html/clover/json), **kein Cobertura** / no reporter configured → v8 defaults, no Cobertura |
| `typecheck` / `lint` / `suppressions` | flankierende Qualitäts-Gates / accompanying quality gates |

**DE:** Vor jedem Push: `pnpm ci:local` — spiegelt die Pipeline lokal und verhindert rote MRs. Workflow-Details (Branch, MR, Commit-Konvention) im Skill `dev-workflow`; Doku-Pflege nach Testarchitektur-Änderungen im Skill `documentation-management`.
**EN:** Before every push: `pnpm ci:local` — mirrors the pipeline locally and prevents red MRs. Workflow details (branch, MR, commit convention) live in the `dev-workflow` skill; documentation upkeep after test-architecture changes in the `documentation-management` skill.
