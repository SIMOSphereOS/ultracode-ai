# AI-Coding-Assistent → UltraCode AI Migration

> **Komplette Anleitung für die Migration von anderen AI-Coding-Assistenten zu UltraCode AI**

> **⚠️ Reifegrad-Hinweis / Maturity note:** Teile dieser Anleitung sind aspirativ. Der verbindliche, tatsächlich implementierte Funktionsstand steht in [`docs/comparison.md`](../comparison.md) und im [README](../../README.md). **Nicht implementiert:** LSP (geplant), Desktop-App und IDE-Plugins (bewusst nicht geplant — UltraCode ist CLI/TUI); manche unten gezeigten Tools/Commands (z. B. `lsp_*`, `web_search`, `packages/desktop`, `packages/ide`) sind generische bzw. geplante Konzepte, keine implementierten Features. **Real:** 13 Built-in-Tools (plus beliebig viele über MCP), 6 eingebaute Agenten, 5 LLM-Provider (inkl. LM Studio via OpenAI-kompatiblem Endpoint). / Parts of this guide are aspirational; the authoritative implemented state is in `docs/comparison.md` and the README.

---

## 🎯 Übersicht

Diese Anleitung hilft dir, **von deinem bisherigen CLI-Assistenten zu UltraCode AI zu migrieren** — unabhängig davon, welches Werkzeug du bisher genutzt hast. Für OpenCode und Mistral Vibe gibt es eigene, detaillierte Anleitungen ([OpenCode →](./opencode-migration.md), [Vibe →](./vibe-migration.md)); dieser Guide deckt alle übrigen AI-Coding-Assistenten ab. UltraCode AI bietet **Multi-Model-Unterstützung** (Mistral, Anthropic, OpenAI, lokale Modelle) statt Bindung an einen einzelnen Anbieter.

---

## 📊 Vergleich: Typischer CLI-Assistent vs UltraCode AI

| **Feature** | **Typischer CLI-Assistent** | **UltraCode AI** | **Hinweise** |
|-------------|------------------------------|---------------|--------------|
| **Sprache** | TypeScript oder Python | TypeScript | ✅ Striktes ESM/NodeNext |
| **Runtime** | Node.js oder Bun | Node.js ≥22.13 | ⚠️ Runtime-Anforderung |
| **UI** | Terminal-UI (oft React + Ink) | React + Ink | ✅ Vertrautes Bedienkonzept |
| **Agenten** | ✅ (meist wenige) | 6 eingebaut + projektlokale | ✅ Built-in-Agenten + `.ultracode/agents` |
| **Tools** | ~25–40 | 13 eingebaut + MCP | ✅ 13 Built-in-Tools plus beliebig viele über MCP |
| **Commands** | ~30–50 | Kern-Kommandos | ⚠️ CLI-Kommandos (run/config/skills/versioning …) |
| **MCP Support** | teils | ✅ | ✅ MCP-Client (stdio/http) |
| **LSP Support** | teils | ❌ (geplant) | Noch nicht implementiert |
| **Bridge System** | teils (VS Code/JB) | ❌ (nicht geplant) | UltraCode bleibt CLI/TUI |
| **AI-Versionierung** | ❌ | ✅ **UNIQUE** | ✅ UltraCode AI USP |
| **Multi-Model** | oft ❌ (nur ein Anbieter) | ✅ (Anthropic, OpenAI, Mistral, Ollama, OpenAI-kompatibel) | ✅ **Hauptvorteil!** 5 Provider inkl. LM Studio |
| **Konfiguration** | JSON/TOML/YAML | TOML | ⚠️ Format-Portierung |
| **Skills System** | teils | ✅++ (erweitert) | ✅ Kompatible Konzepte |
| **Voice Mode** | teils | ✅ | ✅ Unterstützt |

---

## 📁 Dateistruktur-Vergleich

```
Bisheriger Assistent:        UltraCode AI:
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
Bisher: Konfigverzeichnis deines Assistenten (verstecktes Verzeichnis im Home)
UltraCode AI: ~/.ultracode/
```

---

## 🔄 Migration Schritt-für-Schritt

### Phase 1: Vorbereitung

#### 1. Backup erstellen

```bash
# Konfigverzeichnis deines bisherigen Assistenten sichern
# (Pfad anpassen, z. B. ~/.mein-assistent)
OLD_CONFIG_DIR=~/.mein-assistent
if [ -d "$OLD_CONFIG_DIR" ]; then
  cp -r "$OLD_CONFIG_DIR" "${OLD_CONFIG_DIR}-backup-$(date +%Y%m%d)"
fi

# API-Keys sichern
if [ -f "$OLD_CONFIG_DIR/.env" ]; then
  cp "$OLD_CONFIG_DIR/.env" ~/assistent-backup.env
fi
```

