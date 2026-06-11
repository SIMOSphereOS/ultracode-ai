# UltraCode Kernsystem

> **Detaillierte Doku des Pakets `@ultracode/core` – anhand des tatsaechlichen Codes in `packages/core/src`**

---

## Ueberblick

`@ultracode/core` (aktuell **0.2.4**) ist die Business-Logik-Schicht des
TS-ESM-pnpm-Monorepos. Sie implementiert gegen die bindenden Vertraege aus
[`@ultracode/shared`](../../packages/shared/CONTRACTS.md) (0.2.1) und wird von
`ultracode` (CLI, 0.2.1) konsumiert. Alle Komponenten sind plattformneutral
(Linux/macOS/Windows) und werden ueber Dependency Injection verdrahtet — es gibt
keine globalen Singletons.

Die folgenden Subsysteme bilden das Kernsystem:

| Subsystem | Verzeichnis | Einstiegspunkt |
|-----------|-------------|----------------|
| Agent Manager | `agents/` | `createAgentManager`, `AgentManager`, `BaseAgent` |
| Tool System | `tools/` | `createToolSystem`, `ToolRegistry`, `ToolExecutor`, `ToolQueue` |
| Memory / Sessions | `memory/` | `createSessionStore`, `MetadataCache` |
| Context Engine | `context/` | `createContextEngine`, `ContextEngine` |
| Execution Engine | `execution/` | `ExecutionEngine` |
| Providers | `providers/` | `createProvider`, `BaseProvider` |
| Config | `config/` | `loadConfig`, `ConfigManager` |

Jedes Subsystem folgt dem Monorepo-Factory-Vertrag: eine `create*(config,
logger, …)`-Funktion baut das Modul und gibt fertig verdrahtete Instanzen
zurueck.

> **Querschnittsregeln** (siehe [CONTRACTS.md](../../packages/shared/CONTRACTS.md)):
> Tools werfen niemals aus `execute` (Fehler werden als `ToolResult` mit
> `ok: false` gemeldet); Provider werfen immer `ProviderError`; Agenten
> rejecten mit `AgentError`. ESM/NodeNext: relative Importe nutzen
> `.js`-Endungen, `import type` fuer reine Typ-Importe.

---

## 🧠 Agent Manager (`agents/`)

### `AgentManager`

`AgentManager` ist Registry, Factory und Delegations-Koordinator fuer Agenten.
Er haelt `AgentDefinition`s (eingebaute plus per Config registrierte), erzeugt
`BaseAgent`-Instanzen **lazy** beim ersten `get()` und cached sie.

```typescript
export interface AgentManagerOptions {
  config: UltraCodeConfig;
  logger?: Logger;                 // Default: NoopLogger
  tools: IToolRunner;              // ungefilterter Tool-Runner, von allen Agenten geteilt
  provider: ILLMProvider;          // Default-Provider
  resolveProvider?: (name: ProviderId) => ILLMProvider; // Per-Agent-Override
  events?: IEventBus;
  maxTurns?: number;
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  contextCollector?: ContextCollector;
}

export function createAgentManager(options: AgentManagerOptions): AgentManager;
```

Wichtige Methoden:

```typescript
register(definition: AgentDefinition): void;  // ersetzt + invalidiert Cache
list(): AgentDefinition[];                     // mit Config-Overrides
get(name: string): BaseAgent;                  // wirft AgentError bei Unbekanntem
setActive(name: string): void;                 // emittiert "agent.switched"
getActiveName(): string;
getActive(): BaseAgent;
delegate(agentName: string, prompt: string, options?: DelegateOptions): Promise<AgentRunResult>;
```

Beim Konstruieren registriert der Manager alle `BUILT_IN_AGENTS`. Agenten, die
nur in `config.agents.agents` existieren, werden als `type: "custom"`-Definition
nachgezogen. Der aktive Agent ergibt sich aus `agents.default` →
`core.defaultAgent` → `"default"`; ein unbekannter Default wird mit Warnung auf
`"default"` zurueckgesetzt.

Per-Agent-Config wird ueber `mergeConfigEntry` immutabel eingemischt:
`activeModel` → `model`, `activeProvider` → `provider`, plus `systemPromptId`,
`enabledTools`, `disabledTools`. Der System-Prompt wird ueber `systemPromptId`
(Default: der Agent-Name) gegen `SYSTEM_PROMPTS` aufgeloest, mit Fallback auf
den `default`-Prompt.

### Delegation mit Tiefenlimit

`delegate()` ist die Backing-Operation des `task`-Tools (Subagenten). Die Tiefe
ist hart begrenzt:

```typescript
export const MAX_DELEGATION_DEPTH = 2;            // Delegation einer Delegation ist das Limit
export const DEFAULT_MAX_CONCURRENT_DELEGATIONS = 3;
```

- Root-Delegation startet bei `depth = 1`; ein delegierter Agent, der erneut
  delegiert, uebergibt `depth: 2`. Alles darueber rejected mit `AgentError`
  (`"Subagent delegation depth limit (2) exceeded"`).
