# UltraCode Tools Referenz

> **Komplette Dokumentation aller 80+ Tools**

---

## 📚 Übersicht

UltraCode bietet **8 Kategorien** mit insgesamt **80+ Tools** für verschiedene Aufgaben.

| **Kategorie** | **Anzahl Tools** | **Zweck** | **Berechtigung** |
|---------------|------------------|-----------|------------------|
| File Operations | 10 | Datei-Operationen | ask |
| Search & Analysis | 12 | Suche & Code-Analyse | always |
| System Operations | 15 | System-Befehle | ask |
| Project Operations | 8 | Projekt-Informationen | always |
| AI Operations | 10 | KI-Funktionen (UltraCode-spezifisch) | always |
| Utility Operations | 10 | Utilities | always |
| MCP Operations | 10 | Model Context Protocol | ask |
| LSP Operations | 8 | Language Server Protocol | always |

---

## 📁 File Operations (10 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `read` | Liest Datei-Inhalt | `file_path` (string, required) | `content` (string), `file_path` (string) | ask |
| `write_file` | Erstellt/Überschreibt Datei | `path` (string, required), `content` (string, required) | `success` (boolean), `path` (string) | ask |
| `edit` | Bearbeitet Datei (String-Ersatz) | `file_path` (string, required), `old_string` (string, required), `new_string` (string, required), `replace_all` (boolean) | `success` (boolean), `file_path` (string), `changes` (number) | ask |
| `delete_file` | Löscht Datei | `path` (string, required) | `success` (boolean), `path` (string) | ask |
| `create_file` | Erstellt neue Datei ( Alias für write_file) | `path`, `content` | wie write_file | ask |
| `append_file` | Fügt Inhalt an Datei an | `path` (string, required), `content` (string, required) | wie write_file | ask |
| `prepend_file` | Fügt Inhalt am Anfang ein | `path`, `content` | wie write_file | ask |
| `move_file` | Verschiebt/benennt Datei um | `from` (string, required), `to` (string, required) | `success` (boolean), `from`, `to` | ask |
| `copy_file` | Kopiert Datei | `from` (string, required), `to` (string, required) | `success` (boolean), `from`, `to` | ask |
| `file_exists` | Prüft, ob Datei existiert | `path` (string, required) | `exists` (boolean), `path` (string) | always |

### Beispiel: Datei lesen und bearbeiten

```
> "Lies die Datei src/index.ts"
> read(file_path="src/index.ts")

> "Ersetze 'oldFunction' mit 'newFunction' in src/index.ts"
> edit(file_path="src/index.ts", old_string="oldFunction", new_string="newFunction")

> "Füge eine neue Funktion hinzu"
> edit(file_path="src/index.ts", old_string="}", new_string="\n// Neue Funktion\nfunction test() {\n  return 'test';\n}")
```

---

## 🔍 Search & Analysis (12 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `grep` | Sucht nach Pattern in Dateien | `pattern` (string, required), `path` (string), `max_matches` (number) | `matches` (array), `count` (number) | always |
| `glob` | Findet Dateien nach Pattern | `pattern` (string, required) | `files` (array) | always |
| `search` | Erweitere Suche (alias für grep) | wie grep | wie grep | always |
| `find` | Findet Dateien nach verschiedenen Kriterien | `name` (string), `type` (string), `path` (string) | `files` (array) | always |
| `todo` | Verwalte Aufgabenliste | `action` (string: 'read'/'write'/'add'/'remove'/'complete'), `todos` (array) | `todos` (array) | always |
| `ask_user_question` | Stelle Frage an Nutzer | `questions` (array, required) | `answers` (object) | always |
| `list_files` | Liste alle Dateien in Verzeichnis | `path` (string), `recursive` (boolean), `pattern` (string) | `files` (array) | always |
| `file_info` | Datei-Informationen | `path` (string, required) | `size`, `type`, `modified`, `created` | always |
| `directory_tree` | Erstellt Verzeichnisbaum | `path` (string), `depth` (number) | `tree` (string) | always |
| `git_grep` | Git-spezifische Suche | `pattern`, `path`, `ref` (string) | wie grep | always |
| `code_analysis` | Analyse von Code-Qualität | `path` (string), `language` (string) | `issues` (array), `score` (number) | always |
| `complexity_analysis` | Analyse von Code-Komplexität | `path` (string) | `complexity` (object) | always |

