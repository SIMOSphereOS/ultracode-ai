# Tool-Referenz

> **Alle Built-in-Tools – aus dem tatsächlichen Code (`packages/core/src/tools/builtin`).**

---

## Überblick

Das Tool-System wird von `createToolSystem` (`packages/core/src/tools/createToolSystem.ts`) zusammengesetzt: eine `ToolRegistry` mit allen Built-in-Tools plus ein `ToolExecutor`. Jedes Tool erbt von `BaseTool` (`packages/core/src/tools/BaseTool.ts`), validiert seine Argumente mit einem zod-Schema und liefert ein `ToolResult` – `execute` wirft nie, sondern wandelt Fehler in `ok: false` um.

Aktuell registriert `createToolSystem` **13 Built-in-Tools**. Die Fassade `UltraCode` ergänzt zur Laufzeit das `task`-Subagent-Tool (`packages/core/src/UltraCode.ts`), sodass Agenten insgesamt **14 Tools** sehen. (Frühere Dokumente sprachen von „80+ Tools" als Zielbild; die folgende Tabelle bildet den realen Stand des Codes ab.)

### Tool-Definition

Jedes Tool exponiert eine `ToolDefinition` (`packages/shared/src/types/tool.ts`):

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;   // "file" | "search" | "system" | "project" | "ai" | "utility" | "mcp"
  parameters: { /* JSON-Schema-artige Parameterbeschreibung */ };
  permission: ToolPermission; // "ask" | "always" | "never"
}
```

### Permission-Semantik

Aufgelöst im `ToolExecutor` (`packages/core/src/tools/ToolExecutor.ts`); `tools.perTool[name].permission` überschreibt die Default-Permission des Tools:

| Permission | Verhalten |
|------------|-----------|
| `always` | Wird ohne Rückfrage ausgeführt. |
| `ask` | Erfordert Bestätigung über `ctx.confirm`. Fehlt der Bestätigungskanal oder lehnt der Nutzer ab → `ToolPermissionDeniedError`. |
| `never` | Wird abgelehnt (`ToolPermissionDeniedError`). |

Zusätzlich: Tools in `tools.disabled` (und nicht in `tools.enabled`) werden vor der Permission-Prüfung abgelehnt. Agenten können Tools über `enabledTools`/`disabledTools` weiter einschränken (siehe [agents-reference.md](./agents-reference.md)).

---

## Tools nach Kategorie

### Kategorie `file`

#### `read`

- **Permission**: `ask`
- **Beschreibung**: Read a text file, optionally a line window via offset/limit
- **Quelle**: `builtin/ReadTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `file_path` | string | ja | Path of the file to read |
| `offset` | integer | nein | 1-based first line to return |
| `limit` | integer | nein | Maximum number of lines to return |

Konfigurierbar via `tools.perTool.read`: `allowedDirs`, `maxFileBytes`.

#### `write_file`

- **Permission**: `ask`
- **Beschreibung**: Create or overwrite a file with the given content
- **Quelle**: `builtin/WriteFileTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `path` | string | ja | Target file path |
| `content` | string | ja | Full file content |

Konfigurierbar via `tools.perTool.write_file`: `allowedDirs`, `protectedExtensions`.

#### `edit`

- **Permission**: `ask`
- **Beschreibung**: Replace an exact string in a file (must be unique unless replace_all)
- **Quelle**: `builtin/EditTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `file_path` | string | ja | Path of the file to edit |
| `old_string` | string | ja | Exact text to replace |
| `new_string` | string | ja | Replacement text |
| `replace_all` | boolean | nein | Replace all occurrences |

Konfigurierbar via `tools.perTool.edit`: `allowedDirs`.

#### `delete_file`

- **Permission**: `ask`
- **Beschreibung**: Delete a single file
- **Quelle**: `builtin/DeleteFileTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `path` | string | ja | Path of the file to delete |

Konfigurierbar via `tools.perTool.delete_file`: `allowedDirs`.

---

### Kategorie `search`

#### `grep`

- **Permission**: `always`
- **Beschreibung**: Search files for a regular expression (pure JS, recursive)
- **Quelle**: `builtin/GrepTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `pattern` | string | ja | Regular expression to search for |
| `path` | string | nein | Directory or file to search (default: cwd) |
| `flags` | string | nein | Regex flags (i, m, s, u) |
| `max_matches` | integer | nein | Cap on returned matches |

Das Matching läuft in einem Worker, den der Host bei Timeout hart terminiert (ReDoS-Backstop). Konfigurierbar via `tools.perTool.grep`: `allowedDirs`, `maxMatches`, `timeout`.

#### `glob`