- Die Nebenlaeufigkeit wird durch eine interne `Semaphore` begrenzt, gespeist
  aus `tools.perTool.task.maxConcurrent` (Default 3). Ueberzaehlige Delegationen
  **warten** auf einen Slot statt zu scheitern.

### `BaseAgent`

`BaseAgent` ist die Standard-`IAgent`-Implementierung. Sie paart eine
`AgentDefinition` mit einer `ExecutionEngine` und wendet die Tool-Restriktionen
der Definition ueber einen `FilteredToolRunner` (`toolPredicateFor`) an.

```typescript
export interface BaseAgentOptions {
  definition: AgentDefinition;
  systemPrompt: string;
  provider: ILLMProvider;
  tools: IToolRunner;          // ungefiltert; der Agent filtert selbst
  model: string;
  logger?: Logger;
  events?: IEventBus;
  maxTurns?: number;           // Engine-Default: 16
  maxTokens?: number;
  temperature?: number;
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  contextCollector?: ContextCollector;
}

// Erweitertes Run-Input (Superset von AgentRunInput):
export interface BaseAgentRunInput extends AgentRunInput {
  history?: ChatMessage[];                       // vorherige Konversation
  onChunk?: (chunk: CompletionChunk) => void;    // Streaming-Callback
}

run(input: BaseAgentRunInput): Promise<AgentRunResult>;
listTools(): ToolDefinition[];
```

Fehlermodell: Unrecoverable-Fehler rejecten mit `AgentError` (Original als
`cause`); Cancellation rejected mit dem abort-abgeleiteten Fehler unveraendert.
Schlaegt die Context-Sammlung fehl (kein Abort), wird gewarnt und ohne Kontext
weitergemacht.

### Eingebaute Agenten

`BUILT_IN_AGENTS` (in `agents/builtins.ts`) definiert sechs Agenten. Die
Tool-Restriktionen werden ueber `enabledTools` (Allow-List, hat Vorrang) bzw.
`disabledTools` (Deny-List) der Definition durchgesetzt:

| Agent | `type` | Tool-Zugriff | Zweck |
|-------|--------|--------------|-------|
| `default` | `default` | voll | Allzweck-Engineering-Agent |
| `build` | `default` | voll | Features implementieren, Bugs fixen, Refactoring |
| `plan` | `specialized` | read-only — `disabledTools: ["write_file","edit","delete_file","bash"]` | Architektur/Planung |
| `review` | `specialized` | keine Datei-Mutation — `disabledTools: ["write_file","edit","delete_file"]` | Code-Review |
| `release` | `specialized` | voll | Release-Management, Versionierung |
| `security` | `specialized` | Allow-List — `enabledTools: ["read","grep","glob","git_*"]` | Security-Audit |

Die System-Prompts sind als TypeScript-Konstanten eingebettet
(`DEFAULT_SYSTEM_PROMPT`, `BUILD_SYSTEM_PROMPT`, `PLAN_SYSTEM_PROMPT`,
`REVIEW_SYSTEM_PROMPT`, `RELEASE_SYSTEM_PROMPT`, `SECURITY_SYSTEM_PROMPT`) und
ueber `SYSTEM_PROMPTS` (`Object.freeze`) per `systemPromptId` adressierbar. Das
Paket funktioniert damit ohne Prompt-Verzeichnis im Dateisystem.

---

## 🛠️ Tool System (`tools/`)

### Aufbau

```typescript
export interface ToolSystem {
  registry: ToolRegistry;
  executor: ToolExecutor;
}

export function createToolSystem(
  config: UltraCodeConfig,
  logger: Logger,
  events?: IEventBus,
): ToolSystem;
```

`createToolSystem` registriert alle Built-in-Tools mit ihrer Per-Tool-Config
(`tools.perTool[name]` → `allowedDirs`, `maxMatches`, `maxFileBytes`,
`protectedExtensions`, …) und liefert dazu einen `ToolExecutor`, der an dieselbe
Config, Logger und (optional) den Event-Bus gebunden ist. Permissions und
Timeouts wendet der Executor **pro Ausfuehrung** an.

### `ToolRegistry`

Katalog benannter Tools (`Map<string, ITool>`):

```typescript
register(tool: AnyTool): void;     // wirft ToolError bei leerem/doppeltem Namen
unregister(name: string): boolean;
get(name: string): AnyTool | undefined;
has(name: string): boolean;
list(): ToolDefinition[];          // nach Namen sortiert
get size(): number;
```

Doppelte Registrierung ist ein harter Fehler (`ToolError`) — die Registry ist
Single Source of Truth, stilles Ueberschreiben wuerde Verdrahtungsfehler
maskieren.

### `ToolExecutor` — Permission-Modell, Timeout, Exception-Containment

