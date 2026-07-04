---
name: iteration-quality-gates
description: "DE: Iterative Umsetzung mit Qualitäts-Gates für ultracode-ai — jede Umsetzung startet mit einer PFLICHT-Anforderungs-Erfragung (strukturierter Fragenkatalog → Umsetzungsauftrag/Implementation Charter) und läuft dann in Iterationen (Umsetzen → Gate-Prüfung → Nachbessern), bis ALLE Akzeptanzkriterien erfüllt sind (Umsetzungserreichung). Gates gemappt auf echte Repo-Gates: pnpm ci:local, pnpm test:coverage (85/85/80), pnpm release:check, Review durch code-quality-reviewer, Doku-Pflicht durch doc-curator. Trigger: Iteration, iterativ, Qualitätsgate, Quality-Gate, Akzeptanzkriterien, Umsetzungserreichung, Definition of Done, Anforderungen erfragen, Anforderungsklärung, Umsetzungsauftrag, Charter, Given/When/Then, Fortschritts-Tracking. / EN: Iterative implementation with quality gates for ultracode-ai — every implementation starts with MANDATORY requirements elicitation (structured question catalog → Implementation Charter) and then runs in iterations (implement → gate check → remediate) until ALL acceptance criteria are met (implementation achievement). Gates mapped to the real repo gates: pnpm ci:local, pnpm test:coverage (85/85/80), pnpm release:check, review by code-quality-reviewer, documentation duty by doc-curator. Trigger: iteration, iterate, quality gate, acceptance criteria, definition of done, requirements elicitation, requirements clarification, implementation charter, given/when/then, progress tracking."
---

# Iteration Quality Gates — ultracode-ai

**DE:** Dieser Skill legt fest, WIE Umsetzung in diesem Repo erfolgt: nicht in einem Rutsch, sondern in überprüfbaren Iterationen gegen vorab vereinbarte Akzeptanzkriterien. Er ergänzt `dev-workflow` (die Phasen-Kaskade) um die Iterations-Mechanik und die verbindliche Anforderungs-Erfragung. Er gilt für jede Feature-, Bugfix- und Refactoring-Umsetzung, sobald der Nutzer eine Umsetzung anstößt.
**EN:** This skill defines HOW implementation happens in this repo: not in one shot, but in verifiable iterations against acceptance criteria agreed up front. It complements `dev-workflow` (the phase cascade) with the iteration mechanics and the mandatory requirements elicitation. It applies to every feature, bugfix and refactoring implementation as soon as the user initiates an implementation.

## 1. Zweck / Purpose

**DE:** Umsetzung erfolgt in Iterationen. Eine Iteration ist der Dreitakt **Umsetzen → Gate-Prüfung → Nachbessern**. Iteriert wird so lange, bis ALLE im Umsetzungsauftrag vereinbarten Akzeptanzkriterien erfüllt UND alle relevanten Gates grün sind. Diesen Zielzustand nennen wir **Umsetzungserreichung**: kein offenes Muss-Kriterium, kein rotes Gate. Teil-Erfüllung ist kein Abschluss — sie ist der Beginn der nächsten Iteration.

Zwei Leitsätze aus der DNA gelten durchgängig:
- **Fakten, nicht Spekulation** — Ist-Zustand im Code prüfen, Akzeptanzkriterien belegen, nie Erfüllung behaupten. Grün heißt: Kommando-Output gesehen.
- **Fehler nur einmal** — vor dem Fix `docs/lessons-learned/` prüfen, nach dem Fix Root Cause dokumentieren.

**EN:** Implementation runs in iterations. One iteration is the three-beat **implement → gate check → remediate**. Iterate until ALL acceptance criteria agreed in the Implementation Charter are met AND all relevant gates are green. We call this target state **implementation achievement** (Umsetzungserreichung): no open must-have criterion, no red gate. Partial fulfilment is not completion — it is the start of the next iteration.

Two DNA principles apply throughout:
- **Facts, not speculation** — verify the actual code state, evidence every acceptance criterion, never claim fulfilment. Green means: command output seen.
- **Mistakes only once** — before the fix check `docs/lessons-learned/`, after the fix document the root cause.

