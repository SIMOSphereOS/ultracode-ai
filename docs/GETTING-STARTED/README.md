# Getting Started – UltraCode AI

> **Dein erster Schritt mit dem mächtigsten AI Code Assistenten**

---

## 📚 In diesem Abschnitt

Dieser Abschnitt enthält alles, was du brauchst, um **UltraCode AI schnell und einfach** in deinem Projekt einzusetzen.

```
GETTING-STARTED/
├── 📥 installation.md    # Installationsanleitung (Deutsch)
├── 📥 installation.en.md # Installation guide (English)
├── ⚡ quick-start.md     # 5-Minuten-Tutorial für erste Schritte
└── ⚙️  configuration.md   # Detaillierte Konfigurationsanleitung
```

---

## 🎯 Empfohlener Pfad

| **Schritt** | **Dokument** | **Dauer** | **Ziel** |
|-------------|--------------|-----------|----------|
| 1 | [Installation →](./installation.md) ([EN](./installation.en.md)) | 2-5 Min | UltraCode AI auf deinem System installieren |
| 2 | [Quick Start →](./quick-start.md) | 5 Min | Erste Befehle ausprobieren |
| 3 | [Konfiguration →](./configuration.md) | 10 Min | UltraCode AI an deine Bedürfnisse anpassen |

---

## 🚀 Schnellstart (TL;DR)

```bash
# 1. Installieren (empfohlen: npm)
npm install -g ultracode-ai

# 2. In deinem Projekt-Ordner navigieren
cd /pfad/zu/deinem/projekt

# 3. UltraCode AI starten
ultracode-ai

# 4. Erster Befehl
> "Analysiere die Projektstruktur und schlage Verbesserungen vor"
```

---

## 💡 Tipps für den Einstieg

### Für **OpenCode-Nutzer**
- UltraCode AI übernimmt alle OpenCode-Agenten (`build`, `plan`)
- Die CLI ist ähnlich, aber mit mehr Features
- Siehe [OpenCode Migration →](../INTEGRATION/opencode-migration.md)

### Für **Mistral Vibe-Nutzer**
- Die Python-CLI wurde auf TypeScript portiert
- Alle Skills und Tools sind kompatibel
- Siehe [Vibe Migration →](../INTEGRATION/vibe-migration.md)

### Für **Claude Code-Nutzer**
- Ähnliche Terminal-UI (React + Ink)
- Alle Tools und Commands sind verfügbar
- Multi-Model-Unterstützung (nicht nur Anthropic)
- Siehe [Claude Migration →](../INTEGRATION/claude-migration.md)

---

## 📖 Inhaltsübersicht

### [Installation →](./installation.md) · [English →](./installation.en.md)
- **Plattformunterstützung**: Windows, macOS, Linux (Node 22/24)
- **Installationsmethoden**: npm (`npm i -g ultracode-ai`) oder aus dem Quellcode (pnpm)
- **Voraussetzungen**: Node.js ≥ 22.13, Git (für AI-Versioning)
- **Verifizierung**: `ultracode-ai doctor`

### [Quick Start →](./quick-start.md)
- **Erste Schritte**: UltraCode AI starten
- **Grundlegende Befehle**: Navigation und Interaktion
- **Beispiel-Workflows**: Typische Anwendungsfälle
- **Tipps & Tricks**: Effizienter arbeiten

### [Konfiguration →](./configuration.md)
- **Konfigurationsdatei**: `~/.ultracode/config.toml`
- **API-Keys**: Mehrere LLM-Anbieter einrichten
- **Agenten**: Vordefinierte und benutzerdefinierte Agenten
- **Tools**: Tool-Berechtigungen und -Einstellungen
- **Themes**: UI-Anpassung

---

## 🔧 Problembehandlung

| **Problem** | **Lösung** | **Dokument** |
|-------------|------------|--------------|
| Installation fehlgeschlagen | Plattformspezifische Anleitung | [installation.md](./installation.md) |
| API-Key nicht erkannt | Environment-Variablen prüfen | [configuration.md](./configuration.md) |
| Tool nicht gefunden | Tool-Berechtigungen prüfen | [configuration.md](./configuration.md) |
| UI-Probleme | Terminal-Kompatibilität prüfen | [installation.md](./installation.md) |


---

## 📞 Hilfe erhalten

- **Discord**: [https://discord.gg/ultracode](https://discord.gg/ultracode) (Echtzeit-Hilfe)
- **GitLab Issues**: [https://gitlab.simo-online.com/simo/ultracode-ai/-/issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues)
- **E-Mail**: support@ultracode.ai

---

## 🔗 Nächste Schritte

Nach dem Durcharbeiten dieses Abschnitts:
- [Entwicklungsdokumentation →](../DEVELOPMENT/README.md) – Für Contributors
- [AI-Features →](../AI-FEATURES/README.md) – Für Power-User
- [Referenz →](../REFERENCE/README.md) – Für detaillierte Informationen
