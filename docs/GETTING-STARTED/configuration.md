# UltraCode Konfiguration

> **Anpassung von UltraCode an deine Bedürfnisse**

---

## 📁 Konfigurationsdateien

UltraCode verwendet eine **hierarchische Konfiguration** mit folgenden Prioritäten (höchste zuerst):

```
1. Projekt-Konfiguration      → .vibe/config.toml (oder .ultracode/config.toml)
2. Benutzer-Konfiguration     → ~/.ultracode/config.toml
3. Standard-Konfiguration     → (im UltraCode-Paket eingebettet)
```

---

## 📝 Konfigurationsformat (TOML)

Alle Konfigurationen verwenden das **TOML-Format** für bessere Lesbarkeit.

**Beispiel:**
```toml
# ~/.ultracode/config.toml
[core]
default_agent = "build"
active_model = "mistral-large"

[providers]
mistral_api_key = "sk-..."
anthropic_api_key = "sk-..."

[tools]
disabled = ["write_file", "bash"]
```

---

## 🔧 Erstanlauf-Konfiguration

Beim ersten Start führt UltraCode dich durch die **interaktive Einrichtung**:

```bash
ultracode
```

**Schritte:**
1. API-Key(s) eingeben
2. Standard-Agent auswählen
3. Standard-Modell auswählen
4. Tool-Berechtigungen festlegen
5. Theme auswählen

---

## 🎛️ Hauptkonfigurationsoptionen

### 1. Core-Einstellungen

```toml
[core]
# Standard-Agent (default, build, plan, review, release)
default_agent = "build"

# Standard-Modell
active_model = "mistral-large"

# Standard-Anbieter (mistral, anthropic, openai, local)
active_provider = "mistral"

# Sprache für Ausgabe (de, en, fr, es, ...)
language = "de"

# Maximale Token pro Nachricht
max_tokens = 32000

# Temperatur (Kreativität: 0.0-1.0)
temperature = 0.7

# Debug-Modus
debug = false

# Telemetrie (anonymisierte Nutzungsdaten)
enable_telemetry = true

# Update-Prüfungen
enable_update_checks = true
```

---

### 2. API-Anbieter und Keys

**Wichtig:** API-Keys sollten in `~/.ultracode/.env` gespeichert werden, nicht in der Konfiguration!

```bash
# ~/.ultracode/.env
MISTRAL_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

**Konfiguration:**
```toml
[providers]
# Standard-Anbieter
default = "mistral"

# Timeout für API-Anfragen (Sekunden)
timeout = 60

# Retry-Logik
max_retries = 3
retry_delay = 1

# Proxy-Einstellungen
[providers.proxy]
enabled = false
url = "http://proxy.example.com:8080"

# Lokale Modelle
[providers.local]
enabled = true
# Path zur ollama oder anderen lokalen LLM-Servern
endpoint = "http://localhost:11434"
models = ["llama3:70b", "mistral:7b"]
```

---

### 3. Agenten-Konfiguration

UltraCode kommt mit **vordefinierten Agenten** und erlaubt **benutzerdefinierte Agenten**.

```toml
[agents]
# Standard-Agent für neue Sessions
default = "build"

# Vordefinierte Agenten (können überschrieben werden)
[agents.build]
active_model = "mistral-large"
system_prompt_id = "default"
disabled_tools = []

[agents.plan]
active_model = "mistral-medium"
system_prompt_id = "plan"
disabled_tools = ["write_file", "edit", "bash"]

[agents.review]
active_model = "mistral-medium"
system_prompt_id = "review"
disabled_tools = ["write_file", "edit"]

# Benutzerdefinierter Agent
[agents.security-audit]
active_model = "mistral-large"
system_prompt_id = "security"
disabled_tools = ["write_file"]
enabled_tools = ["read", "grep", "bash"]

[agents.release-manager]
active_model = "mistral-large"
system_prompt_id = "release"
enabled_tools = ["read", "write_file", "bash", "git_*"]
```

**System Prompts:**
- Werden in `~/.ultracode/prompts/{name}.md` gespeichert
- Beispiel: `~/.ultracode/prompts/security.md`

---

### 4. Tools-Konfiguration

```toml
[tools]
# Standardmäßig deaktivierte Tools
disabled = ["bash", "write_file"]

