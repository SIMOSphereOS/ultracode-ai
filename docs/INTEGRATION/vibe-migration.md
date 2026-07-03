# Mistral Vibe → UltraCode AI Migration

> **Komplette Anleitung für die Migration von Mistral Vibe zu UltraCode AI**

---

## 🎯 Übersicht

Diese Anleitung hilft dir, **nahtlos von Mistral Vibe zu UltraCode AI zu migrieren**. UltraCode AI kombiniert die besten Features von Vibe mit OpenCode und Claude Code.

---

## 📊 Vergleich: Mistral Vibe vs UltraCode AI

| **Feature** | **Mistral Vibe** | **UltraCode AI** | **Hinweise** |
|-------------|------------------|---------------|--------------|
| **Sprache** | Python | TypeScript (+ Python) | ✅ Multi-Language in UltraCode AI |
| **Runtime** | Python 3.12+ | Node.js 22.13+ (+ Bun) | ⚠️ Runtime-Wechsel |
| **UI** | React + Rich | React + Ink | ⚠️ Unterschiedliche UI-Bibliothek |
| **Agenten** | ❌ (begrenzt) | ✅++ (10+ Agenten) | ✅ Volles Agenten-System |
| **Tools** | ~25 | **80+** | ✅ Alle Vibe-Tools + viele mehr |
| **Skills** | ✅ | ✅++ (erweitert) | ✅ Kompatibel |
| **MCP Support** | ✅ | ✅ | ✅ Voll unterstützt |
| **LSP Support** | ❌ | ✅ | ✅ Neu in UltraCode AI |
| **AI-Versionierung** | ❌ | ✅ **UNIQUE** | ✅ UltraCode AI USP |
| **Multi-Model** | ✅ | ✅ (Mistral, Anthropic, OpenAI, lokal) | ✅ Erweitert |
| **Konfiguration** | TOML | TOML | ✅ Kompatibel |
| **Session Management** | ✅ | ✅++ | ✅ Verbessert |

---

## 📁 Dateistruktur-Vergleich

```
Mistral Vibe:                 UltraCode AI:
┌─────────────────┐          ┌─────────────────┐
│ ~/.vibe/         │          │ ~/.ultracode/   │
│ ├── config.toml  │          │ ├── config.toml  │
│ ├── .env         │          │ ├── .env         │
│ ├── skills/       │  ✅      │ ├── skills/      │
│ │   └── */       │ ───────▶ │ │   └── */       │
│ ├── agents/       │          │ ├── agents/      │
│ │   └── *.toml   │          │ │   └── *.toml   │
│ ├── prompts/      │          │ ├── prompts/      │
│ │   └── *.md     │          │ │   └── *.md     │
│ └── logs/        │          │ └── logs/        │
└─────────────────┘          └─────────────────┘
```

---

## 🔄 Migration Schritt-für-Schritt

### Phase 1: Vorbereitung

#### 1. Backup erstellen

```bash
# Vibe-Konfiguration sichern
cp -r ~/.vibe ~/.vibe-backup-$(date +%Y%m%d)

# API-Keys sichern
if [ -f ~/.vibe/.env ]; then
  cp ~/.vibe/.env ~/.vibe-backup.env
fi
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
# Trockenlauf
ultracode-ai --migrate-from vibe --dry-run

# Echte Migration
ultracode-ai --migrate-from vibe --backup
```

**Was wird migriert:**
- `config.toml` (1:1 kompatibel)
- `.env` (API-Keys)
- Skills (Python → TypeScript Portierung)
- Prompts
- Trusted Folders

---

#### 2. Manuelle Migration

**a) API-Keys kopieren**

```bash
# Vibe verwendet .env in ~/.vibe/
if [ -f ~/.vibe/.env ]; then
  cp ~/.vibe/.env ~/.ultracode/.env
fi

# Oder manuell
cat ~/.vibe/.env >> ~/.ultracode/.env
```

**b) Konfiguration kopieren**

**Mistral Vibe (`~/.vibe/config.toml`):**
```toml
[core]
default_agent = "default"
active_model = "mistral-large"

[tools]
disabled = ["bash"]

[ui]
theme = "dracula"

[providers]
mistral_api_key = "sk-..."
```

**UltraCode AI (`~/.ultracode/config.toml`):**
```toml
# Die Konfiguration ist 1:1 kompatibel!
[core]
default_agent = "default"
active_model = "mistral-large"

[tools]
disabled = ["bash"]

[ui]
theme = "dracula"

[providers]
mistral_api_key = "sk-..."
```

**✅ Die Vibe-Konfiguration ist mit UltraCode AI kompatibel!**

---

### Phase 3: Skills migrieren

#### 1. Skills-Verzeichnis kopieren

```bash
# Skills von Vibe zu UltraCode AI kopieren
cp -r ~/.vibe/skills/ ~/.ultracode/skills/
```

**Hinweis:** UltraCode AI unterstützt **beide Skill-Formate**:
- **Vibe-Format** (Python-basiert)
- **Agent Skills Specification** (Standard)

---

#### 2. Skills anpassen (falls nötig)

**Vibe-Skill (Python):**
```python
# ~/.vibe/skills/my-skill/SKILL.md
---
name: my-skill
description: Mein Vibe Skill
user-invocable: true
---

# Skill-Logik in Python
```

**UltraCode AI-Skill (kompatibel):**
```markdown
# ~/.ultracode/skills/my-skill/SKILL.md
---
name: my-skill
description: Mein UltraCode AI Skill
user-invocable: true
allowed-tools:
  - read
  - grep
---

# Skill-Logik (wird von UltraCode AI unterstützt)
```

**✅ Vibe-Skills funktionieren in UltraCode AI ohne Änderungen!**

