# UltraCode AI

> **Open-Source AI Code Assistant für das Terminal — mit KI-gestützter Versionierung und Release-Planung.**

[![CI](https://github.com/AndreasSchwan-SIMO/ultracode-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/AndreasSchwan-SIMO/ultracode-ai/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-~93%25%20stmts%20%7C%20~86%25%20branches-brightgreen.svg)](#teststatus)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13-339933.svg)](#installation)
[![pnpm](https://img.shields.io/badge/pnpm-11.5.2-f69220.svg)](#installation)

UltraCode AI kombiniert einen agentischen Coding-Assistenten (mehrere LLM-Provider, eine
sandboxed Tool-Schicht, persistente Sessions) mit einem Alleinstellungsmerkmal, das andere
Coding-Tools nicht haben: einem **KI-gestützten Versionierungs- und Release-System**, das
aus Git-Diffs und Commits einen SemVer-Bump vorschlägt, einen Changelog-Entwurf erstellt und
Quality-Gates für ein Release prüft.

> **Reifegrad — ehrlich:** UltraCode AI steht beim ersten produktionsreifen Release `1.3.0`
> (`ultracode-core`, `ultracode-ai` CLI und `ultracode-shared` zu diesem Meilenstein auf
> `1.3.0` angeglichen). CLI-, Core- und Versionierungs-Fundament sind implementiert und getestet
> (1426 Tests, ~93 % Statements / ~86 % Branches Coverage) und laufen in CI auf Linux, macOS und Windows (Node 22/24).
> Desktop-App und IDE-Plugins aus der Architektur-Vision sind **noch nicht** Teil dieses
> Repos. Was hier dokumentiert ist, spiegelt den tatsächlichen Code wider.

---

## Feature-Highlights

### KI-gestützte Versionierung & Release-Planung (USP)

Das Herzstück von UltraCode AI. Vier zusammenarbeitende Engines im Paket `ultracode-core`
(`createVersioningSystem`):

- **`ChangeAnalysisEngine`** — analysiert Datei-Änderungen (numstat / name-status inkl.
  Rename- und Binärbehandlung), parst Conventional Commits (`type(scope)!:`,
  `BREAKING CHANGE:`-Footer), erkennt Breaking Changes über einen Exported-Symbol-Diff
  geänderter TypeScript-Dateien und prüft statische Security-Regeln (hartcodierte Secrets,
  PEM-Keys, `eval`/`new Function`, unsicheres `http://`).
- **`VersionRecommender`** — schlägt nach **SemVer 2.0** den nächsten Bump vor (inkl.
  `0.x`-Konvention und Prerelease-Identifiern), mit Confidence-Score und lesbarer
  Begründung.
- **`ReleasePlanningEngine`** — erzeugt einen Changelog-Entwurf im
  *Keep-a-Changelog*-Stil (Added/Changed/Fixed/Security), leitet Milestones und eine
  heuristische Risikobewertung ab; optionale LLM-Politur fällt bei Provider-Fehlern auf
  den heuristischen Entwurf zurück.
- **`QualityGateSystem`** — injizierbare Gates (Tests/Coverage/Docs/Security/Review) mit
  gewichteter 0–100-Bewertung und CI-tauglichem Exit-Code.

Alles läuft über echtes Git (`GitClient` via `child_process.spawn` mit Argument-Arrays,
keine Shell) und scheitert kontrolliert mit `VersioningError`, wenn Git fehlt oder kein
Repository vorliegt.

### Agentischer Coding-Assistent

- **Multi-Provider:** Mistral, OpenAI, Anthropic und lokal (Ollama) hinter dem
  einheitlichen `ILLMProvider`-Kontrakt — mit Timeout, Retry mit Backoff + Jitter
  (HTTP 408/429/5xx) und robustem Streaming (SSE / NDJSON, Tool-Call-Assembly).
- **Sandboxed Tool-Schicht:** `read`, `write_file`, `edit`, `delete_file`, `grep`, `glob`,
  `bash`, `git_status`/`git_diff`/`git_log`, `project_status`, `dependencies`, `todo`.
  Ein `PathGuard` verhindert Pfad-Traversal und Symlink-Ausbrüche; System-Tools
  bereinigen Credentials aus der Umgebung, bevor ein Kindprozess gestartet wird.
- **Eingebaute Agenten:** `default`, `build`, `plan` (read-only), `review`, `release`,
  `security` — mit Tool-Restriktion (Allow-/Deny-Listen, `git_*`-Wildcards) und
  Subagent-Delegation (`task`, Tiefenlimit 2).
- **Persistente Sessions:** `node:sqlite` (dynamisch importiert) mit automatischem
  Fallback auf einen JSON-Dateispeicher und einen In-Memory-Store.

### Konfiguration & Betrieb

- Hierarchische Konfiguration (`DEFAULT_CONFIG` → User → Projekt → Profil → Env →
  Runtime) als TOML mit bidirektionalem snake_case ↔ camelCase-Mapping und
  Zod-Validierung.
- Offline-First: read-only Kommandos (`tools list`, `agents list`, `config show`,
  `doctor`, `version …`) laufen ohne API-Key.

---

## Architektur (Kurzüberblick)

UltraCode AI ist ein **TypeScript-ESM-Monorepo** (pnpm-Workspaces) aus drei Paketen:

| Paket | Version | Rolle |
|---|---|---|
| [`ultracode-shared`](./packages/shared) | 1.3.0 | Bindender **Kontrakt-Layer**: Typen, Interfaces, Fehlerklassen, `EventBus`, `logger`, Utils. Siehe [`CONTRACTS.md`](./packages/shared/CONTRACTS.md). |
| [`ultracode-core`](./packages/core) | 1.3.0 | **Business-Logik**: Config, Provider, Tools, Memory, Context, Execution-Engine, Agenten und das AI-Versioning-System. Fassade: `UltraCode`. |
| [`ultracode-ai`](./packages/cli) | 1.3.0 | **CLI** (Commander + React/Ink): Kommandos, interaktive UI, Themes. |

Abhängigkeitsrichtung: `cli → core → shared`. `core` und `cli` implementieren gegen die
Interfaces aus `shared`; Implementierungsdetails lecken nie nach oben.

Tiefer einsteigen: [`docs/DEVELOPMENT/architecture.md`](./docs/DEVELOPMENT/architecture.md).

---

## Installation

**Voraussetzungen:** Node.js **>= 22.13**, [pnpm](https://pnpm.io) (Projekt nutzt
`pnpm@11.5.2`). Cross-Platform — **Linux, macOS und Windows** werden unterstützt; es gibt
keine Unix-only-Annahmen (Pfade über `node:path`, Git ohne Shell, `cmd.exe`-Auflösung für
npm/pnpm-Shims unter Windows).

```bash
git clone <repo-url> ultracode
cd ultracode
pnpm install
pnpm build
```

`pnpm build` kompiliert alle drei Pakete via TypeScript-Projektreferenzen
(`tsc -b packages/shared packages/core packages/cli`).

Die CLI lässt sich anschließend direkt über das gebaute Bundle aufrufen:

```bash
node packages/cli/dist/index.js --help
```

Nach `pnpm install` ist im Workspace auch der Bin-Name `ultracode-ai` verfügbar (über
pnpm verknüpft). In den Beispielen unten steht `ultracode-ai` stellvertretend für
`node packages/cli/dist/index.js`.

---

## Quick-Start

### Setup & Umgebungsprüfung

```bash
# Interaktiver Setup-Wizard (Provider + API-Key)
ultracode-ai --setup

# Umgebung offline prüfen: Node-Version, Git, Config-Verzeichnis, API-Keys (maskiert)
ultracode-ai doctor
ultracode-ai doctor --json
```

### Einen Prompt ausführen

```bash
# Einmaliger, nicht-interaktiver Lauf (Text wird gestreamt)
ultracode-ai run -p "Erkläre die Funktion in src/index.ts"

# Mit bestimmtem Agenten und maschinenlesbarer Ausgabe
ultracode-ai run -p "Refactor README" --agent build --json
```

### Interaktiver Modus

Ohne Subkommando startet — in einem echten TTY — die interaktive React/Ink-Oberfläche:

```bash
ultracode-ai
```

In einer nicht-interaktiven Umgebung (kein TTY) gibt UltraCode AI stattdessen einen Hinweis
auf `run -p` aus.

### Tools & Agenten inspizieren

```bash
ultracode-ai tools list
ultracode-ai agents list
ultracode-ai tools list --json
```

### AI-Versionierung & Release

```bash
# Änderungen im Working-Tree / Commit-Range analysieren
ultracode-ai version analyze
ultracode-ai version analyze "v1.2.0..HEAD"

# Nächste Version nach SemVer vorschlagen
ultracode-ai version suggest

# Release-Plan (Changelog-Entwurf, Milestones, Risiko) entwerfen
ultracode-ai release plan
ultracode-ai release plan 1.3.0

# Release-Quality-Gates prüfen (Exit-Code 1, wenn Gates fehlschlagen — CI-tauglich)
ultracode-ai quality
ultracode-ai quality --json
```

Alle Versionierungs-Subkommandos unterstützen `--json`.

### Konfiguration

```bash
ultracode-ai config show                 # aufgelöste Config (Secrets maskiert)
ultracode-ai config get core.activeModel # einzelner Wert per dotted path
ultracode-ai config set ui.theme dracula # Wert setzen, in User-Layer persistieren
ultracode-ai config validate             # Config validieren
ultracode-ai config export config.json   # als JSON exportieren (oder stdout)
ultracode-ai config import config.json   # Overrides importieren
```

### Kostenkontrolle, Skills, Agenten & Lernen

```bash
# Budget: Spend-Status, Plan (Cap / Approval-Threshold) und Ledger-Historie
ultracode-ai budget show                 # aktueller Spend, Cap, Rest (Alias: budget status)
ultracode-ai budget plan --cap 50 --threshold 5
ultracode-ai budget set budget.json      # Plan aus JSON-Datei laden + persistieren
ultracode-ai budget history --limit 20

# Skills authoring: auflisten, anzeigen, aus Wissensmaterial erzeugen/upgraden/testen
ultracode-ai skills list [catalog]
ultracode-ai skills show <name>
ultracode-ai skills create --topic "…" --catalog "…" --summary "…" [--yes]
ultracode-ai skills upgrade --file material.json [--yes]
ultracode-ai skills test --file material.json

# Agenten authoring (zusätzlich zu `agents list`): aus Wissensmaterial erzeugen/evolvieren/testen
ultracode-ai agents create --topic "…" --summary "…" [--yes]
ultracode-ai agents evolve --file material.json [--yes]
ultracode-ai agents test --file material.json

# Lernen aus Dokumentationsquellen (zeigt erst einen Kostenreport)
ultracode-ai learn sources list
ultracode-ai learn sources add <url> [--catalog …] [--schedule on-demand|annual|<cron>] [--scope …] [--locale …]
ultracode-ai learn sources remove <id>
ultracode-ai learn run [sourceId] [--yes]
ultracode-ai learn schedule
```

Diese Kommandos unterstützen ebenfalls `--json`. `create`/`upgrade`/`evolve`/`run` geben ohne
`--yes` nur einen Vorschlag bzw. Kostenreport aus und persistieren nichts.

---

## Konfiguration (Kurzüberblick)

UltraCode AI liest seine Konfiguration aus mehreren Layern, die in dieser Reihenfolge
gemerged werden (späterer Layer gewinnt):

```
DEFAULT_CONFIG → ~/.ultracode/config.toml → <projekt>/.ultracode/config.toml
              → ~/.ultracode/profiles/<name>.toml → Umgebungsvariablen → Runtime
```

Beispiel `~/.ultracode/config.toml`:

```toml
[core]
active_provider = "anthropic"
active_model = "claude-x"
max_tokens = 4096
debug = false

[ui]
theme = "dracula"
```

**Provider-Keys** werden nie in der Config persistiert, sondern zur Laufzeit aus der
Umgebung oder aus `~/.ultracode/.env` gelesen:

| Variable | Provider |
|---|---|
| `MISTRAL_API_KEY` | Mistral |
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI |
| `ULTRACODE_API_KEY` | generischer Fallback |

`local` (Ollama) benötigt keinen Key. `ultracode-ai config show` und `doctor` maskieren
Secrets grundsätzlich.

Vollständige Optionen:
[`docs/GETTING-STARTED/configuration.md`](./docs/GETTING-STARTED/configuration.md) und
[`docs/REFERENCE/configuration-options.md`](./docs/REFERENCE/configuration-options.md).

---

## Entwicklungs-Setup

```bash
pnpm install          # Abhängigkeiten
pnpm build            # alle Pakete via tsc -b kompilieren
pnpm typecheck        # nur Typprüfung
pnpm test             # Unit-Tests (vitest run)
pnpm test:watch       # Watch-Modus
pnpm test:coverage    # Tests mit V8-Coverage
pnpm test:e2e         # nur das e2e-Projekt
pnpm clean            # Build-Artefakte entfernen
```

Build-Standard: strikter TypeScript-ESM-Modus (`NodeNext`, `verbatimModuleSyntax`),
relative Imports mit `.js`-Endung, `import type` für reine Typ-Importe — siehe die
Cross-cutting Conventions in [`CONTRACTS.md`](./packages/shared/CONTRACTS.md).

---

## Teststatus

- **1347 Tests**, **~93 % Statements / ~86 % Branches Coverage** (V8) — deterministisch und offline.
- Unit-Tests pro Paket plus ein dediziertes `e2e`-Projekt (`pnpm test:e2e`).
- **Cross-Platform** verifiziert für Linux, macOS und Windows.
- Die Tests decken Angriffsflächen ab: Pfad-Traversal und Symlinks, Timeouts,
  Permission-Flows, große Eingaben (>= 1 MB), Unicode/Emoji, korrupte Manifeste,
  fehlende Binaries und reale temporäre Git-Repositories für das Versioning.

---

## Versionierungs-Policy

Jedes Modul wird eigenständig nach **SemVer 2.0** versioniert (eigener `CHANGELOG.md`);
das Root-[`CHANGELOG.md`](./CHANGELOG.md) aggregiert Gesamtsystem-Releases. Details:
[`VERSIONING.md`](./VERSIONING.md).

---

## Dokumentation

Die vollständige Dokumentation liegt unter [`docs/`](./docs/README.md):

- [Erste Schritte](./docs/GETTING-STARTED/README.md) — Installation, Quick-Start, Konfiguration
- [Entwicklung](./docs/DEVELOPMENT/README.md) — Architektur, Kernsystem, AI-Versionierung, Tool-/Agenten-Referenz
- [AI-Features](./docs/AI-FEATURES/README.md) — Versionierung, Release-Planung, Quality-Gates
- [Referenz](./docs/REFERENCE/README.md) — CLI-Kommandos, Konfigurationsoptionen
- [Integration](./docs/INTEGRATION/README.md) und [Enterprise](./docs/ENTERPRISE/README.md)

---

## Contributing

Beiträge sind willkommen. Kurzfassung:

1. **Branch** von `main` erstellen.
2. **TDD bevorzugt** — Tests zuerst; alles bleibt deterministisch und offline.
3. Vor dem Commit: `pnpm build`, `pnpm test` und `pnpm typecheck` müssen grün sein.
4. **Conventional Commits** verwenden: `feat|fix|docs|refactor|test: beschreibung`.
5. Bei funktionalen Änderungen den passenden Modul-`CHANGELOG.md` pflegen (siehe
   [`VERSIONING.md`](./VERSIONING.md)).
6. Keine Unix-only-Annahmen — Linux/macOS/Windows müssen weiter funktionieren.

Ausführliche Richtlinien: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Lizenz

[MIT](./LICENSE) © 2026 UltraCode AI Team / SIMO GmbH
