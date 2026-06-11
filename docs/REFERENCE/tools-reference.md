# Tool-Referenz

> **Verweis: Die vollständige Built-in-Tool-Referenz liegt unter [../DEVELOPMENT/tools-reference.md](../DEVELOPMENT/tools-reference.md).**

---

Die kanonische, aus dem Code (`packages/core/src/tools/builtin`) abgeleitete Tool-Referenz – Name, Kategorie, Parameter, Permission und Rückgabe jedes Built-in-Tools – wird unter [DEVELOPMENT/tools-reference.md](../DEVELOPMENT/tools-reference.md) gepflegt.

Schnellübersicht der aktuell registrierten Tools (`createToolSystem`):

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

Live abrufbar mit:

```bash
ultracode tools list
ultracode tools list --json
```

Siehe auch [cli-commands.md](./cli-commands.md) und [slash-commands.md](./slash-commands.md) (`/tools`).
