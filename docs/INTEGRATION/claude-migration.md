# Claude Code → UltraCode Migration

> **Komplette Anleitung für die Migration von Claude Code zu UltraCode**

---

## 🎯 Übersicht

Diese Anleitung hilft dir, **von Claude Code (leaked) zu UltraCode zu migrieren**. UltraCode kombiniert die besten Features von Claude Code mit OpenCode und Mistral Vibe, bietet aber **Multi-Model-Unterstützung** (nicht nur Anthropic).

---

## 📊 Vergleich: Claude Code vs UltraCode

| **Feature** | **Claude Code** | **UltraCode** | **Hinweise** |
|-------------|-----------------|---------------|--------------|
| **Sprache** | TypeScript | TypeScript (+ Python) | ✅ Multi-Language in UltraCode |
| **Runtime** | Bun | Node.js (+ Bun) | ⚠️ Bun ist optional in UltraCode |
| **UI** | React + Ink | React + Ink | ✅ Identisch |
| **Agenten** | ✅ | ✅++ (10+ Agenten) | ✅ Alle Claude-Agenten + weitere |
| **Tools** | ~40 | **80+** | ✅ Alle Claude-Tools + viele mehr |
| **Commands** | ~50 | 50+ | ✅ Alle Slash-Commands + weitere |
| **MCP Support** | ✅ | ✅ | ✅ Voll unterstützt |
| **LSP Support** | ✅ | ✅ | ✅ Voll unterstützt |
| **Bridge System** | ✅ (VS Code/JB) | ✅++ | ✅ Verbessert |
| **AI-Versionierung** | ❌ | ✅ **UNIQUE** | ✅ UltraCode USP |
| **Multi-Model** | ❌ (nur Anthropic) | ✅ (Mistral, Anthropic, OpenAI, lokal) | ✅ **Hauptvorteil!** |
| **Konfiguration** | JSON/TOML | TOML | ⚠️ Format-Portierung |
| **Skills System** | ✅ | ✅++ (erweitert) | ✅ Kompatibel |
| **Voice Mode** | ✅ | ✅ | ✅ Unterstützt |

---

## 📁 Dateistruktur-Vergleich

```
Claude Code (leaked):        UltraCode:
┌─────────────────┐          ┌─────────────────┐
│ src/             │          │ packages/       │
│ ├── main.tsx     │          │ ├── core/       │
│ ├── commands/    │  ✅      │ │   └── ...     │
│ │   └── *.ts     │ ───────▶ │ ├── cli/        │
│ ├── tools/       │          │ │   └── ...     │
│ │   └── *.ts     │          │ ├── desktop/    │
│ ├── bridge/      │          │ │   └── ...     │
│ │   └── *.ts     │          │ └── ide/        │
│ └── ...          │          │     └── ...     │
└─────────────────┘          └─────────────────┘

Konfiguration:
Claude: ~/.claude/           UltraCode: ~/.ultracode/
```

---

## 🔄 Migration Schritt-für-Schritt

### Phase 1: Vorbereitung

#### 1. Backup erstellen

```bash
# Falls du lokale Claude-Dateien hast
if [ -d ~/.claude ]; then
  cp -r ~/.claude ~/.claude-backup-$(date +%Y%m%d)
fi

# API-Keys sichern
if [ -f ~/.claude/.env ]; then
  cp ~/.claude/.env ~/.claude-backup.env
fi
```

#### 2. UltraCode installieren

```bash
npm install -g ultracode
```

#### 3. API-Keys für UltraCode einrichten

**Wichtig:** Claude Code verwendet **nur Anthropic API-Keys**. UltraCode unterstützt **mehrere Anbieter**.

```bash
# Anthropic API-Key (für Kompatibilität)
echo "ANTHROPIC_API_KEY=sk-..." >> ~/.ultracode/.env

# UltraCode unterstützt auch andere Anbieter
echo "MISTRAL_API_KEY=sk-..." >> ~/.ultracode/.env
echo "OPENAI_API_KEY=sk-..." >> ~/.ultracode/.env
```

---

### Phase 2: Tools migrieren

#### 1. Tool-Mapping

**Alle Claude Code-Tools sind in UltraCode verfügbar!**