## 2. PFLICHT: Anforderungs-Erfragung zu Beginn / MANDATORY: Requirements Elicitation Up Front

**DE:** BEVOR eine Zeile Code entsteht, erfragt der Assistent bzw. der Agent `dev-orchestrator` die Anforderungen strukturiert beim Nutzer. Ohne beantworteten Fragenkatalog gibt es keinen Umsetzungsauftrag — und ohne Umsetzungsauftrag keine Umsetzung. Ausnahme nur bei trivialen, eindeutig spezifizierten Aufträgen; dann werden die Annahmen dennoch als Charter dokumentiert und dem Nutzer zur Bestätigung vorgelegt (Anti-Rückfrage-Regel: nicht endlos nachfragen, sondern begründete Annahmen treffen und sichtbar machen).

**EN:** BEFORE a single line of code is written, the assistant or the `dev-orchestrator` agent elicits the requirements from the user in a structured way. No answered question catalog → no Implementation Charter — and no Charter → no implementation. Exception only for trivial, unambiguously specified tasks; even then the assumptions are documented as a Charter and shown to the user for confirmation (anti-back-and-forth rule: do not ask endlessly, make justified assumptions and surface them).

### 2.1 Fragenkatalog / Question Catalog

**DE:** Sieben Blöcke, in dieser Reihenfolge. Jede Antwort wird in den Umsetzungsauftrag übernommen.
**EN:** Seven blocks, in this order. Every answer is carried into the Implementation Charter.

| # | Block (DE) | Block (EN) | Leitfragen / Guiding questions |
|---|---|---|---|
| 1 | **Ziel / Outcome** | **Goal / Outcome** | DE: Welches konkrete Ergebnis soll am Ende stehen? Für wen, welcher Nutzen? / EN: What concrete outcome should exist at the end? For whom, what benefit? |
| 2 | **Akzeptanzkriterien** | **Acceptance criteria** | DE: Woran messen wir Erfolg? Jedes Kriterium messbar und prüfbar (Abschnitt 5). / EN: How do we measure success? Each criterion measurable and testable (section 5). |
| 3 | **Scope & Nicht-Ziele** | **Scope & non-goals** | DE: Was gehört dazu — und was ausdrücklich NICHT? Welche Pakete (`shared`/`core`/`cli`) sind betroffen? / EN: What is in scope — and what is explicitly NOT? Which packages (`shared`/`core`/`cli`) are affected? |
| 4 | **Prioritäten (Muss/Kann)** | **Priorities (must/should/could)** | DE: Welche Kriterien sind MUSS, welche KANN? Reihenfolge bei knapper Zeit? / EN: Which criteria are MUST, which are nice-to-have? Order under time pressure? |
| 5 | **Randbedingungen** | **Constraints** | DE: Kompatibilität (SemVer, Breaking Changes, `packages/core/src/providers/catalog.ts` nicht anfassen), Performance, Sicherheit/Compliance, Abhängigkeitsrichtung `shared → core → cli`. / EN: Compatibility (SemVer, breaking changes, do not touch `packages/core/src/providers/catalog.ts`), performance, security/compliance, dependency direction `shared → core → cli`. |
| 6 | **Definition of Done** | **Definition of Done** | DE: Welche Gates müssen grün sein? Doku, CHANGELOG, Tests, Coverage, Review — Standard-DoD aus `dev-workflow`, ggf. erweitert. / EN: Which gates must be green? Docs, CHANGELOG, tests, coverage, review — standard DoD from `dev-workflow`, extended if needed. |
| 7 | **Iterationstiefe** | **Iteration depth** | DE: Wie tief iterieren — nur Muss-Kriterien grün, oder Kann-Kriterien und Politur eingeschlossen? Zeit-/Aufwandsrahmen? / EN: How deep to iterate — must-haves green only, or including nice-to-haves and polish? Time/effort envelope? |

### 2.2 Vorlage: Umsetzungsauftrag / Template: Implementation Charter