#### 2. UltraCode AI installieren

```bash
npm install -g ultracode-ai
```

#### 3. API-Keys für UltraCode AI einrichten

**Wichtig:** Viele CLI-Assistenten sind an **einen einzigen LLM-Anbieter** gebunden. UltraCode AI unterstützt **mehrere Anbieter** parallel.

```bash
# Bestehenden API-Key übernehmen (je nach bisherigem Anbieter)
echo "ANTHROPIC_API_KEY=sk-..." >> ~/.ultracode/.env

# UltraCode AI unterstützt auch weitere Anbieter
echo "MISTRAL_API_KEY=sk-..." >> ~/.ultracode/.env
echo "OPENAI_API_KEY=sk-..." >> ~/.ultracode/.env
```

---

### Phase 2: Tools migrieren

#### 1. Tool-Mapping

**Alle üblichen Assistenten-Tools haben eine Entsprechung in UltraCode AI!**

| **Tool-Konzept (bisheriger Assistent)** | **UltraCode AI Tool** | **Hinweise** |
|------------------------------------------|--------------------|--------------|
| Shell-/Bash-Tool | `bash` | ✅ Identisches Konzept |
| Datei lesen | `read` | ✅ Identisches Konzept |
| Datei schreiben | `write_file` | ✅ Identisches Konzept |
| Datei editieren | `edit` | ✅ Identisches Konzept |
| Glob-/Dateisuche | `glob` | ✅ Identisches Konzept |
| Text-/Grep-Suche | `grep` | ✅ Identisches Konzept |
| Web-Fetch | `web_fetch` | ✅ Identisches Konzept |
| Web-Suche | `web_search` | ✅ Identisches Konzept |
| Subagent-/Task-Tool | `task` | ✅ Verbessert (Subagents) |
| Skill-Tool | `skill` | ✅ Identisches Konzept |
| MCP-Tools | `mcp_*` | ✅ Erweitert |
| LSP-Tools | `lsp_*` | ❌ In UltraCode noch nicht implementiert (geplant) |
| Nachrichten an Agenten | `send_message` | ✅ Neu in UltraCode AI |
| Git-Tools | `git_*` | ✅ Erweitert |

**UltraCode AI deckt alle gängigen Tool-Konzepte ab + viele weitere!**

---

#### 2. Commands migrieren

Die meisten CLI-Assistenten nutzen ähnliche Slash-Commands. So findest du deine gewohnten Befehle wieder:

| **Gewohnter Command** | **UltraCode AI Command** | **Hinweise** |
|------------------------|------------------------|--------------|
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

**✅ Fast alle gängigen Slash-Commands sind in UltraCode AI verfügbar!**

---

### Phase 3: Agenten migrieren

#### 1. Agenten-Mapping

| **Agent-Konzept (bisheriger Assistent)** | **UltraCode AI Agent** | **Hinweise** |
|-------------------------------------------|---------------------|--------------|
| Default-/Standard-Modus | default | ✅ Ähnlich |
| Plan-Modus | plan | ✅ Ähnlich |
| Custom Agents | custom | ✅ Ähnlich |

**UltraCode AI hat zusätzliche Agenten:**
- `build` - Entwicklung
- `review` - Code Review
- `release` - Release-Management
- `security` - Sicherheitsprüfung

---

### Phase 4: Konfiguration portieren

Viele Assistenten verwenden **JSON- oder YAML-Konfiguration**, UltraCode AI verwendet **TOML**.

#### 1. Wichtige Konfigurationen

**Bisheriger Assistent (typisch, JSON):**
```json
{
  "model": "mistral-large",
  "provider": "mistral",
  "timeout": 120,
  "maxTokens": 40000
}
```

**UltraCode AI (TOML):**
```toml
[core]
active_model = "mistral-large"
active_provider = "mistral"

[providers]
timeout = 120

[providers.mistral]
max_tokens = 40000
```

#### 2. Manuelle Portierung

Übertrage die Kernwerte (aktives Modell, Anbieter, Timeouts, Token-Limits) aus der bisherigen Konfiguration in `~/.ultracode/config.toml`. Für OpenCode und Vibe gibt es automatisierte Migrationstools (`ultracode-ai --migrate-from opencode|vibe`); bei anderen Assistenten ist die Portierung in wenigen Minuten manuell erledigt.

---

### Phase 5: MCP-Server migrieren

**MCP-Server-Definitionen** sind standardisiert und damit **1:1 kompatibel** mit UltraCode AI:

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

UltraCode AI ist bewusst CLI/TUI-fokussiert: eine LSP-/IDE-Bridge ist **noch nicht implementiert** (LSP ist geplant, Desktop/IDE nicht):

- VS Code Extension
- JetBrains Plugin
- Neovim Integration