- **Permission**: `always`
- **Beschreibung**: Find files matching a glob pattern (\*\*, \*, ?, {a,b})
- **Quelle**: `builtin/GlobTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `pattern` | string | ja | Glob pattern, e.g. src/\*\*/\*.ts |
| `path` | string | nein | Directory to search (default: cwd) |

Konfigurierbar via `tools.perTool.glob`: `allowedDirs`, `maxMatches`.

---

### Kategorie `system`

#### `bash`

- **Permission**: `ask`
- **Beschreibung**: Run a shell command (cmd.exe on Windows, /bin/sh elsewhere)
- **Quelle**: `builtin/BashTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `command` | string | ja | Shell command line |
| `cwd` | string | nein | Working directory (default: cwd) |
| `timeout` | number | nein | Timeout in seconds |

Cross-Platform: nutzt `cmd.exe` unter Windows, sonst `/bin/sh`. Aus den konfigurierten Provider-Keys abgeleitete Secret-Umgebungsvariablen werden aus dem Kindprozess entfernt (`sanitizeEnv`). Konfigurierbar via `tools.perTool.bash`: `allowedDirs`.

#### `git_status`

- **Permission**: `ask`
- **Beschreibung**: Show the git working-tree status
- **Quelle**: `builtin/GitTools.ts`
- **Parameter**: keine

#### `git_diff`

- **Permission**: `ask`
- **Beschreibung**: Show a git diff (optionally between two refs or for a path)
- **Quelle**: `builtin/GitTools.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `ref1` | string | nein | First ref |
| `ref2` | string | nein | Second ref |
| `path` | string | nein | Limit the diff to this path |

#### `git_log`

- **Permission**: `ask`
- **Beschreibung**: List recent git commits
- **Quelle**: `builtin/GitTools.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `limit` | integer | nein | Maximum number of commits (default 10) |

---

### Kategorie `project`

#### `project_status`

- **Permission**: `always`
- **Beschreibung**: Summarise the project's manifests (package.json, pyproject.toml, Cargo.toml)
- **Quelle**: `builtin/ProjectTools.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `path` | string | nein | Project directory (default: cwd) |

Konfigurierbar via `tools.perTool.project_status`: `allowedDirs`.

#### `dependencies`

- **Permission**: `always`
- **Beschreibung**: List the project's declared dependencies
- **Quelle**: `builtin/ProjectTools.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `path` | string | nein | Project directory (default: cwd) |

Konfigurierbar via `tools.perTool.dependencies`: `allowedDirs`.

---

### Kategorie `utility`

#### `todo`

- **Permission**: `always`
- **Beschreibung**: Read or replace the in-memory todo list
- **Quelle**: `builtin/TodoTool.ts`

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `action` | string (`read` \| `write`) | ja | read or write |
| `todos` | array | nein | New list contents (write only) |

Jedes `todos`-Element hat `content` (Pflicht), optional `id` und `status` (`pending` \| `in_progress` \| `completed`, Default `pending`).

---

## Zusammenfassung

| Name | Kategorie | Permission |
|------|-----------|------------|
| `read` | file | ask |
| `write_file` | file | ask |
| `edit` | file | ask |
| `delete_file` | file | ask |
| `grep` | search | always |
| `glob` | search | always |
| `bash` | system | ask |
| `git_status` | system | ask |
| `git_diff` | system | ask |
| `git_log` | system | ask |
| `project_status` | project | always |
| `dependencies` | project | always |
| `todo` | utility | always |

Die aktuell registrierten Tools lassen sich jederzeit live anzeigen:

```bash
ultracode-ai tools list
ultracode-ai tools list --json
```

---

## Sicherheit

- **Pfad-Beschränkung**: Datei- und Projekt-Tools lösen Pfade über `PathGuard` auf; per `tools.perTool.<name>.allowedDirs` lässt sich der Zugriff auf erlaubte Verzeichnisse begrenzen.
- **Geschützte Dateien**: `write_file` respektiert `protectedExtensions`.
- **Env-Sanitisierung**: `bash` entfernt API-Key-Variablen aus dem Kindprozess (`sanitizeEnv`).
- **Timeouts**: Der `ToolExecutor` erzwingt pro Tool ein Timeout (`tools.perTool.<name>.timeout`, sonst Default).

---

## Weiterführend

- [agents-reference.md](./agents-reference.md) – Tool-Beschränkungen pro Agent
- [../REFERENCE/configuration-options.md](../REFERENCE/configuration-options.md) – `tools.*`-Konfigurationsschlüssel
- [../REFERENCE/cli-commands.md](../REFERENCE/cli-commands.md) – `ultracode-ai tools list`