### Beispiel: Code durchsuchen

```
> "Suche nach 'TODO' im gesamten Projekt"
> grep(pattern="TODO", path=".")

> "Finde alle TypeScript-Dateien"
> glob(pattern="**/*.ts")

> "Erstelle eine Aufgabenliste"
> todo(action="write", todos=[
  {id: "1", content: "Fix bug in API", status: "pending"},
  {id: "2", content: "Add tests", status: "pending"}
])

> "Frage Nutzer nach Präferenz"
> ask_user_question(questions=[{
  question: "Welche Farbe bevorzugst du?",
  header: "Farbe",
  options: [
    {label: "Rot", description: "Rote Farbe"},
    {label: "Blau", description: "Blaue Farbe"},
    {label: "Grün", description: "Grüne Farbe"}
  ]
}])
```

---

## ⚙️ System Operations (15 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `bash` | Führt Shell-Befehl aus | `command` (string, required), `cwd` (string), `timeout` (number) | `stdout` (string), `stderr` (string), `exit_code` (number) | ask |
| `git_status` | Git-Status abrufen | - | `status` (object) | always |
| `git_log` | Git-Log abrufen | `limit` (number), `since` (string), `author` (string) | `commits` (array) | always |
| `git_diff` | Git-Diff anzeigen | `ref1` (string), `ref2` (string), `path` (string) | `diff` (string) | always |
| `git_commit` | Commit erstellen | `message` (string, required), `files` (array), `all` (boolean) | `hash` (string), `message` (string) | ask |
| `git_add` | Dateien zum Staging hinzufügen | `files` (array, required) | `files` (array) | ask |
| `git_push` | Änderungen pushen | `remote` (string), `branch` (string) | `success` (boolean) | ask |
| `git_pull` | Änderungen pullen | `remote` (string), `branch` (string) | `success` (boolean) | ask |
| `git_branch` | Branch erstellen/wechseln | `action` (string: 'create'/'checkout'/'delete'), `name` (string) | `success` (boolean), `branch` (string) | ask |
| `git_tag` | Tag erstellen | `name` (string, required), `message` (string) | `success` (boolean), `tag` (string) | ask |
| `git_merge` | Branches mergen | `branch` (string, required), `message` (string) | `success` (boolean), `hash` (string) | ask |
| `git_rebase` | Rebase durchführen | `branch` (string, required) | `success` (boolean) | ask |
| `git_stash` | Stash verwalten | `action` (string: 'push'/'pop'/'list'/'drop') | `success` (boolean), `stash` (string) | ask |
| `git_remote` | Remote verwalten | `action` (string: 'add'/'remove'/'list'), `name` (string), `url` (string) | `remotes` (array) | ask |
| `process` | Prozess verwalten | `action` (string: 'start'/'stop'/'list'), `command` (string), `pid` (number) | `processes` (array) | ask |

### Beispiel: Git-Operationen

```
> "Zeige Git-Status"
> git_status()

> "Zeige die letzten 5 Commits"
> git_log(limit=5)

> "Führe alle Tests aus"
> bash(command="npm test")

> "Commit alle Änderungen"
> git_add(files=["."])
git_commit(message="Fix bug in API")

> "Push zu remote"
> git_push(remote="origin", branch="main")
```

---

## 📊 Project Operations (8 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `project_status` | Projekt-Status abrufen | - | `files` (number), `lines` (number), `languages` (object) | always |
| `dependencies` | Abhängigkeiten auflisten | `path` (string), `type` (string: 'all'/'outdated'/'vulnerable') | `dependencies` (array), `devDependencies` (array) | always |
| `package_info` | Package.json Informationen | `path` (string) | `name`, `version`, `description`, etc. | always |
| `project_tree` | Projekt-Struktur | `path` (string), `depth` (number) | `tree` (object) | always |
| `language_stats` | Sprach-Statistiken | `path` (string) | `languages` (object), `total_lines` (number) | always |
| `test_coverage` | Test-Abdeckung | `path` (string) | `coverage` (number), `files` (array) | always |
| `project_search` | Projekt-spezifische Suche | `query` (string), `path` (string) | `results` (array) | always |
| `metadata` | Projekt-Metadaten | `path` (string) | `metadata` (object) | always |

