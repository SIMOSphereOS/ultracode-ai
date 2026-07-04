---
name: clean-code
description: "DE: Clean-Code-Standard des UltraCode-Monorepos — SOLID mit TypeScript-Beispielen, Naming-Regeln, Funktions-Regeln, Error Handling, Code-Smells mit Refactorings, DRY/KISS/YAGNI, TypeScript-Patterns und die Dependency Rule packages/shared → packages/core → packages/cli. Bei jeder Implementierung, jedem Refactoring und jedem Review anwenden. Trigger: Clean Code, SOLID, Code Smell, Refactoring, Naming, Benennung, Lesbarkeit, Code-Qualität, technische Schuld, aufräumen, Architektur, Dependency Rule. EN: Clean code standard for the UltraCode monorepo — SOLID with TypeScript examples, naming rules, function rules, error handling, code smells with refactorings, DRY/KISS/YAGNI, TypeScript patterns, and the dependency rule packages/shared → packages/core → packages/cli. Apply on every implementation, refactoring, and review. Trigger: clean code, SOLID, code smell, refactoring, naming, readability, code quality, tech debt, cleanup, architecture, dependency rule."
---

# Clean Code — UltraCode Monorepo

**DE:** Verbindlicher Clean-Code-Standard für dieses Repository. Basiert auf Robert C. Martins *Clean Code*, Martin Fowlers *Refactoring* und den SOLID-Prinzipien — zugeschnitten auf ein reines TypeScript-Monorepo mit den Paketen `packages/shared`, `packages/core` und `packages/cli`.
**EN:** Binding clean code standard for this repository. Based on Robert C. Martin's *Clean Code*, Martin Fowler's *Refactoring*, and the SOLID principles — tailored to a pure TypeScript monorepo with the packages `packages/shared`, `packages/core`, and `packages/cli`.

**DE — Goldene Regel:** Code wird öfter gelesen als geschrieben. Optimiere für Lesbarkeit.
**EN — Golden rule:** Code is read far more often than it is written. Optimize for readability.

---

## SOLID-Prinzipien / SOLID Principles

### S — Single Responsibility Principle (SRP)

**DE:** Eine Klasse/Funktion hat genau EINEN Grund, sich zu ändern.
**EN:** A class/function has exactly ONE reason to change.

```typescript
// SCHLECHT / BAD: SessionService macht alles / does everything
class SessionService {
  createSession(input: SessionInput) { /* ... */ }
  renderPrompt(session: Session) { /* ... */ }
  persistHistory(session: Session) { /* ... */ }
  countTokens(text: string) { /* ... */ }
}

// GUT / GOOD: Eine Verantwortung pro Klasse / one responsibility per class
class SessionRepository { create(input: SessionInput): Session { /* ... */ } }
class PromptRenderer   { render(session: Session): string { /* ... */ } }
class TokenCounter     { count(text: string): number { /* ... */ } }
```

### O — Open/Closed Principle (OCP)

**DE:** Offen für Erweiterung, geschlossen für Modifikation.
**EN:** Open for extension, closed for modification.

```typescript
// SCHLECHT / BAD: Switch, der bei jedem neuen Provider wächst
// Switch that grows with every new provider
function createClient(provider: string): Client {
  switch (provider) {
    case "anthropic": return new AnthropicClient();
    case "openai":    return new OpenAiClient();
    // Jeder neue Provider ändert diese Funktion / every new provider edits this
  }
}

// GUT / GOOD: Neue Provider als neue Implementierung, bestehender Code bleibt
// New providers as new implementations, existing code untouched
interface ModelProvider { complete(req: CompletionRequest): Promise<Completion>; }
class AnthropicProvider implements ModelProvider { /* ... */ }
class OpenAiProvider    implements ModelProvider { /* ... */ }
// Registrierung über eine Registry statt Switch / registration via registry, not switch
```

### L — Liskov Substitution Principle (LSP)

**DE:** Subtypen müssen ihre Basistypen ersetzen können, ohne das Programm zu brechen. Wer ein `ModelProvider`-Interface implementiert, darf keine engeren Vorbedingungen oder überraschenden Seiteneffekte einführen.
**EN:** Subtypes must be substitutable for their base types without breaking the program. An implementation of `ModelProvider` must not add stricter preconditions or surprising side effects.