| **Claude Tool** | **UltraCode Tool** | **Hinweise** |
|-----------------|--------------------|--------------|
| `BashTool` | `bash` | ✅ Identisch |
| `FileReadTool` | `read` | ✅ Identisch |
| `FileWriteTool` | `write_file` | ✅ Identisch |
| `FileEditTool` | `edit` | ✅ Identisch |
| `GlobTool` | `glob` | ✅ Identisch |
| `GrepTool` | `grep` | ✅ Identisch |
| `WebFetchTool` | `web_fetch` | ✅ Identisch |
| `WebSearchTool` | `web_search` | ✅ Identisch |
| `AgentTool` | `task` | ✅ Verbessert (Subagents) |
| `SkillTool` | `skill` | ✅ Identisch |
| `MCPTool` | `mcp_*` | ✅ Erweitert |
| `LSPTool` | `lsp_*` | ✅ Identisch |
| `SendMessageTool` | `send_message` | ✅ Neu in UltraCode |
| `GitTools` | `git_*` | ✅ Erweitert |

**UltraCode hat alle Claude-Tools + viele weitere!**

---

#### 2. Commands migrieren

| **Claude Command** | **UltraCode Command** | **Hinweise** |
|--------------------|------------------------|--------------|
| `/commit` | `/commit` | ✅ Identisch |
| `/review` | `/review` + Agent | ✅ Verbessert |
| `/compact` | `/compact` | ✅ Identisch |
| `/mcp` | `/mcp` | ✅ Identisch |
| `/config` | `/config` | ✅ Erweitert |
| `/doctor` | `/doctor` | ✅ Identisch |
| `/login` / `/logout` | `/auth` | ⚠️ Umbenannt |
| `/memory` | `/memory` | ✅ Identisch |
| `/skills` | `/skills` | ✅ Identisch |
| `/tasks` | `/tasks` | ✅ Identisch |
| `/vim` | `/vim` | ✅ Identisch |
| `/diff` | `/diff` | ✅ Identisch |

**✅ Fast alle Claude-Commands sind in UltraCode verfügbar!**

---

### Phase 3: Agenten migrieren

#### 1. Agenten-Mapping

| **Claude Agent** | **UltraCode Agent** | **Hinweise** |
|------------------|---------------------|--------------|
| Default | default | ✅ Ähnlich |
| Plan Mode | plan | ✅ Ähnlich |
| Custom Agents | custom | ✅ Ähnlich |

**UltraCode hat zusätzliche Agenten:**
- `build` - Entwicklung
- `review` - Code Review
- `release` - Release-Management
- `security` - Sicherheitsprüfung

---

### Phase 4: Konfiguration portieren

Claude Code verwendet **TypeScript-Konfiguration**, UltraCode verwendet **TOML**.

#### 1. Wichtige Konfigurationen

**Claude Code (TypeScript/JSON):**
```json
{
  "model": "claude-3-5-sonnet",
  "provider": "anthropic",
  "timeout": 120,
  "maxTokens": 40000
}
```

**UltraCode (TOML):**
```toml
[core]
active_model = "claude-3-5-sonnet"
active_provider = "anthropic"

[providers]
timeout = 120

[providers.anthropic]
max_tokens = 40000
```

#### 2. Automatische Portierung

```bash
# UltraCode versucht, Claude-Konfiguration automatisch zu portieren
ultracode --migrate-from claude
```

---

### Phase 5: MCP-Server migrieren

**Claude Code MCP-Server** sind **1:1 kompatibel** mit UltraCode:

```toml
# ~/.ultracode/config.toml
[[mcp_servers]]
name = "github"
transport = "http"
url = "http://localhost:8080"

[[mcp_servers]]
name = "filesystem"
transport = "stdio"
command = "uvx"
args = ["mcp-server-fetch"]
```

---

### Phase 6: LSP-Integration migrieren

Claude Codes **LSP-Bridge** ist in UltraCode **voll unterstützt**:

- VS Code Extension
- JetBrains Plugin
- Neovim Integration

**Einrichtung:**
```bash
# VS Code
code --install-extension ultracode.vscode

# JetBrains
# UltraCode Plugin installieren

# Neovim
# UltraCode Neovim Plugin installieren
```

---

### Phase 7: Bun → Node.js Migration (optional)

Claude Code verwendet **Bun** als Runtime. UltraCode verwendet **Node.js**, unterstützt aber auch **Bun**.

#### 1. Bun installieren (optional)

```bash
# Bun installieren (optional für bessere Performance)
curl -fsSL https://bun.sh/install | bash
```

#### 2. UltraCode mit Bun verwenden

```bash
# UltraCode mit Bun-Runtime
bunx ultracode
```

**✅ UltraCode funktioniert mit Node.js und Bun!**