**Einrichtung:**
```bash
# VS Code
code --install-extension ultracode.vscode

# JetBrains
# UltraCode AI Plugin installieren

# Neovim
# UltraCode AI Neovim Plugin installieren
```

---

### Phase 7: Bun → Node.js Migration (optional)

Manche Assistenten verwenden **Bun** als Runtime. UltraCode AI verwendet **Node.js**, unterstützt aber auch **Bun**.

#### 1. Bun installieren (optional)

```bash
# Bun installieren (optional für bessere Performance)
curl -fsSL https://bun.sh/install | bash
```

#### 2. UltraCode AI mit Bun verwenden

```bash
# UltraCode AI mit Bun-Runtime
bunx ultracode-ai
```

**✅ UltraCode AI funktioniert mit Node.js und Bun!**

---

### Phase 8: Testen

#### 1. Grundlegende Funktionalität

```bash
ultracode-ai

> "Hallo UltraCode AI"
> /agents default
> /tools list
```

#### 2. Gewohnte Features

```
# Web Fetch
> web_fetch(url="https://example.com")

# Web Search
> web_search(query="TypeScript Tips")

# Agent Tasks
> task(task="Analysiere Codebase", agent="general")
```

#### 3. Neue UltraCode AI-Features

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

Für OpenCode und Mistral Vibe bietet UltraCode AI dedizierte Kompatibilitätsmodi:

```bash
ultracode-ai --compat opencode
ultracode-ai --compat vibe
```

Bei anderen Assistenten empfiehlt sich die manuelle Migration nach dieser Anleitung — dank standardisierter Konzepte (MCP, Skills, TOML-Config) ist der Umstieg in der Regel schnell erledigt.

---

## ⚠️ Bekannte Unterschiede

| **Unterschied** | **Typischer CLI-Assistent** | **UltraCode AI** | **Lösung** |
|----------------|------------------------------|---------------|------------|
| **Multi-Model** | oft ❌ (nur ein Anbieter) | ✅ (Mistral, Anthropic, OpenAI, lokal) | Neue Anbieter hinzufügen |
| **Runtime** | Node.js oder Bun | Node.js (+ Bun) | Node.js installieren, Bun optional |
| **Auth** | `/login` | `/auth` oder `--setup` | `/auth` oder `ultracode-ai --setup` |
| **Konfiguration** | JSON/YAML | TOML | Manuelle Portierung (siehe Phase 4) |
| **AI-Versionierung** | ❌ | ✅ | Neue Features nutzen |
| **Skills** | teils | ✅++ | Erweitert in UltraCode AI |

---

## 📝 Migrations-Checkliste

- [ ] **Backup** der bisherigen Konfiguration erstellt
- [ ] **UltraCode AI** installiert
- [ ] **API-Keys** migriert (bestehender Anbieter + neue Anbieter)
- [ ] **Konfiguration** portiert
- [ ] **Tools/Commands** getestet
- [ ] **MCP-Server** migriert

- [ ] **Neue Features** ausprobiert (Multi-Model, AI-Versionierung)
- [ ] **Bun** installiert (optional)
- [ ] **Alte Konfiguration** archiviert

---

## 💡 Tipps für Umsteiger

### 1. Vorteile von UltraCode AI

✅ **Multi-Model-Unterstützung** - Kein Anbieter-Lock-in!
✅ **AI-Versionierung** - Einzigartiges USP
✅ **13 Built-in-Tools + MCP** - plus beliebig viele über MCP-Server
✅ **Verbesserte Agenten** - 10+ verschiedene Agenten
✅ **Open Source** - Volle Transparenz
✅ **Community-getrieben** - Schnelle Entwicklung

### 2. Multi-Model nutzen

```bash
# Mistral Modelle verwenden
ultracode-ai --model mistral-large --provider mistral

# OpenAI Modelle verwenden
ultracode-ai --model gpt-4 --provider openai

# Lokale Modelle verwenden
ultracode-ai --model llama3:70b --provider local
```

### 3. Gewohnte Workflows

| **Bisheriger Workflow** | **UltraCode AI-Workflow** |
|--------------------------|------------------------|
| `<assistent>` | `ultracode-ai` |
| `<assistent> --model <modell>` | `ultracode-ai --model <modell>` |
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
   - [GitLab Issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues) (Label: `migration`)
   - [Discord #migration](https://discord.gg/ultracode)

---

## 🔗 Nützliche Links

- [UltraCode AI Dokumentation →](../../README.md)
- [Multi-Model Konfiguration →](../../GETTING-STARTED/configuration.md)
- [Tools-Referenz →](../DEVELOPMENT/tools-reference.md)
- [Agenten-Referenz →](../DEVELOPMENT/agents-reference.md)
- [MCP-Integration →](../DEVELOPMENT/architecture.md#mcp-server-integration)