### Beispiel: Projekt analysieren

```
> "Zeige Projekt-Status"
> project_status()

> "Zeige Abhängigkeiten"
> dependencies(path=".", type="outdated")

> "Welche Sprachen werden verwendet?"
> language_stats(path=".")
```

---

## 🤖 AI Operations (10 Tools - UltraCode-spezifisch)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `version_analyze` | Analysiert Code-Änderungen | `since` (string), `commit` (string), `branch` (string) | `changes` (object), `breaking_changes` (array), `recommendation` (string) | always |
| `version_suggest` | Schlägt Version vor | `strategy` (string), `prefix` (string) | `version` (string), `type` (string), `reasoning` (string) | always |
| `version_bump` | Erhöht Version | `type` (string: 'major'/'minor'/'patch'), `identifier` (string) | `version` (string), `previous` (string) | always |
| `release_plan` | Erstellt Release-Plan | `version` (string), `target_date` (string), `features` (array) | `plan` (object), `timeline` (array), `milestones` (array) | always |
| `quality_check` | Führt Quality Gates aus | `strict` (boolean), `gates` (array), `config` (object) | `gates` (array), `passed` (boolean), `issues` (array) | always |
| `quality_gate` | Konfiguriert Quality Gates | `action` (string: 'enable'/'disable'/'set'), `gate` (string), `config` (object) | `gate` (string), `status` (string), `config` (object) | always |
| `release_prepare` | Bereitet Release vor | `version` (string, required), `dry_run` (boolean) | `prepared` (boolean), `steps` (array), `warnings` (array) | always |
| `release_publish` | Veröffentlicht Release | `version` (string, required), `channel` (string), `auto` (boolean), `message` (string) | `published` (boolean), `url` (string), `changes` (array) | always |
| `changelog_generate` | Erstellt Changelog | `since` (string), `version` (string), `template` (string) | `changelog` (string), `changes` (array) | always |
| `ai_review` | KI-gestützter Code Review | `path` (string), `focus` (string) | `issues` (array), `score` (number), `suggestions` (array) | always |

### Beispiel: AI-Versionierung

```
> "Analysiere Änderungen seit v1.0.0"
> version_analyze(since="v1.0.0")

> "Schlage Version vor"
> version_suggest()

> "Erhöhe Version (minor)"
> version_bump(type="minor")

> "Führe Quality Gates aus"
> quality_check(strict=true)

> "Veröffentliche Release"
> release_publish(version="1.2.0", channel="stable", auto=true)
```

---

## 🔧 Utility Operations (10 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `config` | Konfiguration verwalten | `action` (string: 'get'/'set'/'show'/'list'), `key` (string), `value` (unknown) | `value` (unknown), `config` (object) | always |
| `help` | Hilfe anzeigen | `topic` (string) | `help` (string) | always |
| `history` | Chat-Verlauf anzeigen | `limit` (number), `filter` (string) | `history` (array) | always |
| `clear` | Chat löschen | - | `cleared` (boolean) | always |
| `exit` | Beenden | - | `exited` (boolean) | always |
| `echo` | Text ausgeben | `text` (string, required) | `text` (string) | always |
| `sleep` | Wartet für Millisekunden | `ms` (number, required) | `slept` (boolean) | always |
| `date` | Aktuelles Datum/Zeit | `format` (string) | `date` (string) | always |
| `env` | Umweltvariablen | `name` (string) | `value` (string) | always |
| `system_info` | System-Informationen | - | `os`, `node_version`, `memory`, etc. | always |

### Beispiel: Utilities

```
> "Zeige Konfiguration"
> config(action="show")

> "Hole Wert"
> config(action="get", key="core.default_agent")

> "Setze Wert"
> config(action="set", key="core.default_agent", value="build")

> "Zeige letzte 5 Nachrichten"
> history(limit=5)

> "Lösche Chat"
> clear()
```

---