### I — Interface Segregation Principle (ISP)

**DE:** Keine Klasse soll Interfaces implementieren müssen, die sie nicht braucht. Viele kleine Interfaces schlagen ein großes.
**EN:** No class should be forced to implement interfaces it does not need. Many small interfaces beat one big one.

### D — Dependency Inversion Principle (DIP)

**DE:** High-Level-Module hängen von Abstraktionen ab, nicht von Implementierungen.
**EN:** High-level modules depend on abstractions, not on implementations.

```typescript
// SCHLECHT / BAD: Direkte Abhängigkeit / hard-wired dependency
class Agent {
  private readonly provider = new AnthropicProvider(); // gekoppelt / coupled
}

// GUT / GOOD: Abhängigkeit von Abstraktion / depend on the abstraction
class Agent {
  constructor(private readonly provider: ModelProvider) {} // Interface
}
```

---

## Naming / Benennung

### Regeln / Rules

- **DE:** Intention offenbarend: `elapsedTimeInDays` statt `d`. / **EN:** Intention-revealing: `elapsedTimeInDays`, not `d`.
- **DE:** Aussprechbar: `sessionContext` statt `sessCtx`. / **EN:** Pronounceable: `sessionContext`, not `sessCtx`.
- **DE:** Suchbar — keine Single-Letter-Variablen außer Schleifenzählern. / **EN:** Searchable — no single-letter variables except loop counters.
- **DE:** Keine Kodierung: kein `strName`, `iCount`, `IProvider`. / **EN:** No encodings: no `strName`, `iCount`, `IProvider`.
- **DE:** Klassen/Typen = Substantive (`TokenBudget`, `SessionRepository`). / **EN:** Classes/types = nouns.
- **DE:** Funktionen/Methoden = Verben (`createSession`, `validateConfig`). / **EN:** Functions/methods = verbs.
- **DE:** Booleans in Prädikat-Form (`isActive`, `hasPermission`, `canRetry`). / **EN:** Booleans as predicates.
- **DE:** Konstanten in SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS`). / **EN:** Constants in SCREAMING_SNAKE_CASE.

### Anti-Patterns

- **DE:** `data`, `info`, `temp`, `result`, `item` als alleiniger Name. / **EN:** `data`, `info`, `temp`, `result`, `item` as the whole name.
- **DE:** `process()`, `handle()`, `manage()` ohne Kontext. / **EN:** `process()`, `handle()`, `manage()` without context.
- **DE:** Abkürzungen, die nicht universell bekannt sind. / **EN:** Abbreviations that are not universally known.
- **DE:** Nummerierte Variablen (`session1`, `session2`). / **EN:** Numbered variables.

---

## Functions / Funktionen

1. **DE:** Klein — idealerweise <20 Zeilen, Maximum ~50. / **EN:** Small — ideally <20 lines, ~50 max.
2. **DE:** Eine Sache tun. Braucht die Beschreibung ein "und", ist die Funktion zu groß. / **EN:** Do one thing. If describing it needs an "and", it is too big.
3. **DE:** Ein Abstraktionslevel — keine High-Level-Logik mit Low-Level-Details mischen. / **EN:** One level of abstraction — do not mix high-level logic with low-level details.
4. **DE:** Wenige Parameter: 0–2 ideal, 3 Maximum, sonst Parameter Object. / **EN:** Few parameters: 0–2 ideal, 3 max, otherwise a parameter object.
5. **DE:** Keine Side Effects — die Funktion tut, was ihr Name sagt, nichts anderes. / **EN:** No side effects — the function does what its name says, nothing else.
6. **DE:** Command-Query-Separation: entweder Zustand ändern ODER Information liefern. / **EN:** Command-query separation: either mutate state OR return information.

```typescript
// SCHLECHT / BAD: tut zu viel, mischt Abstraktionslevel
// does too much, mixes abstraction levels
async function runPrompt(input: any) {
  const cfg = JSON.parse(await fs.readFile("config.json", "utf8"));
  const messages = [];
  for (const m of input.history) messages.push({ role: m.r, content: m.c });
  const res = await fetch(cfg.apiUrl, { body: JSON.stringify(messages) });
  process.stdout.write((await res.json()).text);
}