# Standardmäßig aktivierte Tools (überschreibt disabled)
enabled = ["read", "grep"]

# Tool-spezifische Einstellungen
[tools.bash]
# Berechtigung: ask (fragen), always (immer erlauben), never (nie erlauben)
permission = "ask"
# Maximale Ausführungsdauer (Sekunden)
timeout = 30
# Erlaubte Verzeichnisse
allowed_dirs = ["/workspace", "/home/user/projects"]

[tools.write_file]
permission = "ask"
# Dateitypen, die nie überschrieben werden dürfen
protected_extensions = [".env", ".toml", ".json"]

[tools.grep]
permission = "always"
# Maximale Anzahl Treffer
max_matches = 1000

[tools.task]
# Maximale Anzahl parallel laufender Subagents
max_concurrent = 3
# Timeout für Subagents (Sekunden)
timeout = 300
```

---

### 5. MCP-Server-Konfiguration

**Model Context Protocol (MCP)** für erweiterte Tools:

```toml
[[mcp_servers]]
name = "github"
transport = "http"
url = "http://localhost:8080"

[[mcp_servers]]
name = "filesystem"
transport = "stdio"
command = "uvx"
args = ["mcp-server-fetch"]

[[mcp_servers]]
name = "browser"
transport = "http"
url = "http://localhost:8081"
api_key_env = "BROWSER_API_KEY"

# Berechtigungen für MCP-Tools
[tools.github_mcp_get]
permission = "always"

[tools.filesystem_mcp_read]
permission = "ask"
```

---

### 6. UI und Theme

```toml
[ui]
# Theme: dark, light, dracula, solarized, monokai, custom
theme = "dracula"

# Farbschema (falls theme = "custom")
[ui.colors]
primary = "#6366f1"
secondary = "#8b5cf6"
background = "#1a1a2e"
text = "#e2e8f0"
error = "#ef4444"

# Editor-Einstellungen
[ui.editor]
# Externer Editor (für Strg+G)
command = "code"
args = ["--wait"]

# Autocompletion
[ui.autocomplete]
enabled = true
# Maximale Anzahl Vorschläge
max_suggestions = 10
```

---

### 7. Session-Einstellungen

```toml
[sessions]
# Sessions speichern
enable_persistence = true
# Speicherort für Sessions
save_dir = "~/.ultracode/sessions"

# Session-Timeout (Minuten, 0 = nie)
timeout = 60

# Maximale Anzahl gespeicherter Sessions
max_sessions = 50

# Session-Kompaktierung (Zusammenfassen langer Chats)
[session.compaction]
enabled = true
# Nach wie vielen Nachrichten komprimieren
threshold = 50
# Welches Modell für Kompaktierung verwenden
model = "mistral-medium"
```

---

### 8. Git-Integration

```toml
[git]
# Automatisch Git-Status anzeigen
auto_status = true

# Automatisch Git-Commits vor Tools ausführen
auto_commit = false

# Commit-Nachrichten generieren
[git.commit]
enabled = true
# Modell für Commit-Nachrichten
model = "mistral-medium"
# Template für Commit-Nachrichten
template = "conventional"

# Branch-Schutz
[git.protection]
protected_branches = ["main", "master", "develop"]
# Tools, die auf geschützten Branches blockiert sind
blocked_tools = ["write_file", "edit"]
```

---

### 9. AI-Versionierungssystem

```toml
[versioning]
# Aktivieren/Deaktivieren
enabled = true

# Standard-Strategie: semantic, date, custom
strategy = "semantic"

# Semantic Versioning
[versioning.semantic]
# Automatisch Version vorschlagen
auto_suggest = true

# Prefix für Versionen (z.B. "v")
prefix = "v"

# Release-Kanäle
[versioning.channels]
stable = "1.0.0"
lts = "0.9.0"
experimental = "2.0.0-alpha"

# Quality Gates
[versioning.quality]
# Mindest-Testabdeckung für Release
min_coverage = 80

# Erzwinge Code Review vor Release
require_review = true