Der `ToolExecutor` ist der einzige Pfad, ueber den Tools laufen. Seine
`execute<T>(name, args, ctx): Promise<ToolResult<T>>` **rejected niemals** —
jeder Fehlerfall wird als `ok: false`-Result gemeldet. Ablauf in Reihenfolge:

1. **Lookup** — fehlendes Tool → `ToolNotFoundError` (`TOOL_NOT_FOUND`).
2. **Permission-Aufloesung**:
   - `tools.disabled` (ausser auch in `tools.enabled`) → `ToolPermissionDeniedError`.
   - Effektive Permission = `tools.perTool[name].permission` ?? `tool.definition.permission`.
   - `"never"` → abgelehnt; `"always"` → laeuft direkt; `"ask"` → ruft
     `ctx.confirm(...)`. **Fehlender `confirm`-Callback gilt als Ablehnung.**
3. **Validierung** — `tool.validate(args)` (`ValidationError` → Result).
4. **Timeout** — `tools.perTool[name].timeout` in **Sekunden** (Default
   `DEFAULT_TOOL_TIMEOUT_SECONDS = 30`). Durchgesetzt via `AbortController` +
   Timer; ein Upstream-`ctx.signal` wird verkettet. Ablauf → `ToolTimeoutError`.
5. **Total Exception Safety** — jeder geworfene/abgelehnte Fehler wird via
   `serializeError` zu `ok: false`.
6. **Output-Truncation** auf `MAX_TOOL_OUTPUT_CHARS` (100 000) — Strings direkt,
   plain Objects pro Top-Level-String-Property; setzt `truncated: true`.
7. `durationMs` wird stets vom Executor gemessen.
8. Optional: `tool.executed`-Event auf dem `IEventBus`.

```typescript
type ToolPermission = "ask" | "always" | "never";   // aus @ultracode/shared
export const DEFAULT_TOOL_TIMEOUT_SECONDS = 30;
```

### `ToolQueue` — beschraenkte Nebenlaeufigkeit

FIFO-Queue mit Parallelitaetslimit oberhalb eines `ToolExecutor`:

```typescript
export const DEFAULT_MAX_CONCURRENT = 4;

export interface ToolQueueItem { name: string; args: unknown; ctx: ToolContext; }
export interface ToolQueueOptions { maxConcurrent?: number; }   // Default 4, min 1

enqueue<T>(item: ToolQueueItem): Promise<ToolResult<T>>;        // rejected nie
runAll<T>(items: readonly ToolQueueItem[]): Promise<ToolResult<T>[]>; // gleiche Reihenfolge
get running(): number;
get pending(): number;
```

Start-Reihenfolge ist strikt FIFO. Calls, deren `ctx.signal` bereits aborted
ist, werden als Fehler-Result aufgeloest, ohne ausgefuehrt zu werden.

### `BaseTool`

Abstrakte Basis aller Built-ins auf Basis eines zod-Schemas:

```typescript
export abstract class BaseTool<S extends z.ZodTypeAny, TOut> implements ITool<z.output<S>, TOut> {
  abstract readonly definition: ToolDefinition;
  protected abstract readonly schema: S;
  validate(args: unknown): z.output<S>;                 // wirft genau ValidationError
  execute(args, ctx): Promise<ToolResult<TOut>>;        // rejected nie
  protected abstract run(args, ctx): Promise<ToolRunOutcome<TOut>>;  // darf werfen
  protected throwIfAborted(ctx: ToolContext): void;
}
```

`validate` parst via `schema.safeParse` und wirft bei Fehlschlag genau
`ValidationError` mit aufbereiteter Issue-Liste. `execute` umhuellt `run` so,
dass jeder geworfene Fehler zu `ok: false` (mit `serializeError`) wird und
`durationMs` stets gesetzt ist.

### Built-in-Tools

Alle Built-ins werden von `createToolSystem` registriert. Default-Permission
gemaess Architektur-Tabelle:

| Tool | Kategorie | Permission | Schluessel-Parameter (zod) | Output-Typ |
|------|-----------|------------|----------------------------|------------|
| `read` | `file` | `ask` | `file_path`, `offset?`, `limit?` | `ReadToolOutput` |
| `write_file` | `file` | `ask` | `path`, `content` | `WriteFileToolOutput` |
| `edit` | `file` | `ask` | `file_path`, `old_string`, `new_string`, `replace_all?` | `EditToolOutput` |
| `delete_file` | `file` | `ask` | `path` | `DeleteFileToolOutput` |
| `grep` | `search` | `always` | `pattern`, `path?`, `flags?`, `max_matches?` | `GrepToolOutput` |
| `glob` | `search` | `always` | `pattern`, `path?` | `GlobToolOutput` |
| `bash` | `system` | `ask` | `command`, `cwd?`, `timeout?` | `BashToolOutput` |
| `git_status` | `system` | `ask` | — | `GitStatusOutput` |
| `git_diff` | `system` | `ask` | (siehe `GitTools.ts`) | `GitDiffOutput` |
| `git_log` | `system` | `ask` | (siehe `GitTools.ts`) | `GitLogOutput` |
| `project_status` | `project` | `always` | — | `ProjectStatusOutput` |
| `dependencies` | `project` | `always` | — | `DependenciesOutput` |
| `todo` | `utility` | `always` | `action: "read"\|"write"`, `items?` | `TodoToolOutput` |