## 🔗 MCP Operations (10 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `mcp_list` | Liste verfügbare MCP-Server | - | `servers` (array) | ask |
| `mcp_get` | Abrufen von MCP-Ressource | `server` (string, required), `uri` (string, required) | `content` (unknown) | ask |
| `mcp_call` | MCP-Tool aufrufen | `server` (string, required), `tool` (string, required), `args` (object) | `result` (unknown) | ask |
| `mcp_add` | MCP-Server hinzufügen | `name` (string, required), `url` (string, required), `config` (object) | `success` (boolean), `server` (object) | ask |
| `mcp_remove` | MCP-Server entfernen | `name` (string, required) | `success` (boolean) | ask |
| `mcp_info` | MCP-Server-Informationen | `name` (string, required) | `info` (object) | always |
| `mcp_resources` | MCP-Ressourcen auflisten | `server` (string, required) | `resources` (array) | always |
| `mcp_tools` | MCP-Tools auflisten | `server` (string, required) | `tools` (array) | always |
| `mcp_configure` | MCP-Server konfigurieren | `name` (string, required), `config` (object) | `success` (boolean) | ask |
| `mcp_test` | MCP-Server testen | `name` (string, required) | `success` (boolean), `error` (string) | ask |

### Beispiel: MCP verwenden

```
> "Liste MCP-Server"
> mcp_list()

> "Füge MCP-Server hinzu"
> mcp_add(name="github", url="http://localhost:8080")

> "Ruf MCP-Tool auf"
> mcp_call(server="github", tool="get_issue", args={owner: "ultracode-ai", repo: "ultracode", number: 1})
```

---

## 💻 LSP Operations (8 Tools)

| **Tool** | **Beschreibung** | **Parameter** | **Rückgabe** | **Berechtigung** |
|----------|------------------|--------------|--------------|------------------|
| `lsp_hover` | Hover-Informationen | `uri` (string, required), `position` (object, required) | `contents` (array) | always |
| `lsp_completion` | Code-Vervollständigung | `uri` (string, required), `position` (object, required) | `items` (array) | always |
| `lsp_definition` | Gehe zu Definition | `uri` (string, required), `position` (object, required) | `locations` (array) | always |
| `lsp_references` | Finde Referenzen | `uri` (string, required), `position` (object, required) | `locations` (array) | always |
| `lsp_document_symbols` | Dokument-Symbole | `uri` (string, required) | `symbols` (array) | always |
| `lsp_workspace_symbols` | Workspace-Symbole | `query` (string) | `symbols` (array) | always |
| `lsp_diagnostics` | Diagnostik (Fehler/Warnungen) | `uri` (string) | `diagnostics` (array) | always |
| `lsp_formatting` | Code-Formatierung | `uri` (string, required) | `edits` (array) | always |

### Beispiel: LSP verwenden

```
> "Zeige Definition von 'read'"
> lsp_definition(uri="file:///src/tools/ReadTool.ts", position={line: 10, character: 5})

> "Vervollständige Code"
> lsp_completion(uri="file:///src/index.ts", position={line: 20, character: 10})

> "Formatieren Datei"
> lsp_formatting(uri="file:///src/index.ts")

> "Zeige Diagnostik"
> lsp_diagnostics(uri="file:///src/index.ts")
```

---

## 🎯 Tool-Kategorien im Detail

### File Operations
**Zweck:** Dateimanipulation
**Wichtigste Tools:** `read`, `write_file`, `edit`
**Berechtigung:** Meistens `ask` (aus Sicherheitsgründen)

### Search & Analysis
**Zweck:** Code-Durchsuchung und -Analyse
**Wichtigste Tools:** `grep`, `glob`, `todo`
**Berechtigung:** Meistens `always` (schnell und sicher)

### System Operations
**Zweck:** System- und Git-Befehle
**Wichtigste Tools:** `bash`, `git_status`, `git_commit`
**Berechtigung:** Meistens `ask` (kann gefährlich sein)

### Project Operations
**Zweck:** Projekt-Informationen und -Analyse
**Wichtigste Tools:** `project_status`, `dependencies`
**Berechtigung:** Meistens `always` (nur Lesen)

### AI Operations
**Zweck:** UltraCode-spezifische KI-Funktionen
**Wichtigste Tools:** `version_analyze`, `version_suggest`, `quality_check`
**Berechtigung:** Meistens `always` (Kernfeatures)

