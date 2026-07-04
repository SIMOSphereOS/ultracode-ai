# UltraCode AI Integration

> **Anleitungen für Migration und Integration**

---

## 📚 In diesem Abschnitt

Dieser Abschnitt enthält **detaillierte Anleitungen** für die Integration und Migration von bestehenden Systemen zu UltraCode AI.

```
INTEGRATION/
├── 🔄 opencode-migration.md     # Migration von OpenCode
├── 🔄 vibe-migration.md         # Migration von Mistral Vibe
├── 🔄 assistant-migration.md    # Migration von anderen AI-Coding-Assistenten
└── 🧩 plugin-development.md     # Eigene Plug-ins entwickeln
```

---

## 🎯 Für wen ist dieser Abschnitt?

| **Herkunft** | **Relevante Dokumente** | **Zweck** |
|--------------|------------------------|-----------|
| **OpenCode-Nutzer** | opencode-migration.md | Migration zu UltraCode AI |
| **Mistral Vibe-Nutzer** | vibe-migration.md | Migration zu UltraCode AI |
| **Nutzer anderer AI-Coding-Assistenten** | assistant-migration.md | Migration zu UltraCode AI |
| **Entwickler** | plugin-development.md | Eigene Plug-ins erstellen |

---

## 📖 Dokumentationsübersicht

### [OpenCode Migration →](./opencode-migration.md)
- **Ähnlichkeiten und Unterschiede** zwischen OpenCode und UltraCode AI
- **Migration der Konfiguration** (`.opencode/` → `~/.ultracode/`)
- **Agenten-Mapping** (OpenCode-Agenten → UltraCode AI-Agenten)
- **Tools-Mapping** (OpenCode-Tools → UltraCode AI-Tools)
- **Skript für automatische Migration**

**Ziel:** Nahtlose Migration von OpenCode zu UltraCode AI

---

### [Mistral Vibe Migration →](./vibe-migration.md)
- **Ähnlichkeiten und Unterschiede** zwischen Vibe und UltraCode AI
- **Konfiguration** (`~/.vibe/config.toml` → `~/.ultracode/config.toml`)
- **Skills-System** (Vibe-Skills → UltraCode AI-Skills/Plug-ins)
- **MCP-Server Migration**
- **Python → TypeScript Portierungshinweise**

**Ziel:** Nahtlose Migration von Mistral Vibe zu UltraCode AI

---

### [AI-Coding-Assistent Migration →](./assistant-migration.md)
- **Gemeinsame Konzepte** zwischen typischen CLI-Assistenten und UltraCode AI
- **Bun → Node.js Migration** (Runtime-Wechsel)
- **Konzept-Mapping** (bisheriger Assistent → UltraCode AI)
- **Tools-Mapping** (gewohnte Tools → UltraCode AI-Tools)
- **Single-Provider → Multi-Model Migration**

**Ziel:** Nahtlose Migration von anderen AI-Coding-Assistenten zu UltraCode AI

---

### [Plug-in Entwicklung →](./plugin-development.md)
- **Plug-in-Architektur** von UltraCode AI
- **Plug-in-Interface** und Basis-Klassen
- **Tools registrieren** in Plug-ins
- **Agenten registrieren** in Plug-ins
- **Beispiel-Plug-in**
- **Plug-in-Veröffentlichung**

**Ziel:** Eigene Plug-ins für UltraCode AI erstellen

---

## 🚀 Schnellstart: Migration

### Für OpenCode-Nutzer

```bash
# 1. UltraCode AI installieren
npm install -g ultracode-ai

# 2. Migration-Skript ausführen
ultracode-ai --migrate-from opencode

# 3. Konfiguration prüfen
ultracode-ai --config validate

# 4. Loslegen!
ultracode-ai
```

---

### Für Mistral Vibe-Nutzer

```bash
# 1. UltraCode AI installieren
npm install -g ultracode-ai

# 2. Migration-Skript ausführen
ultracode-ai --migrate-from vibe

# 3. API-Keys migrieren
cp ~/.vibe/.env ~/.ultracode/.env

# 4. Skills migrieren
ultracode-ai --migrate-skills ~/.vibe/skills/

# 5. Loslegen!
ultracode-ai
```

---

### Für Nutzer anderer AI-Coding-Assistenten

```bash
# 1. UltraCode AI installieren
npm install -g ultracode-ai

# 2. API-Keys konfigurieren
export ANTHROPIC_API_KEY=sk-...
export MISTRAL_API_KEY=sk-...

# 3. Konfiguration manuell portieren (siehe Anleitung)
ultracode-ai --setup

# 4. Loslegen!
ultracode-ai
```

