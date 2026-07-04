# OpenCode → UltraCode AI Migration

> **Komplette Anleitung für die Migration von OpenCode zu UltraCode AI**

---

## 🎯 Übersicht

Diese Anleitung hilft dir, **nahtlos von OpenCode zu UltraCode AI zu migrieren**. UltraCode AI kombiniert alle Vorteile von OpenCode mit zusätzliche Features aus Mistral Vibe und weiteren AI-Coding-Assistenten.

---

## 📊 Vergleich: OpenCode vs UltraCode AI

| **Feature** | **OpenCode** | **UltraCode AI** | **Hinweise** |
|-------------|--------------|---------------|--------------|
| **Agenten** | build, plan, general | build, plan, review, release, security, +custom | ✅ Alle OpenCode-Agenten verfügbar + weitere |
| **Tools** | ~30 | **80+** | ✅ Alle OpenCode-Tools verfügbar + weitere |
| **UI** | React + Terminal | React + Ink | ⚠️ Ähnliche, aber verbesserte UI |
| **Desktop App** | Beta | ✅ Voll unterstützt | ✅ Verbessert |
| **IDE Integration** | ✅ | ✅++ (VS Code, JetBrains, Neovim) | ✅ Erweitert |
| **MCP Support** | ❌ | ✅ | ✅ Neu in UltraCode AI |
| **LSP Support** | ❌ | ✅ | ✅ Neu in UltraCode AI |
| **AI-Versionierung** | ❌ | ✅ **UNIQUE** | ✅ UltraCode AI USP |
| **Multi-Model** | ✅ | ✅ (Mistral, Anthropic, OpenAI, lokal) | ✅ Erweitert |
| **Konfiguration** | JSON/YAML | TOML | ⚠️ Format ändert sich |
| **Skills System** | ❌ | ✅ | ✅ Neu in UltraCode AI |

---

## 📁 Dateistruktur-Vergleich

```
OpenCode:                       UltraCode AI:
┌─────────────────┐            ┌─────────────────┐
│ ~/.opencode/    │            │ ~/.ultracode/   │
│ ├── config.json │            │ ├── config.toml  │
│ ├── agents/     │            │ ├── .env         │
│ │   └── *.json  │            │ ├── agents/      │
│ ├── skills/     │            │ │   └── *.toml   │
│ └── logs/       │            │ ├── skills/      │
└─────────────────┘            │ ├── prompts/      │
                                 │ └── logs/        │
                                 └─────────────────┘
```

---

## 🔄 Migration Schritt-für-Schritt

### Phase 1: Vorbereitung

#### 1. Backup erstellen

```bash
# OpenCode-Konfiguration sichern
cp -r ~/.opencode ~/.opencode-backup-$(date +%Y%m%d)

# API-Keys sichern
cp ~/.opencode/.env ~/.opencode-backup.env 2>/dev/null || true
```

#### 2. UltraCode AI installieren

```bash
npm install -g ultracode-ai
```

#### 3. UltraCode AI-Verzeichnis erstellen

```bash
mkdir -p ~/.ultracode
```

---

### Phase 2: Konfiguration migrieren

#### 1. Automatische Migration

```bash
# Trockenlauf (simuliert Migration)
ultracode-ai --migrate-from opencode --dry-run

# Echte Migration
ultracode-ai --migrate-from opencode --backup
```

**Was wird migriert:**
- Agenten-Konfiguration
- Tool-Berechtigungen
- API-Keys
- Theme-Einstellungen
- Keybindings

---

#### 2. Manuelle Migration

Falls du die automatische Migration nicht verwenden möchtest:

**a) API-Keys kopieren**

```bash
# OpenCode verwendet .env in ~/.opencode/
if [ -f ~/.opencode/.env ]; then
  cp ~/.opencode/.env ~/.ultracode/.env
fi

# Oder manuell hinzufügen
echo "MISTRAL_API_KEY=sk-..." >> ~/.ultracode/.env
echo "ANTHROPIC_API_KEY=sk-..." >> ~/.ultracode/.env
```

**b) Konfiguration konvertieren**