### Utility Operations
**Zweck:** Allgemeine Utilities
**Wichtigste Tools:** `config`, `help`, `history`
**Berechtigung:** Immer `always`

### MCP Operations
**Zweck:** Model Context Protocol Integration
**Wichtigste Tools:** `mcp_list`, `mcp_call`
**Berechtigung:** Meistens `ask` (Externe Integration)

### LSP Operations
**Zweck:** Language Server Protocol Integration
**Wichtigste Tools:** `lsp_hover`, `lsp_completion`
**Berechtigung:** Meistens `always` (nur Lesen)

---

## 🔧 Tool-Berechtigungssystem

### Berechtigungstypen

| **Typ** | **Beschreibung** | **Verhalten** |
|---------|------------------|--------------|
| `ask` | Immer fragen | Nutzer muss explizit zustimmen |
| `always` | Immer erlauben | Keine Bestätigung nötig |
| `never` | Nie erlauben | Tool ist blockiert |

### Berechtigungskonfiguration

```toml
[tools]
# Global deaktivierte Tools
disabled = ["bash", "write_file"]

# Global aktivierte Tools (überschreibt disabled)
enabled = ["read", "grep"]

# Tool-spezifische Berechtigung
[tools.write_file]
permission = "ask"

[tools.bash]
permission = "ask"
timeout = 30
allowed_dirs = ["/workspace"]

[tools.read]
permission = "always"

# Kategorien-basierte Berechtigung
[tools.categories.file]
permission = "ask"

[tools.categories.search]
permission = "always"
```

### Berechtigungsabfrage in der Session

```
> "Aktiviere write_file"
> /config enable-tool write_file

> "Deaktiviere bash"
> /config disable-tool bash

> "Zeige Berechtigung für write_file"
> /config get tools.write_file.permission
```

---

## 📊 Performance-Optimierungen

### Caching
- **Tool Results:** Zwischenspeichern von Tool-Ausführungen
- **File Content:** Caching von Datei-Inhalten
- **Git Status:** Caching von Git-Status

### Parallel Execution
- **Unabhängige Tools** werden parallel ausgeführt
- **Subagents** können parallel arbeiten
- **Batch Processing** für Massenoperationen

### Streaming
- **LLM Responses** werden gestreamt
- **Tool Output** wird in Echtzeit angezeigt
- **Progress Bars** für lange Operationen

---

## 🛠️ Eigene Tools erstellen

### Schritt 1: Tool-Klasse erstellen

```typescript
// packages/core/src/tools/implementations/custom/MyCustomTool.ts

import { BaseTool } from '../../BaseTool';
import type { ToolSchema } from '../../ToolTypes';

export class MyCustomTool extends BaseTool {
  constructor() {
    super(
      'my_custom_tool',
      'Führt meine benutzerdefinierte Aktion aus',
      'utility',
      {
        type: 'object',
        properties: {
          param1: {
            type: 'string',
            description: 'Erster Parameter',
          },
          param2: {
            type: 'number',
            description: 'Zweiter Parameter',
            default: 42,
          },
        },
        required: ['param1'],
      } as ToolSchema
    );
  }
  
  protected async run(args: { param1: string; param2?: number }): Promise<string> {
    // Implementiere deine Logik
    return `MyCustomTool ausgeführt mit param1=${args.param1}, param2=${args.param2 || 42}`;
  }
}
```

### Schritt 2: Tool registrieren

```typescript
// In deiner Initialisierung
import { toolRegistry } from '../ToolRegistry';
import { MyCustomTool } from './implementations/custom/MyCustomTool';

const myTool = new MyCustomTool();
toolRegistry.register(myTool);
```

### Schritt 3: Tool in Session verwenden

```
> my_custom_tool(param1="test", param2=100)
# → MyCustomTool ausgeführt mit param1=test, param2=100
```

---

## 📖 Nächste Schritte

- [Agenten-Referenz →](./agents-reference.md) – Alle Agenten im Detail
- [Architektur →](./architecture.md) – Systemdesign
- [Konfiguration →](../GETTING-STARTED/configuration.md) – Tools konfigurieren
- [AI-Versionierung →](./ai-versioning.md) – AI-Tools verstehen