Beispiele fuer Signatur-Details aus dem Code:

```typescript
// read — Datei lesen, optional Zeilenfenster via offset/limit (1-basiert)
{ file_path: string; offset?: integer; limit?: integer }

// edit — exakten String ersetzen (muss eindeutig sein, ausser replace_all)
{ file_path: string; old_string: string; new_string: string; replace_all?: boolean }

// glob — Dateien per Glob (**, *, ?, {a,b}) finden
{ pattern: string; path?: string }

// bash — Shell-Kommando (cmd.exe unter Windows, /bin/sh sonst)
{ command: string; cwd?: string; timeout?: number /* Sekunden */ }
// Output: { stdout, stderr, exitCode: number|null, signal: string|null, command }

// grep — Regex-Flags nur i, m, s, u erlaubt
{ pattern: string; path?: string; flags?: string; max_matches?: integer }
// Output: { matches: GrepMatch[]; count: number; limitReached: boolean }
```

`grep` und `glob` sind reine JS-Implementierungen (rekursiver Walk, keine
`ripgrep`/`grep`-Binaries) und damit Windows-kompatibel; sie ueberspringen
`node_modules`, `.git`, `dist`, `coverage` und Binaerdateien.

### Sicherheit: `PathGuard` (Sandbox)

Jedes dateisystemberuehrende Tool loest Pfade ueber `PathGuard` auf. Ein Pfad
wird nur akzeptiert, wenn seine vollstaendig (symlink-aware) aufgeloeste Form
**innerhalb** der `cwd` des Tools oder eines konfigurierten `allowedDirs` liegt.

```typescript
export function resolvePath(cwd: string, p: string, options?: ResolvePathOptions): Promise<string>;
export function isPathInside(parent: string, child: string): boolean;   // rein lexikalisch
export function resolveHome(p: string): string;                          // ~ → os.homedir()

export class PathGuard {
  constructor(options?: { allowedDirs?: readonly string[] });
  resolve(cwd: string, p: string, toolName: string): Promise<string>;
}
```

Abgelehnt werden (jeweils `ToolError`): `../`-Traversal, absolute Pfade
ausserhalb der Sandbox, Symlinks, die aus der Sandbox zeigen, sowie Pfade mit
NUL-Bytes oder leere Strings. Die Containment-Pruefung laeuft auf dem
**symlink-aufgeloesten** Pfad (`fs.realpath`), wobei noch nicht existierende
Schreibziele behandelt werden (der naechste existierende Vorfahre wird aufgeloest
und der Rest wieder angehaengt).

**Cross-Platform-Hinweise:** Vergleiche sind unter win32 case-insensitiv
(NTFS-Default); alle Pfad-Operationen gehen ueber `node:path` (keine
hartkodierten Separatoren); `~` wird ueber `os.homedir()` expandiert.

### Sicherheit: `sanitizeEnv` (Credential-Schutz)

System-Tools, die einen Child-Prozess spawnen und dessen Output zum Modell
zurueckspielen (vor allem `bash`), sind ein Exfiltrationskanal fuer Secrets in
der Umgebung. `sanitizeEnv` entfernt bekannte Credential-Variablen, bevor das
Environment an einen Prozess uebergeben wird.

```typescript
const SECRET_KEY_PATTERN = /(_API_KEY|_TOKEN|_SECRET|PASSWORD|CREDENTIALS?)$/i;

export function isSecretEnvKey(key: string, extraSecretKeys?: ReadonlySet<string>): boolean;
export function sanitizeEnv(
  env: Readonly<Record<string, string | undefined>>,
  extraSecretKeys?: ReadonlySet<string>,
): Record<string, string | undefined>;
```

Das Default-Tool-Environment ist damit `process.env` **minus** Credentials
(Defense in Depth). `createToolSystem` leitet aus `config.providers.apiKeys` die
zusaetzlich zu strippenden Variablen ab — fuer Provider `anthropic` etwa
`ANTHROPIC_API_KEY` und `ULTRACODE_ANTHROPIC_API_KEY`. Benigne System-Variablen
(`PATH`, `HOME`, `LANG`, `SystemRoot`, `TEMP`, …) bleiben erhalten — die Funktion
ist rein, synchron und plattformneutral. Das `CREDENTIALS?`-Suffix deckt sowohl
Singular als auch die GCP-Plural-Form (`GOOGLE_APPLICATION_CREDENTIALS`) ab.

### Sicherheit: `GrepTool`-Worker-Isolation (ReDoS-Backstop)