| **OpenCode** | **UltraCode AI** | **Beispiel** |
|--------------|---------------|--------------|
| `defaultAgent` | `default_agent` | `default_agent = "build"` |
| `model` | `active_model` | `active_model = "mistral-large"` |
| `provider` | `active_provider` | `active_provider = "mistral"` |
| `disabledTools` | `disabled` in `[tools]` | `[tools] disabled = ["bash"]` |
| `theme` | `theme` in `[ui]` | `[ui] theme = "dark"` |

**Beispiel-Konvertierung:**

**OpenCode (`~/.opencode/config.json`):**
```json
{
  "defaultAgent": "build",
  "model": "mistral-large",
  "provider": "mistral",
  "disabledTools": ["bash"],
  "theme": "dark"
}
```

**UltraCode AI (`~/.ultracode/config.toml`):**
```toml
[core]
default_agent = "build"
active_model = "mistral-large"
active_provider = "mistral"

[tools]
disabled = ["bash"]

[ui]
theme = "dark"
```

---

### Phase 3: Agenten migrieren

#### Agenten-Mapping

| **OpenCode-Agent** | **UltraCode AI-Agent** | **Hinweise** |
|--------------------|---------------------|--------------|
| `build` | `build` | ✅ Identisch |
| `plan` | `plan` | ✅ Identisch |
| `general` | `general` (Subagent) | ✅ Identisch |
| `default` | `default` | ✅ Identisch |

**Alle OpenCode-Agenten sind in UltraCode AI verfügbar!**

---

### Phase 4: Tools migrieren

#### Tools-Mapping

| **OpenCode-Tool** | **UltraCode AI-Tool** | **Hinweise** |
|-------------------|--------------------|--------------|
| `read` | `read` | ✅ Identisch |
| `write` | `write_file` | ⚠️ Umbenannt |
| `edit` | `edit` | ✅ Identisch |
| `bash` | `bash` | ✅ Identisch |
| `grep` | `grep` | ✅ Identisch |
| `todo` | `todo` | ✅ Identisch |
| `git` | `git_*` | ✅ Erweitert (git_status, git_commit, etc.) |

**Wichtige Änderungen:**
- `write` → `write_file`
- Git-Tools sind jetzt separat (git_status, git_commit, etc.)

**Alle OpenCode-Tools sind in UltraCode AI verfügbar!**

---

### Phase 5: Plug-ins/Skills migrieren

OpenCode unterstützt **kein Plug-in-System**, aber du kannst:

1. **Eigene Tools erstellen** in UltraCode AI
2. **Skills als UltraCode AI-Skills** erstellen

**Beispiel: OpenCode-Tool als UltraCode AI-Tool**

Falls du benutzerdefinierte Tools in OpenCode hattest:

```typescript
// UltraCode AI Tool (Packages/core/src/tools/implementations/custom/MyTool.ts)
import { BaseTool } from '../../BaseTool';

export class MyTool extends BaseTool {
  constructor() {
    super(
      'my_tool',
      'Mein benutzerdefiniertes Tool',
      'utility',
      {
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'Parameter 1' },
        },
        required: ['param1'],
      }
    );
  }
  
  protected async run(args: { param1: string }): Promise<string> {
    // Meine Logik
    return `Tool ausgeführt mit: ${args.param1}`;
  }
}
```

---

### Phase 6: Testen

#### 1. Grundlegende Funktionalität testen

```bash
# UltraCode AI starten
ultracode-ai

# Grundlegende Befehle testen
> read(file_path="package.json")
> grep(pattern="version", path=".")
> /agents build
> /agents plan
```

#### 2. Agenten testen

```
> /agents build
> "Erstelle eine neue Funktion"

> /agents plan
> "Analysiere diese Codebase"
```

#### 3. Tools testen

```
> read(file_path="src/index.ts")
> write_file(path="test.txt", content="Hello UltraCode AI")
> grep(pattern="TODO", path=".")
```

---

### Phase 7: Anpassen und optimieren

#### 1. Neue UltraCode AI-Features ausprobieren

```
# AI-Versionierung
> version_analyze(since="v1.0.0")
> version_suggest()

# Quality Gates
> quality_check(strict=true)

# Release-Planung
> release_plan(version="1.2.0")
```

#### 2. MCP-Server hinzufügen