// GUT / GOOD: eine Aufgabe pro Funktion, ein Abstraktionslevel
// one job per function, one abstraction level
async function runPrompt(input: PromptInput): Promise<PromptResult> {
  const session = await sessionRepository.loadOrCreate(input.sessionId);
  const request = promptBuilder.build(session, input);
  const completion = await provider.complete(request);
  return resultMapper.toPromptResult(completion);
}
```

---

## Error Handling

1. **DE:** Exceptions statt Fehlercodes. / **EN:** Exceptions instead of error codes.
2. **DE:** Spezifische Fehlertypen: `SessionNotFoundError` statt `Error`. Paketübergreifende Fehlerklassen gehören nach `packages/shared/src/errors.ts`. / **EN:** Specific error types: `SessionNotFoundError`, not `Error`. Cross-package error classes belong in `packages/shared/src/errors.ts`.
3. **DE:** Kontext im Fehler: Was wurde versucht, was ging schief, mit welchen Daten. / **EN:** Context in the error: what was attempted, what failed, with which data.
4. **DE:** Keine leeren Catch-Blöcke — mindestens loggen (Logger aus `ultracode-shared`). / **EN:** No empty catch blocks — log at minimum (logger from `ultracode-shared`).
5. **DE:** Fail Fast — früh validieren, nicht tief in der Logik. / **EN:** Fail fast — validate early, not deep inside the logic.
6. **DE:** Keine `null`-Returns — Result-Types oder Exceptions. / **EN:** No `null` returns — result types or exceptions.

```typescript
// SCHLECHT / BAD
function findSession(id: string) {
  try {
    return store.sessions.find(id);
  } catch {
    return null; // Caller muss null prüfen — und vergisst es
  }               // caller must check null — and forgets
}

// GUT / GOOD
function findSession(id: string): Session {
  const session = store.sessions.find(id);
  if (!session) throw new SessionNotFoundError(id);
  return session;
}