**DE:** Ergebnis der Erfragung. Zweisprachig führen; als Arbeitsdokument dem Nutzer zur Bestätigung vorlegen, dann im Kontext der Umsetzung halten (kein `.md`-Lieferobjekt — reines Arbeitsartefakt).
**EN:** Result of the elicitation. Keep it bilingual; present it to the user for confirmation, then keep it in the implementation context (not a `.md` deliverable — a pure working artifact).

```
## Umsetzungsauftrag / Implementation Charter — <Titel / title>

Auftraggeber / Requester: <Name, Berechtigungsstufe / name, permission level>
Datum / Date: <YYYY-MM-DD>   ·   Betroffene Pakete / Affected packages: <shared|core|cli>

### 1. Ziel / Outcome
<1–3 Sätze / sentences>

### 2. Akzeptanzkriterien / Acceptance criteria  (AK-1, AK-2, …; Given/When/Then, messbar / measurable)
- AK-1 [MUSS/MUST]  Given … When … Then … (messbar: <Metrik/Schwelle> / measurable: <metric/threshold>)
- AK-2 [KANN/COULD] Given … When … Then …

### 3. Scope & Nicht-Ziele / Scope & non-goals
In Scope: …
Nicht-Ziele / Non-goals: …

### 4. Prioritäten / Priorities
MUSS/MUST: AK-1, …    KANN/COULD: AK-2, …

### 5. Randbedingungen / Constraints
Kompatibilität / compatibility: …   Performance: …   Sicherheit·Compliance / security·compliance: …
Abhängigkeitsrichtung / dependency direction: shared → core → cli (nicht verletzen / do not violate)

### 6. Definition of Done
<Standard-DoD dev-workflow + Ergänzungen / standard DoD from dev-workflow + additions>

### 7. Iterationstiefe / Iteration depth
<z. B. „alle MUSS grün + Coverage gehalten" / e.g. "all MUST green + coverage held">

Bestätigt durch Nutzer / Confirmed by user: [ ]
```

## 3. Gate-Katalog je Iteration / Gate Catalog per Iteration

**DE:** Am Ende JEDER Iteration werden die Gates gefahren. Jedes Gate hat ein hartes Pass/Fail-Kriterium — kein Ermessen, kein „grün genug". Die Gates sind auf die echten Repo-Kommandos gemappt.
**EN:** At the end of EVERY iteration the gates run. Each gate has a hard pass/fail criterion — no discretion, no "green enough". The gates are mapped to the real repo commands.

| Gate | Kommando / Command | Pass-Kriterium / Pass criterion | Fail-Kriterium / Fail criterion |
|---|---|---|---|
| **Lokaler CI-Spiegel / Local CI mirror** | `pnpm ci:local` (`scripts/ci.sh`) | DE: Alle zehn Schritte grün, Reihenfolge `lint suppressions branding release typecheck build test e2e coverage audit` (Biome, Suppression-Gate, Branding-Gate, Release-Konsistenz, Typecheck, Build, Unit-Tests, E2E-Tests, Coverage, Dependency-Audit). / EN: All ten steps green, order as listed. | DE: Ein Schritt Exit ≠ 0. Hinweis: lokal läuft das Branding-Gate mit `--allow-legacy`, der CI-Job `branding` strikt ohne — lokal grün ≠ automatisch CI-grün. / EN: Any step exits non-zero. Note: locally the branding gate runs with `--allow-legacy`, the CI `branding` job strictly without — green locally ≠ automatically green in CI. |
| **Coverage** | `pnpm test:coverage` | DE: v8-Schwellen gehalten — **lines ≥ 85 / statements ≥ 85 / branches ≥ 80**. / EN: v8 thresholds held — lines ≥ 85 / statements ≥ 85 / branches ≥ 80. | DE: Eine Schwelle unterschritten → vitest Exit ≠ 0. / EN: Any threshold missed → vitest exits non-zero. |
| **Release-Konsistenz / Release consistency** | `pnpm release:check` (`scripts/release-check.sh`) | DE: Lock-Step-Konsistenz VERSION == 4× package.json == `.release.json` == CHANGELOG. NUR bei Release-Iterationen Pflicht. / EN: Lock-step consistency VERSION == 4× package.json == `.release.json` == CHANGELOG. Mandatory ONLY for release iterations. | DE: Irgendeine Quelle divergiert. / EN: Any source diverges. |
| **Code-Review** | Agent `code-quality-reviewer` auf `git diff main...HEAD` | DE: Keine offenen critical/major-Findings (Skill `clean-code`). / EN: No open critical/major findings (skill `clean-code`). | DE: Offene critical/major-Findings. / EN: Open critical/major findings. |
| **Doku-Pflicht / Documentation duty** | Agent `doc-curator` (Skill `documentation-management`) | DE: Doku-Pflicht-Tabelle abgearbeitet, CHANGELOG `[Unreleased]` zweisprachig ergänzt, keine toten Links. / EN: Documentation duty table done, CHANGELOG `[Unreleased]` extended bilingually, no dead links. | DE: Betroffene `docs/`-Seite / CHANGELOG nicht aktualisiert. / EN: Affected `docs/` page / CHANGELOG not updated. |