Eine vom Nutzer gelieferte Regex kann katastrophales Backtracking zeigen. Da
`RegExp.prototype.test()` synchron und nicht unterbrechbar ist, wuerde eine
einzige pathologische Zeile (z. B. `"a".repeat(9999)+"b"` gegen `(a+)+$`) den
Host-Event-Loop minutenlang blockieren. Deshalb laeuft Walk-and-Match in einem
`node:worker_threads`-Worker (`grepWorker.ts`):

```typescript
export const DEFAULT_GREP_TIMEOUT_MS = 30_000;   // spiegelt den Executor-Default (30 s)
export const DEFAULT_MAX_MATCHES = 1000;

export interface GrepToolOptions {
  allowedDirs?: readonly string[];
  maxMatches?: number;     // tools.grep.maxMatches, Default 1000
  timeoutMs?: number;      // tools.grep.timeout (Sekunden) × 1000
}
```

Beim Timeout oder Abort terminiert der Host den Worker hart
(`worker.terminate()`) und liefert `ToolTimeoutError` (`ok: false`) statt zu
haengen. Der Worker-Pfad loest in Produktion auf `grepWorker.js` (in `dist/`)
und unter vitest auf die `.ts`-Quelle auf — via `node:url` + `existsSync`,
niemals per String-`eval`. Regex-Syntaxfehler werden vor dem Worker-Start als
`ToolError` gemeldet.

---

## 💾 Memory / Sessions (`memory/`)

### Fallback-Kette der Session-Stores

```typescript
export function createSessionStore(
  config: UltraCodeConfig,
  logger: Logger,
  internals?: CreateSessionStoreInternals,
): Promise<ISessionStore>;

export const SESSION_DB_FILENAME = "sessions.db";
```

Auswahllogik (die Factory wirft fuer degradierte Umgebungen nie):

1. `sessions.enablePersistence === false` → `InMemorySessionStore`.
2. Sonst: `sessions.saveDir` (mit `~`-Expansion) wird angelegt und ein
   `SqliteSessionStore` unter `<saveDir>/sessions.db` geoeffnet.
3. Ist `node:sqlite` nicht verfuegbar oder die DB nicht zu oeffnen → Warnung +
   `JsonSessionStore` im selben Verzeichnis.
4. Laesst sich nicht einmal das Verzeichnis anlegen → Warnung +
   `InMemorySessionStore`.

`node:sqlite` ist experimentell und auf aelteren Node-Versionen nicht vorhanden;
es wird daher per dynamischem Import in `SqliteSessionStore.open()` geladen —
faellt das fehl, greift die JSON-Variante. Die drei Backends implementieren
denselben `ISessionStore`-Vertrag (`create`, `get`, `appendMessages`, `list`,
`delete`, `prune` — siehe [CONTRACTS.md](../../packages/shared/CONTRACTS.md)).

> Der `JsonSessionStore` nutzt eine cross-instanz On-Disk-Lock (O_EXCL mit
> Backoff und Stale-Lock-Reclaim) um den Append-Read-Modify-Write, um
> Lost-Update-Races zwischen separaten Store-Instanzen/Prozessen zu verhindern.

### `MetadataCache`

Generischer TTL + LRU-Cache fuer Projekt-/Git-/Dependency-Metadaten:

```typescript
export interface MetadataCacheOptions {
  maxEntries: number;   // <= 0 oder NaN deaktiviert den Cache (set = no-op)
  ttlMs: number;        // Infinity = nie abgelaufen; <= 0/NaN = sofort stale
  clock?: () => number; // injizierbar fuer Tests; Default Date.now
}

export class MetadataCache<K, V> {
  get size(): number;
  get(key: K): V | undefined;   // abgelaufene Eintraege = Miss, lazy entfernt
  // ... set/has/delete
}
```

Bei vollem Cache wird der am laengsten ungenutzte Eintrag verdraengt; ein Hit
frischt die Recency auf.

---

## 🎯 Context Engine (`context/`)

Fassade, die `ContextCollector` und `ContextCompressor` zu einem einzigen
`collect()`-Aufruf kombiniert, der einen formatierten, budgetierten
System-Context-String liefert.

```typescript
export interface ContextCollectRequest {
  cwd: string;
  prompt: string;        // treibt das Relevanz-Ranking
  maxTokens?: number;    // Default: config.core.maxTokens
}

export class ContextEngine {
  constructor(config: UltraCodeConfig, logger: Logger, deps?: ContextEngineDeps);
  collect(req: ContextCollectRequest): Promise<string>;   // rejected nie
}

export function createContextEngine(config: UltraCodeConfig, logger: Logger): ContextEngine;
```

`collect()` rejected nie fuer degradierte Umgebungen — fehlschlagende Quellen
werden schlicht ausgelassen; gibt `""` zurueck, wenn nichts verfuegbar ist oder
das Budget nicht-positiv ist.

**`ContextCollector`** sammelt `ContextSection`s aus einem Arbeitsverzeichnis;
jede Section traegt eine stabile `id`. Quellen (fault-tolerant, jede einzeln
ueberspringbar):