// GUT / GOOD — Alternative: Result Type (Discriminated Union)
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function findSession(id: string): Result<Session, SessionNotFoundError> {
  const session = store.sessions.find(id);
  return session
    ? { ok: true, value: session }
    : { ok: false, error: new SessionNotFoundError(id) };
}
```

---

## Code Smells → Refactorings

**DE:** Erkennen und beheben — Smell links, Gegenmittel rechts. / **EN:** Detect and fix — smell on the left, remedy on the right.

| Smell | Erkennungszeichen / Symptom | Refactoring |
|-------|-----------------------------|-------------|
| **Long Method** | >30 Zeilen, mehrere Abstraktionslevel / >30 lines, mixed abstraction levels | Extract Method |
| **Large Class** | >300 Zeilen, viele Verantwortungen / >300 lines, many responsibilities | Extract Class (SRP) |
| **Feature Envy** | Methode nutzt vor allem Daten einer anderen Klasse / method mostly uses another class's data | Move Method |
| **Data Clumps** | Gleiche Parameter-Gruppen wiederholen sich / same parameter groups recur | Introduce Parameter Object |
| **Primitive Obsession** | Strings/Numbers, wo Domain-Typen hingehören / strings/numbers where domain types belong | Replace Primitive with Value Object |
| **Switch Statements** | Gleicher Switch an mehreren Stellen / same switch in multiple places | Replace with Polymorphism |
| **Long Parameter List** | >3 Parameter / >3 parameters | Parameter Object, Builder |
| **Shotgun Surgery** | Eine Änderung betrifft viele Dateien / one change touches many files | Move Method, Inline Class |
| **Divergent Change** | Eine Klasse ändert sich aus vielen Gründen / one class changes for many reasons | Extract Class (SRP) |
| **Dead Code** | Unerreichbarer/ungenutzter Code / unreachable or unused code | Löschen — Git hat die Historie / delete — Git keeps history |
| **Comments** | Kommentare erklären, WAS der Code tut / comments explain WHAT the code does | Bessere Namen, Extract Method / better names |
| **Magic Numbers** | Hartcodierte Werte ohne Erklärung / hard-coded values without explanation | Named Constant |
| **God Class** | Eine Klasse weiß und tut alles / one class knows and does everything | Aufteilen nach SRP / split by SRP |
| **Speculative Generality** | Abstraktionen für hypothetische Zukunft / abstractions for a hypothetical future | YAGNI — löschen / delete |

---

## Datei-Größen-Budget / File-size budget

**DE:** Große Dateien sind ein Sammelbecken für Code Smells (siehe **Large Class** und **Long Method** in der Tabelle oben). Zeilenzahl ist die einfachste messbare Bremse dagegen. Für Quelldateien unter `packages/*/src/**/*.ts` gilt dieses Budget:
**EN:** Large files are a collecting basin for code smells (see **Large Class** and **Long Method** in the table above). Line count is the simplest measurable guard against them. For source files under `packages/*/src/**/*.ts` this budget applies:

| Schwelle / Threshold | Zeilen / Lines | Bedeutung / Meaning |
|----------------------|----------------|---------------------|
| Ziel / Target | < 400 | Anzustreben — eine Datei, eine klare Verantwortung / aim here — one file, one clear responsibility |
| Warnung / Warning | ab / from 800 | Nicht-fataler Hinweis, Refactoring einplanen / non-fatal warning, plan a refactoring |
| Harte Grenze / Hard limit | > 1000 | Verstoß — Gate schlägt fehl / violation — the gate fails |

**DE:** Verstöße werden nicht per Ausnahme unterdrückt, sondern behoben: eine Datei mit mehreren Verantwortungen über **Extract Class** aufteilen (SRP), überlange Funktionen über **Extract Method** zerlegen — genau die Gegenmittel aus der Code-Smells-Tabelle oben (**Large Class**, **Long Method**).
**EN:** Violations are not suppressed by exception — they are fixed: split a file with multiple responsibilities via **Extract Class** (SRP) and break overlong functions apart via **Extract Method** — exactly the remedies from the code-smells table above (**Large Class**, **Long Method**).

**Gate:** `pnpm check:filesize` (Script `scripts/check-file-size.sh`, CI-Job **`file_size`** in Stage `test`). Exit 0 = ok, Exit 1 = Verstoß; beide Schwellen sind per Env-Var überschreibbar (`MAX_LINES` Default 1000, `WARN_LINES` Default 800). / `pnpm check:filesize` (script `scripts/check-file-size.sh`, CI job **`file_size`** in stage `test`). Exit 0 = ok, exit 1 = violation; both thresholds are overridable via env vars (`MAX_LINES` default 1000, `WARN_LINES` default 800).

**DE — Aktuelle Kandidaten:** Die größten Quelldateien liegen bereits im Warnbereich und sind vorrangige Refactoring-Kandidaten: `packages/core/src/budget/BudgetPlanner.ts` (~941 Zeilen), `UltraCode.ts` (~846) und `Authoring.ts` (~818). Alle drei sind gegenüber der harten Grenze (1000) noch grün, aber nahe genug, um sie vor dem nächsten Feature aufzuteilen.
**EN — Current candidates:** The largest source files already sit in the warning band and are priority refactoring candidates: `packages/core/src/budget/BudgetPlanner.ts` (~941 lines), `UltraCode.ts` (~846), and `Authoring.ts` (~818). All three still pass against the hard limit (1000) but are close enough to split before the next feature lands.

---

## Architektur: Die Dependency Rule dieses Repos / This Repo's Dependency Rule

**DE:** Statt generischer Clean-Architecture-Ringe gilt hier die konkrete Monorepo-Regel. Abhängigkeiten zeigen ausschließlich in eine Richtung:
**EN:** Instead of generic clean-architecture rings, this repo has a concrete monorepo rule. Dependencies point in one direction only:

```
packages/cli  (ultracode-ai)     — Terminal-UI, Commands, Themes, Formatierung
      │  darf nutzen / may use: core + shared
      ▼
packages/core (ultracode-core)   — Agents, Tools, Memory, Context, Execution,
      │                            Providers, Config, Versioning
      │  darf nutzen / may use: shared
      ▼
packages/shared (ultracode-shared) — Types, Contracts, Errors, Events, Logger,
                                     Constants, Utils
         nutzt nichts / uses nothing (keine Workspace-Dependencies)