---

## 📊 Vergleich der Systeme

### Feature-Vergleich

| **Feature** | **OpenCode** | **Mistral Vibe** | **UltraCode AI** |
|-------------|--------------|------------------|---------------|
| **Sprache** | TypeScript | Python | TypeScript |
| **Runtime** | Node.js | Python | Node.js |
| **UI** | React + Terminal | React + Rich | React + Ink |
| **Agenten** | ✅ | ✅ | 6 eingebaut + projektlokale |
| **Tools** | ~30 | ~25 | 13 eingebaut + MCP |
| **MCP** | ❌ | ✅ | ✅ |
| **LSP** | ❌ | ❌ | ✅ minimal (Diagnostics) |
| **IDE-Integration** | ✅ | ❌ | ❌ (nicht geplant) |
| **AI-Versionierung** | ❌ | ❌ | ✅ **UNIQUE** |
| **Multi-Model** | ✅ | ✅ | ✅ (5 Provider inkl. LM Studio) |

---

## 🔄 Automatisierte Migration

UltraCode AI bietet **automatisierte Migrationstools** für OpenCode und Mistral Vibe; für andere Assistenten gibt es den [manuellen Migrations-Guide](./assistant-migration.md):

```bash
# OpenCode Migration
ultracode-ai --migrate-from opencode --dry-run
ultracode-ai --migrate-from opencode

# Mistral Vibe Migration
ultracode-ai --migrate-from vibe --dry-run
ultracode-ai --migrate-from vibe
```

**Optionen:**
- `--dry-run`: Simuliert Migration ohne Änderungen
- `--backup`: Erstellt Backup der ursprünglichen Konfiguration
- `--verbose`: Zeigt detaillierte Logs

---

## 🤝 Kompatibilitätsmodus

Für leichtere Migration bietet UltraCode AI **Kompatibilitätsmodi**:

### OpenCode-Modus

```bash
ultracode-ai --compat opencode
```

**Features:**
- OpenCode-Konfiguration wird automatisch konvertiert
- OpenCode-Keybindings werden unterstützt
- OpenCode-Tools haben Aliases

### Vibe-Modus

```bash
ultracode-ai --compat vibe
```

**Features:**
- Vibe-Konfiguration wird unterstützt
- Vibe-Skills können direkt verwendet werden
- Python-Tools haben Aliases

### Andere Assistenten

Für weitere AI-Coding-Assistenten gibt es keinen dedizierten Kompatibilitätsmodus — dank standardisierter Konzepte (MCP, LSP, Slash-Commands) gelingt die Migration mit dem [manuellen Guide](./assistant-migration.md) dennoch schnell.

---

## 💡 Tipps für die Migration

### 1. Backup erstellen

```bash
# OpenCode
cp -r ~/.opencode ~/.opencode-backup

# Mistral Vibe
cp -r ~/.vibe ~/.vibe-backup

# Anderer Assistent (Pfad anpassen)
cp -r ~/.mein-assistent ~/.mein-assistent-backup
```

---

### 2. Schrittweise Migration

1. **Konfiguration** zuerst migrieren
2. **API-Keys** testen
3. **Agenten/Tools** nacheinander testen
4. **Skripte/Workflows** anpassen

---

### 3. Parallel betreiben

Du kannst **deinen bisherigen Assistenten und UltraCode AI parallel** betreiben:

```bash
# OpenCode
opencode

# UltraCode AI
ultracode-ai
```

---

### 4. Unterschiede dokumentieren

Führe ein **Migrations-Log**, um Unterschiede zu dokumentieren:

```markdown
# Migration von OpenCode zu UltraCode AI

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
- **GitLab Issues:** [Migration Label](https://gitlab.simo-online.com/simo/ultracode-ai/-/labels/migration)
- **E-Mail:** migration@ultracode.ai

---

## 🎯 Nächste Schritte

1. **Wähle dein Herkunftssystem:**
   - [OpenCode Migration →](./opencode-migration.md)
   - [Mistral Vibe Migration →](./vibe-migration.md)
   - [AI-Coding-Assistent Migration →](./assistant-migration.md)

2. **Führe Migration durch** mit den automatisierten Tools bzw. dem manuellen Guide

3. **Teste gründlich** und dokumentiere Unterschiede

4. **Erstelle eigene Plug-ins:**
   - [Plug-in Entwicklung →](./plugin-development.md)