---

### Phase 8: Testen

#### 1. Grundlegende Funktionalität

```bash
ultracode

> "Hallo UltraCode"
> /agents default
> /tools list
```

#### 2. Claude-spezifische Features

```
# Web Fetch
> web_fetch(url="https://example.com")

# Web Search
> web_search(query="TypeScript Tips")

# Agent Tasks
> task(task="Analysiere Codebase", agent="general")
```

#### 3. Neue UltraCode-Features

```
# Multi-Model
> /config set provider mistral
> /config set model mistral-large

# AI-Versionierung
> version_analyze()
> version_suggest()
```

---

## 🔧 Kompatibilitätsmodus

```bash
ultracode --compat claude
```

**Features:**
- Claude-Tool-Namen werden unterstützt
- Claude-Konfiguration wird portiert
- Bun-spezifische Features werden emuliert

---

## ⚠️ Bekannte Unterschiede

| **Unterschied** | **Claude Code** | **UltraCode** | **Lösung** |
|----------------|-----------------|---------------|------------|
| **Multi-Model** | ❌ (nur Anthropic) | ✅ (Mistral, Anthropic, OpenAI, lokal) | Neue Anbieter hinzufügen |
| **Runtime** | Bun | Node.js (+ Bun) | Node.js installieren, Bun optional |
| **Auth** | `/login` | `/auth` oder `--setup` | `/auth` oder `ultracode --setup` |
| **Konfiguration** | TypeScript/JSON | TOML | Automatische Portierung |
| **AI-Versionierung** | ❌ | ✅ | Neue Features nutzen |
| **Skills** | ✅ | ✅++ | Erweitert in UltraCode |

---

## 📝 Migrations-Checkliste

- [ ] **Backup** von Claude-Konfiguration erstellt
- [ ] **UltraCode** installiert
- [ ] **API-Keys** migriert (Anthropic + neue Anbieter)
- [ ] **Konfiguration** portiert
- [ ] **Tools/Commands** getestet
- [ ] **MCP-Server** migriert
- [ ] **LSP-Integration** eingerichtet
- [ ] **Neue Features** ausprobiert (Multi-Model, AI-Versionierung)
- [ ] **Bun** installiert (optional)
- [ ] **Alte Konfiguration** archiviert

---

## 💡 Tipps für Claude Code-Nutzer

### 1. Vorteile von UltraCode

✅ **Multi-Model-Unterstützung** - Nicht nur Anthropic!
✅ **AI-Versionierung** - Einzigartiges USP
✅ **80+ Tools** - Mehr als doppelt so viele
✅ **Verbesserte Agenten** - 10+ verschiedene Agenten
✅ **Open Source** - Volle Transparenz
✅ **Community-getrieben** - Schnelle Entwicklung

### 2. Multi-Model nutzen

```bash
# Mistral Modelle verwenden
ultracode --model mistral-large --provider mistral

# OpenAI Modelle verwenden
ultracode --model gpt-4 --provider openai

# Lokale Modelle verwenden
ultracode --model llama3:70b --provider local
```

### 3. Gewohnte Workflows

| **Claude Code-Workflow** | **UltraCode-Workflow** |
|--------------------------|------------------------|
| `claude` | `ultracode` |
| `claude --model sonnet` | `ultracode --model claude-3-5-sonnet` |
| `/review` | `/agents review` oder `/review` |
| `task(...)` | `task(...)` (verbessert) |

---

## 🚀 Nächste Schritte

1. **Migration abschließen** mit der Checkliste
2. **Neue Features ausprobieren:**
   - [Multi-Model →](../../GETTING-STARTED/configuration.md)
   - [AI-Versionierung →](../AI-FEATURES/versioning-system.md)
   - [Agenten →](../DEVELOPMENT/agents-reference.md)
3. **Feedback geben:**
   - [GitHub Issues](https://github.com/AndreasSchwan-SIMO/UltraCode/issues) (Label: `migration`)
   - [Discord #migration](https://discord.gg/ultracode)

---

## 🔗 Nützliche Links

- [UltraCode Dokumentation →](../../README.md)
- [Multi-Model Konfiguration →](../../GETTING-STARTED/configuration.md)
- [Tools-Referenz →](../DEVELOPMENT/tools-reference.md)
- [Agenten-Referenz →](../DEVELOPMENT/agents-reference.md)
- [MCP-Integration →](../DEVELOPMENT/architecture.md#mcp-server-integration)