```

**Regeln / Rules:**

- **DE:** `shared` importiert NIE aus `core` oder `cli`. `core` importiert NIE aus `cli`. Keine Zyklen. / **EN:** `shared` NEVER imports from `core` or `cli`. `core` NEVER imports from `cli`. No cycles.
- **DE:** `core` enthält keine Terminal-I/O (kein `process.stdout`, keine Prompts, keine ANSI-Farben) — das ist CLI-Territorium. / **EN:** `core` contains no terminal I/O (no `process.stdout`, no prompts, no ANSI colors) — that is CLI territory.
- **DE:** Die Build-Reihenfolge `tsc -b packages/shared packages/core packages/cli` (Scripts `build`/`typecheck`) erzwingt die Richtung über TypeScript Project References — ein Import gegen die Richtung bricht den Build. / **EN:** The build order `tsc -b packages/shared packages/core packages/cli` (scripts `build`/`typecheck`) enforces the direction via TypeScript project references — an import against the direction breaks the build.

**Wohin gehört neuer Code? / Where does new code go?**

| Code | Paket / Package |
|------|-----------------|
| Typen, Contracts, Fehlerklassen, Events, Logger, Utils für mehrere Pakete / types, contracts, error classes, events, logger, utils used by more than one package | `packages/shared` |
| KI-/Geschäftslogik ohne Terminal-Bezug: Agents, Tools, Memory, Context, Providers, Versioning / AI/business logic without terminal concerns | `packages/core` |
| Terminal-Interaktion: Commands, Flags, Rendering, Themes, Ausgabeformatierung / terminal interaction: commands, flags, rendering, themes, output formatting | `packages/cli` |

---

## Weitere Prinzipien / Further Principles

### DRY (Don't Repeat Yourself)
**DE:** Jedes Stück Wissen hat genau eine Repräsentation im System. Aber: Drei ähnliche Zeilen sind besser als eine voreilige Abstraktion (Rule of Three). / **EN:** Every piece of knowledge has exactly one representation in the system. But: three similar lines beat a premature abstraction (rule of three).

### KISS (Keep It Simple, Stupid)
**DE:** Die einfachste Lösung, die funktioniert, ist die beste. Komplexität nur bei bewiesenem Nutzen. / **EN:** The simplest solution that works is the best one. Complexity only with proven benefit.

### YAGNI (You Aren't Gonna Need It)
**DE:** Nichts auf Vorrat implementieren — keine Features und Abstraktionen für hypothetische Zukunft. / **EN:** Do not build ahead of need — no features or abstractions for a hypothetical future.

### Boy Scout Rule
**DE:** Hinterlasse den Code besser, als du ihn vorgefunden hast — kleine Verbesserungen bei jedem Commit. / **EN:** Leave the code better than you found it — small improvements with every commit.

### Law of Demeter
**DE:** Ein Objekt spricht nur mit direkten Nachbarn. Keine Ketten: `session.getContext().getBudget().getRemaining()` → `session.remainingBudget()`. / **EN:** An object talks only to its direct neighbours. No chains: `session.getContext().getBudget().getRemaining()` → `session.remainingBudget()`.

### Tell, Don't Ask
**DE:** Objekte sollen Aufgaben erledigen, statt ihre Daten herauszugeben, damit andere entscheiden. / **EN:** Objects should carry out tasks instead of exposing their data so others can decide.

### Composition over Inheritance
**DE:** Komposition (has-a) vor Vererbung (is-a) — Vererbung erzeugt enge Kopplung und fragile Hierarchien. / **EN:** Prefer composition (has-a) over inheritance (is-a) — inheritance creates tight coupling and fragile hierarchies.

---

## Refactoring-Techniken / Refactoring Techniques

| Technik / Technique | Wann / When | Effekt / Effect |
|---------------------|-------------|-----------------|
| **Extract Method** | Methode zu lang, Block hat eigenen Zweck / method too long, block has its own purpose | Lesbarkeit, Wiederverwendung / readability, reuse |
| **Rename** | Name drückt Absicht nicht aus / name does not express intent | Lesbarkeit / readability |
| **Move Method** | Methode nutzt vor allem fremde Daten / method mostly uses another class's data | Kohäsion / cohesion |
| **Extract Class** | Klasse hat mehrere Verantwortungen / class has multiple responsibilities | SRP |
| **Introduce Parameter Object** | Gleiche Parameter-Gruppe wiederholt sich / same parameter group recurs | Lesbarkeit, DRY / readability, DRY |
| **Replace Conditional with Polymorphism** | Switch/If über Typen / switch/if over types | OCP |
| **Replace Magic Number with Constant** | Hartcodierte Werte / hard-coded values | Wartbarkeit / maintainability |
| **Remove Dead Code** | Ungenutzter Code / unused code | Einfachheit / simplicity |
| **Guard Clauses** | Verschachtelte If-Else-Kaskaden / nested if-else cascades | Lesbarkeit (Early Return) / readability (early return) |

---

## TypeScript-Patterns

```typescript
// Kein any — strikte Typisierung. Unbekanntes als unknown + Narrowing.
// No any — strict typing. Model the unknown as unknown + narrowing.
function parseToolOutput(raw: unknown): ToolOutput { /* narrow, then map */ }