# Automatische Changelog-Generierung
[versioning.changelog]
enabled = true
# Datei für Changelog
file = "CHANGELOG.md"
# Modell für Changelog
model = "mistral-medium"
```

---

### 10. Enterprise-Einstellungen

```toml
[enterprise]
# Selbsthosting-Modus
enable_self_hosting = false

# Server-Konfiguration
[server]
host = "0.0.0.0"
port = 3000

# Authentication
[auth]
# Typ: none, api_key, jwt, oauth
type = "api_key"
# API-Keys für Selbsthosting
keys = ["sk-...", "sk-..."]

# Team-Kollaboration
[team]
enabled = false
# Maximale Anzahl Team-Mitglieder
max_members = 10

# Audit Logging
[audit]
enabled = false
log_file = "~/.ultracode/audit.log"
```

---

## 🛠️ Konfiguration per CLI

Du kannst die Konfiguration auch **interaktiv** oder per **CLI-Befehlen** ändern:

### Interaktive Konfiguration

```bash
# Setup-Assistent
ultracode --setup

# Konfiguration bearbeiten
ultracode --config edit
```

---

### CLI-Kommandos

```bash
# Konfigurationswert setzen
ultracode --config set core.default_agent build
ultracode --config set active_model mistral-large

# Konfigurationswert abfragen
ultracode --config get core.default_agent

# Konfiguration zurücksetzen
ultracode --config reset

# Konfiguration anzeigen
ultracode --config show

# Konfiguration validieren
ultracode --config validate
```

---

### Slash-Kommandos in UltraCode

```
# Konfiguration in der Session ändern
/config set model mistral-large
/config set default_agent review

# Konfiguration anzeigen
/config show

# Verfügbare Optionen anzeigen
/config options core.default_agent
```

---

## 🔄 Konfiguration verwalten

### Konfiguration speichern

```bash
# Aktuelle Konfiguration speichern
ultracode --config save

# Konfiguration in Datei exportieren
ultracode --config export backup.toml
```

---

### Konfiguration laden

```bash
# Konfiguration aus Datei importieren
ultracode --config import backup.toml

# Standard-Konfiguration wiederherstellen
ultracode --config reset
```

---

### Mehrere Konfigurationen

Du kannst **Profil-Konfigurationen** für verschiedene Umgebungen erstellen:

```toml
# ~/.ultracode/profiles/work.toml
[core]
default_agent = "build"
active_model = "mistral-large"

[providers]
mistral_api_key = "sk-work-..."

# ~/.ultracode/profiles/personal.toml
[core]
default_agent = "plan"
active_model = "mistral-medium"

[providers]
mistral_api_key = "sk-personal-..."
```

**Verwendung:**
```bash
ultracode --profile work
ultracode --profile personal
```

---

## 📊 Konfigurations-Referenz

### Alle verfügbaren Optionen

| **Kategorie** | **Option** | **Typ** | **Standard** | **Beschreibung** |
|--------------|------------|---------|--------------|------------------|
| core | default_agent | string | "default" | Standard-Agent |
| core | active_model | string | "mistral-large" | Standard-Modell |
| core | active_provider | string | "mistral" | Standard-Anbieter |
| core | language | string | "en" | Sprache |
| core | max_tokens | number | 32000 | Max Token |
| core | temperature | number | 0.7 | Temperatur |
| core | debug | boolean | false | Debug-Modus |
| providers | timeout | number | 60 | API-Timeout |
| providers | max_retries | number | 3 | Max Retries |
| tools | disabled | array | [] | Deaktivierte Tools |
| tools | enabled | array | [] | Aktivierte Tools |
| ui | theme | string | "dark" | Theme |
| sessions | enable_persistence | boolean | true | Sessions speichern |
| git | auto_status | boolean | true | Git-Status automatisch |
| versioning | enabled | boolean | true | AI-Versionierung aktiv |

---

## 💡 Tipps für Fortgeschrittene

### 1. Umgebungsvariablen

UltraCode liest auch **Umgebungsvariablen**:

```bash
# API-Keys
export MISTRAL_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-...

# UltraCode-spezifisch
export ULTRACODE_DEBUG=true
export ULTRACODE_THEME=dracula