| `id` | Quelle |
|------|--------|
| `project` | Projekt-Metadaten aus `package.json` |
| `git` | Git-Branch + porcelain-Status (anmutiges Auslassen ohne Git/Repo) |
| `recent-files` | zuletzt geaenderte Dateien (Default 10) |
| `file-tree` | beschraenkter Datei-Baum (ignoriert `node_modules`, `.git`, `dist`) |
| `system` | OS-/Runtime-Info |

Der Git-Runner spawnt mit Argument-Array (kein Shell — injektionssicher); der
`gitCommand` ist konfigurierbar. Der **`ContextCompressor`** rankt die Sections
gegen den Prompt und rendert ein Markdown-Dokument innerhalb des Token-Budgets.

---

## ⚡ Execution Engine (`execution/`)

Die `ExecutionEngine` treibt die agentische Multi-Turn-Schleife: System-Prompt +
injizierter Kontext + History gehen zusammen mit den verfuegbaren Tool-Definitionen
ans Modell; verlangt das Modell Tool-Calls, werden sie (parallel, mit stabiler
Ergebnisreihenfolge) ueber den `IToolRunner` ausgefuehrt, als `tool`-Messages
ans Transkript angehaengt, und die Schleife laeuft weiter, bis das Modell stoppt
oder das Turn-Budget erschoepft ist.

```typescript
export const DEFAULT_MAX_TURNS = 16;

export interface ExecutionEngineOptions {
  provider: ILLMProvider;
  tools: IToolRunner;
  model: string;
  logger?: Logger;
  events?: IEventBus;
  maxTurns?: number;    // Default 16
  maxTokens?: number;
  temperature?: number;
  cwd?: string;         // Default process.cwd()
  env?: Readonly<Record<string, string | undefined>>; // Default process.env
}

export interface ExecutionRunInput {
  prompt: string;
  systemPrompt?: string;
  context?: string;     // an System-Prompt angehaengt
  history?: ChatMessage[];
  sessionId?: string;   // generiert, wenn ausgelassen
  signal?: AbortSignal;
  onChunk?: (chunk: CompletionChunk) => void;  // setzt: stream() statt complete()
}

export interface ExecutionRunResult {
  text: string;
  toolCallsExecuted: number;
  usage: TokenUsage;        // kumulativ
  turns: number;
  messages: ChatMessage[];  // volles Transkript
  finishReason: FinishReason;
}

run(input: ExecutionRunInput): Promise<ExecutionRunResult>;
```

### Multi-Turn-Loop, `maxTurns`, AbortSignal

- Die Schleife laeuft `for (turn = 1; turn <= maxTurns; turn++)`. Vor jedem Turn,
  vor und nach der Tool-Ausfuehrung wird `throwIfAborted(signal)` geprueft.
- `maxTurns` wird auf `>= 1` validiert und gefloort; ungueltige Werte fallen auf
  `DEFAULT_MAX_TURNS = 16` zurueck.
- Verlangt das Modell Tools (`finishReason === "tool_calls"` und vorhandene
  Calls), werden sie via `executeToolCalls` parallel ausgefuehrt; die
  resultierenden `tool`-Messages bewahren die **Request-Reihenfolge** (per Index).
- Tool-Argumente werden defensiv normalisiert (`normalizeToolArgs`): Objekt
  direkt, JSON-String wird geparst, sonst `{}` (mit Warnung).
- Tool-Result wird fuer die `tool`-Message via `truncate(..., MAX_TOOL_OUTPUT_CHARS)`
  serialisiert.

### Fehlermodell und Events

- Provider-Fehler (`ProviderError`) propagieren zum Caller.
- Eine **fehlgeschlagene Tool-Ausfuehrung beendet den Run nicht** — der Fehler
  wird als `tool`-Message ans Modell zurueckgespielt, damit es sich erholen kann.
- Ueberschreiten von `maxTurns` oder ein `finishReason: "error"`-Turn rejecten
  mit `AgentError`.
- Cancellation via `signal` rejected mit abort-abgeleitetem Fehler (Name
  `"AbortError"`). `isAbortError(err)` erkennt `AbortError` / `code: "ABORT_ERR"`.
- Emittierte Events: `session.started`, `tool.executed` (pro Call), `error`.

Beim Streaming (`onChunk` gesetzt) konsumiert `streamTurn` den Provider-Stream:
`text`-Chunks werden konkateniert, `tool_call`-Chunks per `id` dedupliziert
(letzte Version gewinnt, Reihenfolge bleibt), `done`-Chunk traegt die `usage`.

> **Env-Sicherheit:** Das Default-Tool-Env ist das volle `process.env`;
> system-Tools sanitieren Credentials daraus (siehe `sanitizeEnv`). Embedder mit
> strikter Isolation sollten ein explizites, minimales `env` uebergeben.

---

## 🔌 Providers (`providers/`)