```toml
# ~/.ultracode/config.toml
[[mcp_servers]]
name = "github"
transport = "http"
url = "http://localhost:8080"
```

#### 3. IDE-Integration einrichten

- **VS Code:** `code --install-extension ultracode.vscode`
- **JetBrains:** UltraCode AI Plugin installieren
- **Neovim:** UltraCode AI Neovim Plugin installieren

---

## 🔧 Kompatibilitätsmodus

Falls du Probleme mit der Migration hast, kannst du den **OpenCode-Kompatibilitätsmodus** aktivieren:

```bash
ultracode-ai --compat opencode
```

**Features:**
- OpenCode-Tool-Namen werden unterstützt (z.B. `write` statt `write_file`)
- OpenCode-Konfiguration wird automatisch konvertiert
- OpenCode-Keybindings werden emuliert

---

## ⚠️ Bekannte Unterschiede

| **Unterschied** | **OpenCode** | **UltraCode AI** | **Lösung** |
|----------------|--------------|---------------|------------|
| Tool-Name `write` | ✅ | ❌ (nur `write_file`) | `write_file` verwenden oder Kompatibilitätsmodus |
| Git-Tools | `git` (ein Tool) | `git_*` (mehrere Tools) | `git_status`, `git_commit`, etc. verwenden |
| Konfiguration | JSON | TOML | Konvertierungsskript verwenden |
| Desktop App | Beta | Voll unterstützt | UltraCode AI Desktop installieren |
| MCP Support | ❌ | ✅ | MCP-Server manuell hinzufügen |
| LSP Support | ❌ | ✅ | LSP-Tools verwenden |

---

## 📝 Migrations-Checkliste

- [ ] **Backup** von OpenCode-Konfiguration erstellt
- [ ] **UltraCode AI** installiert
- [ ] **API-Keys** migriert
- [ ] **Konfiguration** migriert (automatisch/manuell)
- [ ] **Agenten** getestet
- [ ] **Tools** getestet
- [ ] **Neue Features** ausprobiert (AI-Versionierung, MCP, LSP)
- [ ] **IDE-Integration** eingerichtet (optional)
- [ ] **Desktop App** installiert (optional)
- [ ] **Alte Konfiguration** archiviert

---

## 💡 Tipps für OpenCode-Nutzer

### 1. Gewohnte Workflows

| **OpenCode-Workflow** | **UltraCode AI-Workflow** |
|------------------------|------------------------|
| `opencode` | `ultracode-ai` |
| `opencode --agent plan` | `ultracode-ai --agent plan` |
| `opencode --model mistral-large` | `ultracode-ai --model mistral-large` |
| `/agents` | `/agents` |
| `/tools` | `/tools` |

### 2. Neue Features entdecken

- **AI-Versionierung:** `version_analyze()`, `version_suggest()`, `release_plan()`
- **Quality Gates:** `quality_check()`
- **MCP-Integration:** `mcp_list()`, `mcp_call()`
- **LSP-Integration:** `lsp_hover()`, `lsp_completion()`
- **80+ Tools:** Viele neue Tools verfügbar

### 3. Performance-Verbesserungen

- UltraCode AI ist **schneller** (optimierte Architektur)
- **Parallel Execution** für Tools
- **Besseres Caching**
- **Streaming** von LLM-Antworten

---

## 🚀 Nächste Schritte

1. **Migration abschließen** mit der Checkliste
2. **Neue Features ausprobieren:**
   - [AI-Versionierung →](../AI-FEATURES/versioning-system.md)
   - [MCP-Integration →](../DEVELOPMENT/architecture.md#mcp-server-integration)
   - [LSP-Integration →](../DEVELOPMENT/architecture.md#lsp-integration)
3. **Feedback geben:**
   - [GitLab Issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues) (Label: `migration`)
   - [Discord #migration](https://discord.gg/ultracode)

---

## 🔗 Nützliche Links

- [UltraCode AI Dokumentation →](../../README.md)
- [Konfiguration →](../../GETTING-STARTED/configuration.md)
- [Agenten-Referenz →](../DEVELOPMENT/agents-reference.md)
- [Tools-Referenz →](../DEVELOPMENT/tools-reference.md)