# LLM-Anbieter
export ULTRACODE_PROVIDER=mistral
export ULTRACODE_MODEL=mistral-large
```

**Priorität:** Umweltvariablen > Konfiguration > Standard

---

### 2. Protokoll-spezifische Konfiguration

Erstelle eine **`.ultracode.toml`** in deinem Projekt für **projektspezifische Einstellungen**:

```toml
# .ultracode.toml
[core]
default_agent = "review"

[tools]
disabled = ["bash"]

[versioning]
strategy = "semantic"
```

---

### 3. Dynamische Konfiguration

Du kannst **JavaScript-Expressionen** in der Konfiguration verwenden (experimentell):

```toml
[core]
# Modell basierend auf Tageszeit
active_model = "{{ new Date().getHours() < 12 ? 'mistral-medium' : 'mistral-large' }}"
```

---

### 4. Konfiguration validieren

```bash
# Validierung
ultracode --config validate

# Fehlende API-Keys prüfen
ultracode --config check-keys

# Konfiguration auf Syntax prüfen
ultracode --config lint
```

---

## 🔍 Problembehandlung

### ❌ "Invalid TOML syntax"

**Ursache:** Syntax-Fehler in der Konfigurationsdatei

**Lösung:**
```bash
# Validierung
ultracode --config validate

# Online-TOML-Validator
https://www.toml-lint.com/
```

---

### ❌ "API key not found for provider"

**Ursache:** API-Key nicht konfiguriert

**Lösung:**
```bash
# API-Key hinzufügen
ultracode --setup

# Oder in .env
 echo "MISTRAL_API_KEY=sk-..." >> ~/.ultracode/.env
```

---

### ❌ "Unknown model: xyz"

**Ursache:** Modell nicht verfügbar oder falsch geschrieben

**Lösung:**
```bash
# Verfügbare Modelle anzeigen
ultracode --providers list-models

# Konfiguration anpassen
ultracode --config set active_model mistral-large
```

---

### ❌ "Tool 'xyz' not found"

**Ursache:** Tool deaktiviert oder falsch geschrieben

**Lösung:**
```bash
# Verfügbare Tools anzeigen
ultracode --tools list

# Tool aktivieren
ultracode --config enable-tool xyz
```

---

## 📚 Beispiele

### Beispiel 1: Minimale Konfiguration

```toml
# ~/.ultracode/config.toml
[core]
default_agent = "build"
active_model = "mistral-large"
```

---

### Beispiel 2: Vollständige Entwicklungskonfiguration

```toml
[core]
default_agent = "build"
active_model = "mistral-large"
active_provider = "mistral"
max_tokens = 40000
temperature = 0.3
language = "de"

[providers]
timeout = 120
max_retries = 5

[tools]
disabled = ["bash"]

[tools.write_file]
permission = "ask"

[tools.read]
permission = "always"

[ui]
theme = "dracula"

[sessions]
enable_persistence = true
max_sessions = 100

[git]
auto_status = true

[versioning]
enabled = true
strategy = "semantic"
```

---

### Beispiel 3: Enterprise-Konfiguration

```toml
[core]
default_agent = "review"
active_model = "mistral-large"

[providers]
timeout = 180

[tools]
disabled = ["bash", "write_file"]

[tools.read]
permission = "always"

[tools.grep]
permission = "always"

[team]
enabled = true
max_members = 50

[audit]
enabled = true
log_file = "/var/log/ultracode/audit.log"

[enterprise]
enable_self_hosting = true

[server]
host = "0.0.0.0"
port = 3000
```

---

## 📖 Nächste Schritte

- [Quick Start →](./quick-start.md) – Zurück zu den Basics
- [AI-Versionierung →](../AI-FEATURES/versioning-system.md) – Einzigartige Features
- [Tools-Referenz →](../REFERENCE/tools-reference.md) – Alle Tools im Detail
- [Agenten →](../DEVELOPMENT/agents-reference.md) – Agenten verstehen

---

## 🔗 Externe Ressourcen

- [TOML-Spezifikation](https://toml.io/en/v2.0.0)
- [TOML-Validator](https://www.toml-lint.com/)
- [UltraCode Standard-Konfiguration](https://github.com/ultracode-ai/ultracode/blob/main/packages/core/src/config/defaults.ts)