Vier eingebaute `ILLMProvider`-Implementierungen — **Mistral**, **OpenAI**,
**Anthropic** und **local** (Ollama) — plus die resiliente Basisklasse
`BaseProvider`, die Streaming-Parser und die `createProvider`-Factory.

### `createProvider`

```typescript
type ProviderName = "mistral" | "anthropic" | "openai" | "local";

export function createProvider(name: ProviderId, options: CreateProviderOptions): ILLMProvider;
```

`mistral`, `openai` und `anthropic` erfordern einen nicht-leeren `apiKey` —
fehlt er, wirft die Factory `ProviderError` (`reason: "missing_api_key"`).
`local` (Ollama) braucht keinen Key. Ein unbekannter Name wirft ebenfalls
`ProviderError` (`reason: "unknown_provider"`).

### `BaseProvider` — Retry, Timeout, Fehler-Mapping

Zentralisiert die HTTP-Plumbing (ausschliesslich ueber das globale `fetch`):

```typescript
export abstract class BaseProvider implements ILLMProvider {
  abstract readonly name: ProviderId;
  abstract listModels(): Promise<string[]>;
  abstract complete(req: CompletionRequest): Promise<CompletionResult>;
  abstract stream(req: CompletionRequest): AsyncIterable<CompletionChunk>;
  abstract healthCheck(): Promise<boolean>;
  protected fetchWithRetry(url: string, init?: ProviderRequestInit): Promise<Response>;
  // ... readJson, requireBody, ping, abortError, toProviderError
}

export function isRetryableStatus(status: number): boolean;   // 408, 429, >= 500
export function parseRetryAfter(value: string | null, now?: number): number | undefined;
```

- **Per-Attempt-Timeout** via `AbortController`, gesteuert durch
  `ProviderOptions.timeoutMs` (Achtung: **Millisekunden**, anders als die
  TOML-Config in Sekunden).
- **Retry mit exponentiellem Backoff + Jitter** fuer retryable Fehler (HTTP
  408/429/5xx, Netzwerkfehler, Timeouts) bis `maxRetries`; Backoff gedeckelt auf
  `MAX_BACKOFF_MS = 60_000`.
- **`Retry-After`-Header** werden geehrt (Delta-Sekunden oder HTTP-Date).
- **Der Caller-`AbortSignal` gewinnt immer**: einmal aborted kein weiterer Retry,
  und der Abort wird als nicht-retryable `ProviderError` (`details.aborted`)
  sichtbar.
- Jeder Fehler wird auf `ProviderError` mit korrekten `provider`, `statusCode`
  und `retryable` gemappt; `healthCheck` gibt `false` (statt zu werfen) fuer
  erreichbare-aber-ungesunde Backends.

### Wire-Formate: SSE und NDJSON

Die Streaming-Parser in `providers/sse.ts` sind dependency-frei und arbeiten
ueber `ReadableStream<Uint8Array>`:

```typescript
export function streamLines(...);     // Byte-Stream → Textzeilen (\r\n und \n, chunk-/UTF-8-grenzentolerant)
export function parseSSEEvents(...);  // text/event-stream → SSEEvent (multi-line data:, event:, Kommentare)
export function parseSSEJson(...);    // JSON je SSE-data, ehrt [DONE], loggt+ueberspringt kaputtes JSON
export function parseNDJSON(...);     // newline-delimited JSON (Ollama-Wire), kaputte Zeilen geloggt+uebersprungen
```

Anthropic/OpenAI/Mistral nutzen SSE; der lokale Ollama-Provider NDJSON. Alle
Parser akzeptieren einen optionalen `AbortSignal`; Abort wird zwischen und
waehrend Reads beobachtet, der Reader gecancelt und der Abort-Grund geworfen.
OpenAI- und Mistral-Provider teilen sich `OpenAICompatProvider` /
`openaiCompat.ts`.

---

## ⚙️ Config (`config/`)

Hierarchisches Konfigurationssystem mit camelCase-Laufzeit-Modell; der Loader
mappt snake_case ↔ camelCase.

```typescript
export function loadConfig(options?: ConfigManagerOptions): Promise<UltraCodeConfig>;

export class ConfigManager {
  constructor(options?: ConfigManagerOptions);
  load(): Promise<ResolvedUltraCodeConfig>;
  get config(): ResolvedUltraCodeConfig;            // wirft ConfigError vor load()
  get(dottedPath: string): unknown;                 // "core.max_tokens" ODER "core.maxTokens"
  set(dottedPath: string, value: unknown): void;    // re-validiert; commit nur bei Erfolg
  save(scope: "user" | "project"): Promise<string>; // atomar (tmp + rename), Keys nie geschrieben
  exportToml(): string;
  importToml(toml: string): void;
  validate(): { valid: boolean; errors: string[] };
  redacted(): ResolvedUltraCodeConfig;              // Secrets maskiert (***REDACTED***)
}
```

### Hierarchie (Layer)