// readonly für Immutability / readonly for immutability
interface ProviderConfig {
  readonly apiUrl: string;
  readonly timeoutMs: number;
  readonly models: readonly string[];
}

// Discriminated Unions statt instanceof/Flags
// Discriminated unions instead of instanceof/flags
type AgentEvent =
  | { kind: "tool-call"; tool: string; input: unknown }
  | { kind: "completion"; text: string }
  | { kind: "error"; error: Error };

function handleEvent(event: AgentEvent): void {
  switch (event.kind) {
    case "tool-call":  return runTool(event.tool, event.input);
    case "completion": return emit(event.text);
    case "error":      return report(event.error);
  }
}

// Optional Chaining + Nullish Coalescing statt verschachtelter Null-Checks
// Optional chaining + nullish coalescing instead of nested null checks
const theme = config?.ui?.theme ?? "default";
```

**DE:** Suppressions sind kein Pattern: `@ts-ignore`/`@ts-nocheck` sind in diesem Repo überall verboten, `@ts-expect-error` nur in `*.test.*`-Dateien erlaubt (siehe Enforcement). Typfehler werden behoben, nicht zum Schweigen gebracht.
**EN:** Suppressions are not a pattern: `@ts-ignore`/`@ts-nocheck` are banned everywhere in this repo, `@ts-expect-error` is allowed only in `*.test.*` files (see enforcement). Type errors get fixed, not silenced.

---

## Enforcement in diesem Repo / Enforcement in This Repo

**DE:** Clean Code ist hier kein Appell, sondern über Gates abgesichert:
**EN:** Clean code here is not an appeal — it is enforced through gates:

| Gate | Befehl / Command | Prüft / Checks | CI-Job |
|------|------------------|----------------|--------|
| Biome Lint + Format | `pnpm lint` (Fix: `pnpm lint:fix`) | Lint-Regeln und Formatierung / lint rules and formatting | `lint` |
| Suppression-Gate | `pnpm check:suppressions` (`scripts/check-suppressions.sh`) | `@ts-ignore`/`@ts-nocheck` überall verboten; `@ts-expect-error` in `packages/*/src` (Produktions-Code) verboten, in `*.test.*` erlaubt / `@ts-ignore`/`@ts-nocheck` banned everywhere; `@ts-expect-error` banned in production source, allowed in tests | `suppressions` |
| Typecheck | `pnpm typecheck` (`tsc -b`) | Typen + Dependency-Richtung shared → core → cli / types + dependency direction | `typecheck` |
| Datei-Größen-Gate / File-size gate | `pnpm check:filesize` (`scripts/check-file-size.sh`) | Quelldateien ≤ 1000 Zeilen, Warnung ab 800 (siehe Datei-Größen-Budget oben) / source files ≤ 1000 lines, warning from 800 (see file-size budget above) | `file_size` |
| Pre-Commit | automatisch via husky + lint-staged | `biome check --write` auf gestagten Dateien / on staged files | — |
| Lokaler CI-Spiegel / local CI mirror | `pnpm ci:local` (`scripts/ci.sh`) | Alle Gates vor dem Push / all gates before pushing | — |
| Agent-Review | Agent `code-quality-reviewer` (`.ultracode/agents/code-quality-reviewer.md`) | Review gegen die Checkliste unten / review against the checklist below | — |

---

## Review-Checkliste / Review Checklist

### Naming
- [ ] **DE:** Alle Namen drücken Absicht aus (kein `data`, `temp`, `result`). / **EN:** All names express intent (no `data`, `temp`, `result`).
- [ ] **DE:** Klassen = Substantive, Funktionen = Verben, Booleans = Prädikate. / **EN:** Classes = nouns, functions = verbs, booleans = predicates.

### Functions
- [ ] **DE:** Jede Funktion tut eine Sache. / **EN:** Each function does one thing.
- [ ] **DE:** Max. 3 Parameter, sonst Parameter Object. / **EN:** Max 3 parameters, otherwise a parameter object.
- [ ] **DE:** Keine Side Effects, max. ~30 Zeilen. / **EN:** No side effects, ~30 lines max.

### SOLID
- [ ] **DE:** Eine Verantwortung pro Klasse (SRP). / **EN:** One responsibility per class (SRP).
- [ ] **DE:** Erweiterbar ohne Modifikation (OCP). / **EN:** Extensible without modification (OCP).
- [ ] **DE:** Abhängigkeiten von Abstraktionen (DIP). / **EN:** Dependencies on abstractions (DIP).

### Error Handling
- [ ] **DE:** Keine leeren Catch-Blöcke, keine `null`-Returns. / **EN:** No empty catch blocks, no `null` returns.
- [ ] **DE:** Spezifische Fehlertypen mit Kontext (Shared-Fehler in `packages/shared/src/errors.ts`). / **EN:** Specific error types with context (shared errors in `packages/shared/src/errors.ts`).
- [ ] **DE:** Fail Fast — frühe Validierung. / **EN:** Fail fast — early validation.

### TypeScript
- [ ] **DE:** Kein `any`, kein `@ts-ignore`/`@ts-nocheck`; `@ts-expect-error` nur in Tests. / **EN:** No `any`, no `@ts-ignore`/`@ts-nocheck`; `@ts-expect-error` only in tests.
- [ ] **DE:** `readonly` und Discriminated Unions wo passend. / **EN:** `readonly` and discriminated unions where appropriate.

### Code Smells
- [ ] **DE:** Kein Dead Code, keine Magic Numbers, keine God Classes. / **EN:** No dead code, no magic numbers, no god classes.

### Architektur / Architecture
- [ ] **DE:** Dependency Rule eingehalten: cli → core → shared, nie umgekehrt. / **EN:** Dependency rule respected: cli → core → shared, never the reverse.
- [ ] **DE:** Kein Terminal-I/O in `core`, keine Workspace-Imports in `shared`. / **EN:** No terminal I/O in `core`, no workspace imports in `shared`.
- [ ] **DE:** `pnpm lint`, `pnpm typecheck` und `pnpm check:suppressions` grün. / **EN:** `pnpm lint`, `pnpm typecheck`, and `pnpm check:suppressions` pass.

---

## Zusammenspiel / Interplay

| Baustein / Building Block | Rolle / Role |
|---------------------------|--------------|
| Agent `code-quality-reviewer` | **DE:** Prüft Diffs gegen diesen Skill und die Checkliste. / **EN:** Reviews diffs against this skill and the checklist. |
| Skill `dev-workflow` | **DE:** Bettet Clean Code in den Branch-/MR-/CI-Ablauf ein. / **EN:** Embeds clean code into the branch/MR/CI flow. |
| Skill `test-management` | **DE:** Testbarkeit ist ein Clean-Code-Ergebnis — kleine Funktionen, DIP. / **EN:** Testability is a clean-code outcome — small functions, DIP. |
| Skill `release-management` | **DE:** Grüne Quality-Gates sind Release-Voraussetzung (`pnpm release:check`). / **EN:** Green quality gates are a release precondition (`pnpm release:check`). |
| Skill `documentation-management` | **DE:** Selbsterklärender Code reduziert Doku-Last; Rest dokumentiert `doc-curator`. / **EN:** Self-explanatory code reduces doc burden; the rest is documented by `doc-curator`. |
| Agent `dev-orchestrator` | **DE:** Bindet diesen Skill bei jeder Implementierung automatisch ein. / **EN:** Automatically applies this skill on every implementation. |
