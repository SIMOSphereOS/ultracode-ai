# CLI-Kommandos

> **Referenz aller `ultracode`-Kommandos und Flags – aus dem tatsächlichen CLI-Code (`packages/cli/src`).**

---

## Überblick

Das CLI heißt `ultracode` (Binary aus `packages/cli`, Version `0.2.1`). Es ist mit [Commander.js](https://github.com/tj/commander.js) aufgebaut (`createProgram` in `packages/cli/src/program.ts`) und läuft als TS-ESM-Programm auf Node.js `>= 20`. Die Cross-Platform-Unterstützung (Linux/macOS/Windows) ergibt sich aus dem reinen Node-Stack ohne native Abhängigkeiten.

```text
ultracode [globale Optionen] [kommando] [argumente] [optionen]
```

Ohne Subkommando und mit interaktivem Terminal startet die interaktive Ink-UI (siehe [slash-commands.md](./slash-commands.md)). Ohne TTY (z. B. in Pipes oder CI) gibt das CLI einen Hinweis aus und beendet mit Exit-Code `1`.

### Exit-Codes

| Code | Bedeutung |
|------|-----------|
| `0`  | Erfolg (auch bei `--help`/`--version`) |
| `1`  | `UltraCodeError` (rote Meldung `✗ <code>: <message>`), unbekanntes Kommando, fehlendes TTY, fehlgeschlagene Quality-Gates oder kritische `doctor`-Fehler |

Fehlerausgaben gehen nach `stderr`. `runCli` setzt ausschließlich `process.exitCode`, ruft niemals selbst `process.exit`.

---

## Globale Optionen

Definiert auf dem Root-Programm (`program.ts`):

| Option | Beschreibung |
|--------|--------------|
| `-V, --version` | Gibt die CLI-Version aus (aufgelöst über `getCliVersion()`). |
| `--debug` | Druckt Stack-Traces für unerwartete Fehler. |
| `--setup` | Startet den interaktiven Setup-Assistenten (siehe unten). |
| `-h, --help` | Standard-Hilfe von Commander. |

---

## `ultracode --setup`

Interaktiver Erstkonfigurations-Assistent (`runSetup` in `packages/cli/src/commands/setup.ts`).

Abgefragt werden:

1. **Provider** – einer von `mistral`, `anthropic`, `openai`, `local` (Konstante `SETUP_PROVIDERS`); Default `mistral`.
2. **API-Key** – nur bei Nicht-`local`-Providern; maskierte Eingabe (jedes Zeichen als `*`). Leereingabe überspringt.
3. **Default-Agent** – Default `default`.
4. **Theme** – `dark`, `light` oder `dracula`; Default `dark`.

Persistenz:

- Provider/Agent/Theme werden über den `ConfigManager` in die **User-Schicht** geschrieben (`set` + `save("user")`): `core.activeProvider`, `providers.default`, `core.defaultAgent`, `agents.default`, `ui.theme`.
- Der API-Key wird in `~/.ultracode/.env` als `<PROVIDER>_API_KEY=…` abgelegt (Datei mit Modus `0600`, wo unterstützt). Keys gehören **nie** in `config.toml`.

```bash
ultracode --setup
```

---

## `ultracode run`

Einmaliger, nicht-interaktiver Lauf (`registerRunCommand` in `packages/cli/src/commands/run.ts`).

```bash
ultracode run -p "<prompt>" [--agent <name>] [--json]
```

| Flag | Pflicht | Beschreibung |
|------|---------|--------------|
| `-p, --print <prompt>` | ja | Der auszuführende Prompt. |
| `-a, --agent <name>` | nein | Agent für diesen Lauf (sonst Default-Agent). |
| `--json` | nein | Gibt das vollständige `AgentRunResult` als eine JSON-Zeile aus, statt Text zu streamen. |

Verhalten:

- **Ohne `--json`**: Text-Chunks werden während des Laufs nach `stdout` gestreamt. Provider ohne Streaming liefern den finalen Text am Ende. Abschließend wird ein Newline angehängt.
- **Mit `--json`**: Es wird nicht gestreamt; nur das serialisierte Endergebnis (eine Zeile JSON) wird ausgegeben – maschinenlesbar für Skripte.

```bash
# Streaming-Antwort
ultracode run -p "Erkläre die Architektur in packages/core"

# Read-only-Planungsagent, JSON-Ausgabe
ultracode run -p "Plane das Refactoring von ToolExecutor" --agent plan --json
```

---

## `ultracode config`

Konfiguration inspizieren und ändern (`registerConfigCommand` in `packages/cli/src/commands/config.ts`). Schlüssel und Defaults siehe [configuration-options.md](./configuration-options.md).

| Subkommando | Beschreibung |
|-------------|--------------|
| `config show [--json]` | Druckt die aufgelöste Konfiguration (Secrets maskiert). Ohne `--json` als `key = value`-Zeilen, mit `--json` als JSON-Objekt. |
| `config get <path> [--json]` | Druckt einen Einzelwert per Dotted-Path (z. B. `core.activeModel`). Mit `--json`: `{ "path": …, "value": … }`. Unbekannter Pfad → `ConfigError`. |
| `config set <path> <value>` | Setzt einen Wert und persistiert ihn in die User-Schicht (`save("user")`). JSON-Literale werden geparst, sonst String. |
| `config validate` | Validiert die aufgelöste Konfiguration; gibt `✓ configuration is valid` aus. |
| `config export [file]` | Exportiert die aufgelöste Konfiguration als JSON nach `stdout` oder in `file`. |
| `config import <file>` | Importiert Overrides aus einer JSON-Datei in die User-Schicht. |

> `set` und `import` benötigen den vom Facade exponierten `ConfigManager`. Fehlt er, schlagen sie mit einem klaren `ConfigError` fehl und verweisen auf manuelle Bearbeitung von `~/.ultracode/config.toml`.

```bash
ultracode config show --json
ultracode config get ui.theme
ultracode config set core.temperature 0.3
ultracode config export ./ultracode-config.json
ultracode config import ./ultracode-config.json
```

---

## `ultracode tools`

Tool-Registry inspizieren (`registerListCommands` in `packages/cli/src/commands/list.ts`).

```bash
ultracode tools list [--json]
```

Tabelle mit den Spalten **Name**, **Category**, **Permission**, **Description**. Mit `--json` wird das rohe `ToolDefinition[]` ausgegeben. Vollständige Liste siehe [tools-reference.md](./tools-reference.md).

---

## `ultracode agents`

Agenten-Registry inspizieren (`registerListCommands`).

```bash
ultracode agents list [--json]
```

Tabelle mit den Spalten **Name**, **Type**, **Model**, **Description**. Fehlt eine Modellangabe, zeigt die Tabelle `(active model)`. Mit `--json` wird das rohe `AgentDefinition[]` ausgegeben. Details siehe [../DEVELOPMENT/agents-reference.md](../DEVELOPMENT/agents-reference.md).

---

## `ultracode version`

AI-Versionierung: Änderungsanalyse und Versionsvorschläge (`registerVersioningCommands` in `packages/cli/src/commands/versioning.ts`). Setzt ein Git-Repository voraus.

| Subkommando | Beschreibung |
|-------------|--------------|
| `version analyze [range] [--json]` | Analysiert Änderungen im Working-Tree bzw. im angegebenen Git-Range (z. B. `v1.2.0..HEAD`). |
| `version suggest [range] [--json]` | Schlägt die nächste Version auf Basis der analysierten Änderungen vor (Semantic Versioning). |

```bash
ultracode version analyze
ultracode version suggest "v0.2.0..HEAD" --json
```

---

## `ultracode release`

Release-Planung (`registerVersioningCommands`).

| Subkommando | Beschreibung |
|-------------|--------------|
| `release plan [version] [--json]` | Erstellt einen Release-Plan für die angegebene Zielversion; wird sie weggelassen, wird automatisch eine Version vorgeschlagen. |

```bash
ultracode release plan
ultracode release plan 0.3.0 --json
```

---

## `ultracode quality`

Führt die Release-Quality-Gates aus (`registerVersioningCommands`).

```bash
ultracode quality [--json]
```

Beendet mit **Exit-Code 1**, wenn die Gates fehlschlagen (`report.passed === false`) – CI-freundlich. Mit `--json` wird der vollständige Report ausgegeben.

```bash
# Im CI-Pipeline-Schritt
ultracode quality --json || exit 1
```

---

## `ultracode doctor`

Vollständig **offline** durchgeführte Umgebungsprüfung (`registerDoctorCommand` in `packages/cli/src/commands/doctor.ts`). Gibt eine `✓`/`✗`-Checkliste aus; bei kritischen Fehlern Exit-Code `1`.

```bash
ultracode doctor [--json]
```

Geprüfte Checks (`collectDoctorReport`):

| Check | Kritisch | Inhalt |
|-------|----------|--------|
| `node` | ja | Node.js `>= 20` (Konstante `MIN_NODE_MAJOR`). |
| `git` | nein | `git --version` verfügbar (sonst Versionierungs-Features deaktiviert). |
| `config-dir` | ja | Schreibzugriff auf das Config-Verzeichnis (`~/.ultracode`). |
| `config` | ja | Konfiguration lädt und validiert. |
| `api-keys` | nein | Vorhandensein eines API-Keys (Werte maskiert) aus `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ULTRACODE_API_KEY` (Konstante `API_KEY_VARS`). |
| `terminal` | nein | Interaktives TTY vorhanden; meldet `NO_COLOR` / `TERM=dumb`. |

API-Key-Werte werden niemals im Klartext gedruckt – nur maskiert. `report.ok` ist genau dann `false`, wenn ein **kritischer** Check fehlschlägt.

```bash
ultracode doctor
ultracode doctor --json
```

---

## Hinweise zu `--json`

Folgende Kommandos unterstützen maschinenlesbare JSON-Ausgabe: `run --json`, `config show/get --json`, `tools list --json`, `agents list --json`, `version analyze/suggest --json`, `release plan --json`, `quality --json`, `doctor --json`. Die JSON-Ausgabe geht jeweils nach `stdout` (eine Zeile bzw. ein Objekt) und eignet sich für die Weiterverarbeitung in Skripten.

---

## Weiterführend

- [slash-commands.md](./slash-commands.md) – Interaktiver Modus und Tastenkürzel
- [configuration-options.md](./configuration-options.md) – Alle Config-Schlüssel
- [tools-reference.md](./tools-reference.md) – Built-in-Tools
- [../DEVELOPMENT/agents-reference.md](../DEVELOPMENT/agents-reference.md) – Agenten