Reihenfolge (hoechste Prioritaet zuletzt angewendet, via `deepMerge` —
Arrays ersetzen, `undefined` uebersprungen, Prototype-Pollution-Keys verworfen):

1. `DEFAULT_CONFIG` (eingebettete Baseline)
2. User-Config `~/.ultracode/config.toml`
3. Projekt-Config (erstes existierendes von `.ultracode/config.toml`,
   `.vibe/config.toml`, `.ultracode.toml`)
4. Profil `~/.ultracode/profiles/<name>.toml` (nur wenn angefragt — fehlende
   Datei ist dann ein `ConfigError`)
5. Umgebungsvariablen (inkl. `~/.ultracode/.env`)
6. Runtime-Overrides aus `loadConfig`

Fehlende Dateien sind kein Fehler (Defaults greifen); kaputtes TOML, unbekanntes
Profil und Schema-Verletzungen werfen `ConfigError`.

### Env-Mapping (`env.ts`)

Zwei Quellen werden kombiniert: `~/.ultracode/.env` (dependency-freier Parser
`parseDotEnv`; echte Prozess-Variablen gewinnen) und die effektive Umgebung,
gemappt auf den Config-Baum:

- **Provider-API-Keys** → `providers.apiKeys.*` (nur in-memory, nie persistiert):
  `MISTRAL_API_KEY` → `mistral`, `ANTHROPIC_API_KEY` → `anthropic`,
  `OPENAI_API_KEY` → `openai`.
- **Shortcuts** (Prefix `ULTRACODE_`): `ULTRACODE_DEBUG` → `core.debug`,
  `ULTRACODE_THEME` → `ui.theme`, `ULTRACODE_PROVIDER` → `core.activeProvider`,
  `ULTRACODE_MODEL` → `core.activeModel`.
- **Generisch** `ULTRACODE_<SECTION>__<KEY>`: doppelter Unterstrich = Pfad-Trenner,
  einfacher Unterstrich innerhalb eines Segments → camelCase. Werte werden
  anhand des Typs des Defaults am Pfad coerced (Boolean/Number/Array/String).
  Unbekannte Pfade werden mit Warnung ignoriert.

### Config-Sektionen

`UltraCodeConfig` umfasst `core`, `providers`, `tools`, `agents`, `ui`,
`sessions`, `git`, `versioning`, `mcpServers[]`. Auszug der fuer das Kernsystem
relevanten Schluessel (Voll-Referenz:
[configuration.md](../GETTING-STARTED/configuration.md) und
[CONTRACTS.md](../../packages/shared/CONTRACTS.md)):

| Sektion | Relevante Schluessel | Kernsystem-Wirkung |
|---------|----------------------|--------------------|
| `core` | `defaultAgent`, `activeModel`, `activeProvider`, `maxTokens`, `temperature`, `debug` | Default-Agent, Modell/Provider, Token-Budget der Context Engine |
| `providers` | `default`, `timeout` (s), `maxRetries`, `retryDelay` (s), `local{endpoint,…}` | `BaseProvider`-Retry/Timeout |
| `tools` | `disabled[]`, `enabled[]`, `perTool[name]{permission,timeout(s),allowedDirs,maxMatches,maxConcurrent,…}` | Permission/Timeout/Sandbox je Tool, Delegations-Concurrency (`perTool.task.maxConcurrent`) |
| `agents` | `default`, `agents[name]{activeModel,activeProvider,systemPromptId,enabledTools,disabledTools}` | Agent-Overrides |
| `sessions` | `enablePersistence`, `saveDir`, `timeout` (min), `maxSessions` | Session-Store-Auswahl + Fallback-Kette |

> **Zeit-Einheiten beachten:** `providers.timeout`, `tools.*.timeout` und
> `sessions.timeout` sind **Sekunden bzw. Minuten** (gemaess TOML-Label),
> waehrend `ProviderOptions.timeoutMs` in **Millisekunden** rechnet.

---

## CLI-Bezug

Das Kernsystem wird vom Root-Build und den Test-Skripten abgedeckt:

```bash
pnpm build          # tsc -b packages/shared packages/core packages/cli
pnpm typecheck      # tsc -b packages/shared packages/core packages/cli
pnpm test           # vitest run (969 Tests, ~94% Coverage)
pnpm test:coverage  # vitest run --coverage
pnpm test:e2e       # vitest run --project e2e
```

Alle Kommandos laufen plattformneutral (Linux/macOS/Windows).

---

## Naechste Schritte

- [Architektur →](./architecture.md) – Gesamtdesign und Layer
- [AI-Versionierung →](./ai-versioning.md) – ChangeAnalysis, VersionRecommender, ReleasePlanning, QualityGates
- [Tools-Referenz →](./tools-reference.md) – Tools im Detail
- [Agenten-Referenz →](./agents-reference.md) – Agenten im Detail
- [Contract Reference (`@ultracode/shared`)](../../packages/shared/CONTRACTS.md) – die bindenden Interfaces