**DE:** Zusätzlicher Test-Gate-Bezug: Unit-Tests (`shared`/`core`/`cli`) und E2E (`e2e`) laufen bereits innerhalb `pnpm ci:local`. `junit.xml` entsteht nur bei `CI=true`; lokal wird keins geschrieben — das ist kein Fail. Für gezielte Test-Gap-Arbeit siehe Skill `test-management` / Agent `test-engineer`.
**EN:** Additional test-gate note: unit tests (`shared`/`core`/`cli`) and e2e (`e2e`) already run inside `pnpm ci:local`. `junit.xml` is produced only with `CI=true`; nothing is written locally — that is not a failure. For targeted test-gap work see skill `test-management` / agent `test-engineer`.

## 4. Iterations-Schleife (formal) / Iteration Loop (formal)

**DE:**
1. **Kriterien-Checkliste ableiten** — aus dem Umsetzungsauftrag alle Akzeptanzkriterien (AK-n) als Checkliste; jedes anfangs `offen`.
2. **Umsetzen** — nach `dev-workflow` (TDD: rot → grün → refactor) und `clean-code`; nur so viel, wie zum Erfüllen der offenen Muss-Kriterien nötig ist.
3. **Gates fahren** — Gate-Katalog aus Abschnitt 3 ausführen; jedes Gate `rot` oder `grün` mit Kommando-Output belegen.
4. **Sammeln** — nicht erfüllte Kriterien und rote Gates in die Nachbesserungsliste der nächsten Iteration; bei roten Gates aus Bugs: `docs/lessons-learned/` prüfen (Fehler nur einmal).
5. **Abbruch-Bedingung** — Iteration endet NUR, wenn ALLE Muss-Kriterien `erfüllt` UND alle relevanten Gates `grün` sind (Umsetzungserreichung). Kann-Kriterien je nach vereinbarter Iterationstiefe (Charter §7). Sonst: nächste Iteration ab Schritt 2.

Keine künstlichen Timeouts: Iterationen laufen bis zur Umsetzungserreichung; abgebrochen wird nur bei fehlender Freigabe oder echter Blockade (dann Status BLOCKIERT mit Begründung).

**EN:**
1. **Derive the criteria checklist** — from the Charter, all acceptance criteria (AC-n) as a checklist; each initially `open`.
2. **Implement** — per `dev-workflow` (TDD: red → green → refactor) and `clean-code`; only as much as needed to satisfy the open must-have criteria.
3. **Run the gates** — execute the gate catalog from section 3; mark each gate `red` or `green`, evidenced by command output.
4. **Collect** — unmet criteria and red gates go onto the remediation list of the next iteration; for red gates from bugs: check `docs/lessons-learned/` (mistakes only once).
5. **Stop condition** — an iteration ends ONLY when ALL must-have criteria are `met` AND all relevant gates are `green` (implementation achievement). Nice-to-haves per the agreed iteration depth (Charter §7). Otherwise: next iteration from step 2.

