# UltraCode Integration

> **Anleitungen für Migration und Integration**

---

## 📚 In diesem Abschnitt

Dieser Abschnitt enthält **detaillierte Anleitungen** für die Integration und Migration von bestehenden Systemen zu UltraCode.

```
INTEGRATION/
├── 🔄 opencode-migration.md    # Migration von OpenCode
├── 🔄 vibe-migration.md        # Migration von Mistral Vibe
├── 🔄 claude-migration.md      # Migration von Claude Code
└── 🧩 plugin-development.md    # Eigene Plug-ins entwickeln
```

---

## 🎯 Für wen ist dieser Abschnitt?

| **Herkunft** | **Relevante Dokumente** | **Zweck** |
|--------------|------------------------|-----------|
| **OpenCode-Nutzer** | opencode-migration.md | Migration zu UltraCode |
| **Mistral Vibe-Nutzer** | vibe-migration.md | Migration zu UltraCode |
| **Claude Code-Nutzer** | claude-migration.md | Migration zu UltraCode |
| **Entwickler** | plugin-development.md | Eigene Plug-ins erstellen |

---

## 📖 Dokumentationsübersicht

### [OpenCode Migration →](./opencode-migration.md)
- **Ähnlichkeiten und Unterschiede** zwischen OpenCode und UltraCode
- **Migration der Konfiguration** (`.opencode/` → `~/.ultracode/`)
- **Agenten-Mapping** (OpenCode-Agenten → UltraCode-Agenten)
- **Tools-Mapping** (OpenCode-Tools → UltraCode-Tools)
- **Skript für automatische Migration**

**Ziel:** Nahtlose Migration von OpenCode zu UltraCode

---

### [Mistral Vibe Migration →](./vibe-migration.md)
- **Ähnlichkeiten und Unterschiede** zwischen Vibe und UltraCode
- **Konfiguration** (`~/.vibe/config.toml` → `~/.ultracode/config.toml`)
- **Skills-System** (Vibe-Skills → UltraCode-Skills/Plug-ins)
- **MCP-Server Migration**
- **Python → TypeScript Portierungshinweise**

**Ziel:** Nahtlose Migration von Mistral Vibe zu UltraCode

---

### [Claude Code Migration →](./claude-migration.md)
- **Ähnlichkeiten und Unterschiede** zwischen Claude Code und UltraCode
- **Bun → Node.js Migration** (Runtime-Wechsel)
- **Terminologie-Mapping** (Claude → UltraCode)
- **Tools-Mapping** (Claude-Tools → UltraCode-Tools)
- **Anthropic API → Multi-Model Migration**

**Ziel:** Nahtlose Migration von Claude Code zu UltraCode

---

### [Plug-in Entwicklung →](./plugin-development.md)
- **Plug-in-Architektur** von UltraCode
- **Plug-in-Interface** und Basis-Klassen
- **Tools registrieren** in Plug-ins
- **Agenten registrieren** in Plug-ins
- **Beispiel-Plug-in**
- **Plug-in-Veröffentlichung**

**Ziel:** Eigene Plug-ins für UltraCode erstellen

---

## 🚀 Schnellstart: Migration

### Für OpenCode-Nutzer

```bash
# 1. UltraCode installieren
npm install -g ultracode

# 2. Migration-Skript ausführen
ultracode --migrate-from opencode

# 3. Konfiguration prüfen
ultracode --config validate

# 4. Loslegen!
ultracode
```

---

### Für Mistral Vibe-Nutzer

```bash
# 1. UltraCode installieren
npm install -g ultracode

# 2. Migration-Skript ausführen
ultracode --migrate-from vibe

# 3. API-Keys migrieren
cp ~/.vibe/.env ~/.ultracode/.env

# 4. Skills migrieren
ultracode --migrate-skills ~/.vibe/skills/

# 5. Loslegen!
ultracode
```

---

### Für Claude Code-Nutzer

```bash
# 1. UltraCode installieren
npm install -g ultracode

# 2. API-Keys konfigurieren
export ANTHROPIC_API_KEY=sk-...
export MISTRAL_API_KEY=sk-...

# 3. Migration-Skript ausführen
ultracode --migrate-from claude

# 4. Loslegen!
ultracode
```

---

## 📊 Vergleich der Systeme

### Feature-Vergleich