---

#### 3. Skills registrieren

UltraCode AI findet Skills automatisch in:
- `~/.ultracode/skills/` (Benutzer)
- `./.vibe/skills/` (Projekt)
- `./.agents/skills/` (Agent Skills Standard)

**Konfiguration:**
```toml
[skills]
# Standardmäßig aktivierte Skills
enabled = ["my-skill"]

# Skill-Pfade
skill_paths = ["~/.ultracode/skills", "./.vibe/skills"]
```

---

### Phase 4: Prompts migrieren

Vibe-Prompts sind **1:1 kompatibel** mit UltraCode AI:

```bash
# Prompts kopieren
cp -r ~/.vibe/prompts/ ~/.ultracode/prompts/
```

**Unterstützte Prompt-Typen:**
- System Prompts (`system_prompt_id`)
- Compaction Prompts (`compaction_prompt_id`)
- Custom Prompts

---

### Phase 5: Trusted Folders migrieren

```bash
# Trusted Folders kopieren
if [ -f ~/.vibe/trusted_folders.toml ]; then
  cp ~/.vibe/trusted_folders.toml ~/.ultracode/trusted_folders.toml
fi
```

---

### Phase 6: Testen

#### 1. Grundlegende Funktionalität

```bash
ultracode-ai

> "Hallo UltraCode AI"
> /agents default
> /skills list
```

#### 2. Skills testen

```
> /skills my-skill
> "Führe meinen Skill aus"
```

#### 3. MCP testen

```
> /mcp list
> mcp_list()
```

---

### Phase 7: Python-Spezifika anpassen

Falls du **Python-spezifische Tools oder Skripte** hattest:

#### 1. Python-Tools in UltraCode AI

UltraCode AI hat **native Python-Unterstützung** durch:
- **Python-Integration Paket** (`packages/python/`)
- **Vibe-CLI Portierung**

**Python-Tool verwenden:**
```bash
# Python-Skript ausführen
> bash(command="python3 script.py")

# Oder mit dem Python-Provider
> python_execute(code="print('Hello')")
```

#### 2. Python-Skills

Python-basierte Skills können in UltraCode AI verwendet werden durch:
- **Subprocess-Aufrufe**
- **Python-Provider**
- **MCP-Python-Server**

---

## 🔧 Kompatibilitätsmodus

Falls du Probleme hast:

```bash
ultracode-ai --compat vibe
```

**Features:**
- Vibe-Konfiguration wird unterstützt
- Vibe-Skills funktionieren
- Vibe-Keybindings werden emuliert

---

## ⚠️ Bekannte Unterschiede

| **Unterschied** | **Mistral Vibe** | **UltraCode AI** | **Lösung** |
|----------------|------------------|---------------|------------|
| **Runtime** | Python | Node.js | Node.js installieren |
| **CLI** | Python CLI | TypeScript CLI | UltraCode AI CLI verwenden |
| **Skills** | Python-basiert | TypeScript + Python | Beide unterstützt |
| **Agenten** | Begrenzt | Vollständig | UltraCode AI-Agenten verwenden |
| **Tools** | ~25 | 80+ | Neue Tools entdecken |
| **LSP** | ❌ | ✅ | LSP-Tools verwenden |
| **AI-Versionierung** | ❌ | ✅ | Neue Features nutzen |

---

## 📝 Migrations-Checkliste

- [ ] **Backup** von Vibe-Konfiguration erstellt
- [ ] **UltraCode AI** installiert
- [ ] **API-Keys** migriert
- [ ] **config.toml** kopiert
- [ ] **Skills** migriert
- [ ] **Prompts** migriert
- [ ] **Trusted Folders** migriert
- [ ] **Neue Features** ausprobiert (Agenten, AI-Versionierung, LSP)
- [ ] **Alte Konfiguration** archiviert

---

## 💡 Tipps für Vibe-Nutzer

### 1. Gewohnte Workflows

| **Vibe-Workflow** | **UltraCode AI-Workflow** |
|--------------------|------------------------|
| `vibe` | `ultracode-ai` |
| `vibe --agent plan` | `ultracode-ai --agent plan` |
| `vibe --prompt "..."` | `ultracode-ai "..."` |
| `/skills` | `/skills` |
| `/mcp` | `/mcp` |

### 2. Neue Features entdecken

- **Agenten-System:** `/agents build`, `/agents review`
- **AI-Versionierung:** `version_analyze()`, `release_plan()`
- **LSP-Integration:** `lsp_hover()`, `lsp_completion()`
- **80+ Tools:** Viele neue Tools verfügbar
- **Desktop App:** Voll unterstützte Desktop-Version

### 3. Performance-Verbesserungen

- UltraCode AI ist **schneller** (Node.js vs Python)
- **Parallel Execution** für Tools
- **Besseres Caching**
- **Streaming** von LLM-Antworten

---

## 🚀 Nächste Schritte

1. **Migration abschließen** mit der Checkliste
2. **Neue Features ausprobieren:**
   - [Agenten-Referenz →](../DEVELOPMENT/agents-reference.md)
   - [AI-Versionierung →](../AI-FEATURES/versioning-system.md)
   - [LSP-Integration →](../DEVELOPMENT/architecture.md#lsp-integration)
3. **Feedback geben:**
   - [GitLab Issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues) (Label: `migration`)
   - [Discord #migration](https://discord.gg/ultracode)

---

## 🔗 Nützliche Links

- [UltraCode AI Dokumentation →](../../README.md)
- [Konfiguration →](../../GETTING-STARTED/configuration.md)
- [Skills-System →](../DEVELOPMENT/architecture.md)
- [MCP-Integration →](../DEVELOPMENT/architecture.md#mcp-server-integration)