No artificial timeouts: iterations run until implementation achievement; abort only on missing approval or a genuine blocker (then status BLOCKED with a rationale).

### 4.1 Fortschritts-Tracking / Progress Tracking

**DE:** Nach jeder Iteration eine Statustabelle führen — Kriterien und Gates auf einen Blick. `offen`/`erfüllt` für Kriterien, `rot`/`grün` für Gates.
**EN:** After each iteration keep a status table — criteria and gates at a glance. `open`/`met` for criteria, `red`/`green` for gates.

```
### Iterationsstatus / Iteration status — Iteration <n>

Kriterien / Criteria
| ID   | Muss/Kann · Must/Could | Status            | Beleg / Evidence            |
|------|------------------------|-------------------|-----------------------------|
| AK-1 | MUSS/MUST              | erfüllt / met     | Test X grün / green         |
| AK-2 | KANN/COULD             | offen / open      | —                           |

Gates
| Gate                     | Status        | Beleg / Evidence               |
|--------------------------|---------------|--------------------------------|
| pnpm ci:local            | grün / green  | 10/10 Schritte / steps         |
| pnpm test:coverage       | grün / green  | 87/86/82 (Gates 85/85/80)      |
| code-quality-reviewer    | rot / red     | 1 major offen / open           |
| doc-curator              | grün / green  | CHANGELOG + docs/… aktualisiert|
| pnpm release:check       | n/a           | keine Release-Iteration / none |

Umsetzungserreichung / Implementation achievement: NEIN/NO  (AK-2 offen, Review rot / AC-2 open, review red)
→ Nächste Iteration / Next iteration: AK-2 umsetzen, Review-Finding beheben / implement AC-2, fix review finding
```

## 5. Akzeptanzkriterien-Vorlage / Acceptance Criteria Template

**DE:** Jedes Kriterium in **Given/When/Then** und **messbar**. „Messbar" heißt: ein Test, ein Kommando-Exit-Code, eine Zahl mit Schwelle oder ein beobachtbares CLI-Verhalten belegt Erfüllung — keine Adjektive („schnell", „robust") ohne Metrik.
**EN:** Each criterion in **Given/When/Then** and **measurable**. "Measurable" means: a test, a command exit code, a number with a threshold, or observable CLI behaviour proves fulfilment — no adjectives ("fast", "robust") without a metric.

**Vorlage / Template:**
```
AK-<n> [MUSS/MUST | KANN/COULD]
  Given  <Ausgangszustand / precondition>
  When   <Aktion / action>
  Then   <erwartetes, messbares Ergebnis / expected, measurable result>
  Messung / Measurement: <Test-Datei · Kommando · Metrik+Schwelle / test file · command · metric+threshold>
```

**Beispiel / Example** (fiktiv / illustrative):
```
AK-1 [MUSS/MUST]
  Given  ein Repo ohne git-Tags und mit Conventional-Commit-Historie
         / a repo without git tags and with conventional-commit history
  When   der Nutzer `ultracode-ai version suggest --json` ausführt
         / the user runs `ultracode-ai version suggest --json`
  Then   das Kommando gibt Exit 0 und ein JSON mit Feld `bump` ∈ {major,minor,patch} aus
         / the command exits 0 and prints JSON with field `bump` ∈ {major,minor,patch}
  Messung / Measurement: tests/e2e.test.ts (neuer Fall / new case) — assert exit 0 + JSON.parse(stdout).bump;
         Coverage von packages/core/src/versioning/ nicht unter 85 % / coverage of versioning/ not below 85%
```

## 6. Wie `dev-orchestrator` diesen Skill nutzt / How `dev-orchestrator` Uses This Skill

**DE:** Integrationshinweise für den Agenten `dev-orchestrator` (dessen Datei wird hier NICHT geändert — die Kopplung ist bewusst in diesem Skill dokumentiert). Der Orchestrator bindet diesen Skill in seine Phasen-Kaskade ein:

- **Phase 1 (Verstehen):** führt die PFLICHT-Anforderungs-Erfragung aus Abschnitt 2 durch, bevor irgendein Implementierungs-Subagent startet. Ergebnis ist der bestätigte Umsetzungsauftrag (Vorlage 2.2). Ohne Charter kein Routing in die Umsetzung.
- **Phase 2 (Planen):** leitet aus den Akzeptanzkriterien die Kriterien-Checkliste (4.1) ab und plant die Iterationstiefe (Charter §7). Unabhängige Kriterien → parallele Subagenten entlang der Paketgrenzen `shared`/`core`/`cli`.
- **Phasen 3–6 (Umsetzen/Verifizieren/Review/Doku):** eine Runde entspricht einer Iteration aus Abschnitt 4. Der Orchestrator delegiert wie gewohnt (`test-engineer`, `code-quality-reviewer`, `doc-curator`, `release-manager`), fährt aber nach jeder Runde den Gate-Katalog (Abschnitt 3) und aktualisiert die Fortschrittstabelle (4.1).
- **Abbruch/Abschluss:** Der Orchestrator meldet ERLEDIGT erst bei Umsetzungserreichung (alle Muss-Kriterien erfüllt, alle relevanten Gates grün). Sonst nächste Iteration oder — bei fehlender Freigabe/echter Blockade — Status BLOCKIERT. Die Fortschrittstabelle fließt in den Konsolidierungs-Report des Orchestrators ein.

**EN:** Integration notes for the `dev-orchestrator` agent (its file is NOT changed here — the coupling is documented in this skill on purpose). The orchestrator wires this skill into its phase cascade:

- **Phase 1 (Understand):** runs the MANDATORY requirements elicitation from section 2 before any implementation subagent starts. The result is the confirmed Implementation Charter (template 2.2). No Charter → no routing into implementation.
- **Phase 2 (Plan):** derives the criteria checklist (4.1) from the acceptance criteria and plans the iteration depth (Charter §7). Independent criteria → parallel subagents along the package seams `shared`/`core`/`cli`.
- **Phases 3–6 (Implement/Verify/Review/Docs):** one round equals one iteration from section 4. The orchestrator delegates as usual (`test-engineer`, `code-quality-reviewer`, `doc-curator`, `release-manager`), but after each round runs the gate catalog (section 3) and updates the progress table (4.1).
- **Abort/Finish:** the orchestrator reports DONE only at implementation achievement (all must-have criteria met, all relevant gates green). Otherwise the next iteration, or — on missing approval / a genuine blocker — status BLOCKED. The progress table feeds into the orchestrator's consolidation report.

## 7. Querverweise / Cross-References

**DE:**
- Skill `dev-workflow` — Phasen-Kaskade, Git-Workflow, Definition of Done (dieser Skill liefert die Iterations- und Erfragungs-Mechanik dazu).
- Skill `clean-code` — Umsetzungs- und Refactoring-Standards je Iteration.
- Skill `test-management` — Teststrategie, TDD, Coverage-Gates 85/85/80, Test-Gap-Analyse.
- Skill `release-management` — SemVer, CHANGELOG, `release:check` (Gate bei Release-Iterationen).
- Skill `documentation-management` — Doku-Pflichten, ADR, Lessons Learned (Doku-Gate).
- Agenten / Agents: `dev-orchestrator` (führt Erfragung + Iteration), `code-quality-reviewer` (Review-Gate), `test-engineer` (Test-/Coverage-Gate), `doc-curator` (Doku-Gate), `release-manager` (Release-Gate).

**EN:**
- Skill `dev-workflow` — phase cascade, git workflow, definition of done (this skill adds the iteration and elicitation mechanics).
- Skill `clean-code` — implementation and refactoring standards per iteration.
- Skill `test-management` — test strategy, TDD, coverage gates 85/85/80, test gap analysis.
- Skill `release-management` — SemVer, CHANGELOG, `release:check` (gate for release iterations).
- Skill `documentation-management` — documentation duties, ADR, lessons learned (docs gate).
- Agents: `dev-orchestrator` (runs elicitation + iteration), `code-quality-reviewer` (review gate), `test-engineer` (test/coverage gate), `doc-curator` (docs gate), `release-manager` (release gate).