| **Feature** | **OpenCode** | **Mistral Vibe** | **Claude Code** | **UltraCode** |
|-------------|--------------|------------------|-----------------|---------------|
| **Sprache** | TypeScript | Python | TypeScript | TypeScript (+ Python) |
| **Runtime** | Node.js | Python | Bun | Node.js (+ Bun) |
| **UI** | React + Terminal | React + Rich | React + Ink | React + Ink |
| **Agenten** | ✅ | ✅ (begrenzt) | ✅ | ✅++ (erweitert) |
| **Tools** | ~30 | ~25 | ~40 | **80+** |
| **MCP** | ❌ | ✅ | ✅ | ✅ |
| **LSP** | ❌ | ❌ | ✅ | ✅ |
| **IDE-Integration** | ✅ | ❌ | ✅ | ✅++ |
| **AI-Versionierung** | ❌ | ❌ | ❌ | ✅ **UNIQUE** |
| **Multi-Model** | ✅ | ✅ | ❌ (nur Anthropic) | ✅ |

---

## 🔄 Automatisierte Migration

UltraCode bietet **automatisierte Migrationstools** für alle drei Systeme:

```bash
# OpenCode Migration
ultracode --migrate-from opencode --dry-run
ultracode --migrate-from opencode

# Mistral Vibe Migration
ultracode --migrate-from vibe --dry-run
ultracode --migrate-from vibe

# Claude Code Migration
ultracode --migrate-from claude --dry-run
ultracode --migrate-from claude
```

**Optionen:**
- `--dry-run`: Simuliert Migration ohne Änderungen
- `--backup`: Erstellt Backup der ursprünglichen Konfiguration
- `--verbose`: Zeigt detaillierte Logs

---

## 🤝 Kompatibilitätsmodus

Für leichtere Migration bietet UltraCode **Kompatibilitätsmodi**:

### OpenCode-Modus

```bash
ultracode --compat opencode
```

**Features:**
- OpenCode-Konfiguration wird automatisch konvertiert
- OpenCode-Keybindings werden unterstützt
- OpenCode-Tools haben Aliases

### Vibe-Modus

```bash
ultracode --compat vibe
```

**Features:**
- Vibe-Konfiguration wird unterstützt
- Vibe-Skills können direkt verwendet werden
- Python-Tools haben Aliases

### Claude-Modus

```bash
ultracode --compat claude
```

**Features:**
- Claude-Tools haben Aliases
- Claude-Konfiguration wird konvertiert
- Bun-spezifische Features werden emuliert

---

## 💡 Tipps für die Migration

### 1. Backup erstellen

```bash
# OpenCode
cp -r ~/.opencode ~/.opencode-backup

# Mistral Vibe
cp -r ~/.vibe ~/.vibe-backup

# Claude Code (falls lokal installiert)
cp -r ~/.claude ~/.claude-backup
```

---

### 2. Schrittweise Migration

1. **Konfiguration** zuerst migrieren
2. **API-Keys** testen
3. **Agenten/Tools** nacheinander testen
4. **Skripte/Workflows** anpassen

---

### 3. Parallel betreiben

Du kannst **OpenCode/Vibe/Claude und UltraCode parallel** betreiben:

```bash
# OpenCode
opencode

# UltraCode
ultracode
```

---

### 4. Unterschiede dokumentieren

Führe ein **Migrations-Log**, um Unterschiede zu dokumentieren:

```markdown
# Migration von OpenCode zu UltraCode

## Datum: 2026-06-11

### Konvertierte Konfiguration
- [x] Agenten
- [x] Tools
- [x] Keybindings
- [ ] Skills (manuell)

### Bekannte Unterschiede
1. Tool `xyz` verhält sich anders
2. Agent `abc` hat andere Standardwerte

### Offene Aufgaben
- [ ] Plug-ins anpassen
- [ ] Workflows testen
```

---

## 📞 Support bei Migration

- **Discord:** [#migration Channel](https://discord.gg/ultracode)
- **GitHub Issues:** [Migration Label](https://github.com/ultracode-ai/ultracode/labels/migration)
- **E-Mail:** migration@ultracode.ai

---

## 🎯 Nächste Schritte

1. **Wähle dein Herkunftssystem:**
   - [OpenCode Migration →](./opencode-migration.md)
   - [Mistral Vibe Migration →](./vibe-migration.md)
   - [Claude Code Migration →](./claude-migration.md)

2. **Führe Migration durch** mit den automatisierten Tools

3. **Teste gründlich** und dokumentiere Unterschiede

4. **Erstelle eigene Plug-ins:**
   - [Plug-in Entwicklung →](./plugin-development.md)
