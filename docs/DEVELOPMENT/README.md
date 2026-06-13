# UltraCode Entwicklung

> **Dokumentation für Entwickler, Contributors und System-Architekten**

---

## 🛠️ In diesem Abschnitt

Dieser Abschnitt enthält **technische Dokumentation** für die Entwicklung und Erweiterung von UltraCode.

```
DEVELOPMENT/
├── 🏗️  architecture.md          # Systemarchitektur und Design
├── 🔧 core-system.md           # Kernsystem-Implementierung
├── 🤖 ai-versioning.md         # AI-Versionierungssystem
├── 📋 tools-reference.md       # Alle 14 Tools im Detail
└── 🎭 agents-reference.md      # Agenten-System und -Typen
```

---

## 🎯 Für wen ist dieser Abschnitt?

| **Rolle** | **Relevante Dokumente** | **Zweck** |
|-----------|------------------------|-----------|
| **System-Architekt** | architecture.md, core-system.md | Architektur verstehen und gestalten |
| **Core-Entwickler** | core-system.md, tools-reference.md | Kernfunktionen implementieren |
| **AI-Entwickler** | ai-versioning.md | AI-Versionierungssystem erweitern |
| **Plug-in-Entwickler** | tools-reference.md, agents-reference.md | Eigene Tools/Agenten erstellen |
| **Contributor** | Alle Dokumente | Zum Projekt beitragen |

---

## 🏗️ Architektur-Übersicht

UltraCode folgt einem **modularen Mikroarchitektur-Ansatz** mit klaren Verantwortlichkeiten:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ULTRACODE ARCHITEKTUR                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         APPLICATION LAYER                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │ │
│  │  │   CLI App    │  │  Desktop App  │  │  IDE Plugins  │                   │ │
│  │  │ (React+Ink)  │  │  (Electron)   │  │ (LSP/MCP)     │                   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         CORE LAYER (TypeScript)                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │ │
│  │  │  AGENT      │  │  TOOL        │  │  MEMORY       │                   │ │
│  │  │  MANAGER    │◄─┤  REGISTRY   │  │  MANAGER      │                   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │ │
│  │                                                                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │ │
│  │  │  CONTEXT    │  │  EXECUTION   │  │  VERSIONING   │                   │ │
│  │  │  ENGINE     │  │  ENGINE      │  │  AI SYSTEM    │                   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         INTEGRATION LAYER                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │ │
│  │  │  LLM         │  │  MCP         │  │  LSP         │                   │ │
│  │  │  PROVIDERS  │  │  SERVERS     │  │  BRIDGE      │                   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📚 Entwicklungsdokumente

### [🏗️ Architektur →](./architecture.md)

**Enthält:**
- 📐 **Systemdesign-Prinzipien** (SOLID, Clean Architecture, DDD)
- 🏛️ **Komponentendiagramme** (Alle Layer und Module)
- 🔄 **Datenfluss** (Wie Daten durch das System fließen)
- 🗂️ **Verzeichnisstruktur** (Monorepo-Aufbau)
- 🔗 **Abhängigkeiten** (Interne und externe)
- 🎯 **Design-Entscheidungen** (Warum bestimmte Technologien gewählt wurden)

**Zielgruppe:** System-Architekten, Tech Leads

---

### [🔧 Core-System →](./core-system.md)

**Enthält:**
- 🧠 **Agent Manager** (Agenten-Lebenszyklus, Wechsel, Delegation)
- 🛠️ **Tool System** (Tool-Registry, Execution Engine, Permissions)
- 💾 **Memory Manager** (Sessions, Kontext, Persistenz)
- 🎯 **Context Engine** (Intelligente Kontexterstellung)
- ⚡ **Execution Pipeline** (Wie Befehle verarbeitet werden)

**Zielgruppe:** Core-Entwickler, Contributors

---

### [🤖 AI-Versionierungssystem →](./ai-versioning.md)

**Enthält:**
- 📊 **Change Analysis Engine** (Diff-Analyse, Breaking Changes, Security Scan)
- 🔢 **Version Recommender** (SemVer + AI, Auto-Bump, Channels)
- 📅 **Release Planning Engine** (Timelines, Milestones, Risk Assessment)
- ✅ **Quality Gate System** (Code Review, Tests, Security, Performance)
- 🔄 **Automated Workflows** (CI/CD, Publishing, Notifications)
- 📈 **Dashboard & Analytics** (Metrics, Visualisierung)

**Zielgruppe:** AI-Entwickler, DevOps-Ingenieure

---

### [📋 Tools-Referenz →](./tools-reference.md)

**Enthält:**
- 📚 **Alle 14 Tools** mit detaillierter Beschreibung
- 🔧 **Tool-Signaturen** (Parameter, Rückgabewerte)
- 🎯 **Verwendungsbeispiele** für jedes Tool
- 🔒 **Berechtigungssystem** (ask, always, never)
- 📊 **Performance-Optimierungen** (Caching, Parallelisierung)

**Zielgruppe:** Plug-in-Entwickler, Power-User

---

### [🎭 Agenten-Referenz →](./agents-reference.md)

**Enthält:**
- 🤖 **Vordefinierte Agenten** (build, plan, review, release, security)
- 🎭 **Agent-Typen** (Default, Subagent, Specialized)
- ⚙️ **Agent-Konfiguration** (Model, Prompt, Tools, Permissions)
- 🔄 **Agent-Lebenszyklus** (Initialisierung, Ausführung, Cleanup)
- 📦 **Benutzerdefinierte Agenten** (Wie man eigene Agenten erstellt)

**Zielgruppe:** Agent-Entwickler, System-Integratoren

---

## 🚀 Entwicklungs-Setup

### Voraussetzungen

| **Tool** | **Version** | **Zweck** |
|----------|-------------|-----------|
| Node.js | 20.0+ | JavaScript Runtime |
| pnpm | 8.0+ | Package Manager (Monorepo) |
| Git | 2.30+ | Versionskontrolle |
| Docker | 24.0+ | Container (optional) |
| Bun | 1.3+ | Alternative Runtime (optional) |
| Python | 3.12+ | Python-Integration (optional) |

---

### Projekt klonen und einrichten

```bash
# Repository klonen
git clone https://github.com/AndreasSchwan-SIMO/UltraCode.git
cd ultracode

# Abhängigkeiten installieren
pnpm install

# Entwicklungsumgebung initialisieren
pnpm run dev:setup

# Projekt bauen
pnpm run build

# Tests ausführen
pnpm run test

# Linting
pnpm run lint
```

---

### Entwicklungs-Workflows

#### Core-System entwickeln

```bash
# Core-Paket bauen
cd packages/core
pnpm run build --watch

# Tests für Core
pnpm run test:core

# Linting für Core
pnpm run lint:core
```

#### CLI entwickeln

```bash
# CLI-Paket bauen
cd packages/cli
pnpm run build --watch

# CLI starten (Development)
pnpm run dev
```

#### Neue Tools hinzufügen

```bash
# Tool-Scaffold generieren
pnpm run generate:tool mein-neues-tool

# Tool-Tests
pnpm run test:tools
```

#### Neue Agenten hinzufügen

```bash
# Agent-Scaffold generieren
pnpm run generate:agent mein-neuer-agent

# Agent-Tests
pnpm run test:agents
```

---

## 📦 Monorepo-Struktur

```
ultracode/
├── packages/                          # Monorepo-Pakete
│   ├── core/                          # Kernsystem (TypeScript)
│   │   ├── src/
│   │   │   ├── agents/                # Agenten-Implementierungen
│   │   │   ├── tools/                 # Tool-Implementierungen
│   │   │   ├── memory/                # Memory-Management
│   │   │   ├── context/               # Kontext-Engine
│   │   │   ├── versioning/            # AI-Versionierung
│   │   │   ├── execution/             # Ausführungs-Engine
│   │   │   └── config/                # Konfiguration
│   │   └── tests/                     # Unit-Tests
│   │
│   ├── cli/                           # CLI (React + Ink)
│   │   ├── src/
│   │   │   ├── components/            # UI-Komponenten
│   │   │   ├── commands/              # CLI-Kommandos
│   │   │   ├── hooks/                 # React Hooks
│   │   │   └── themes/                # Design-Themes
│   │   └── tests/
│   │
│   ├── desktop/                       # Desktop App (Electron)
│   │   ├── main/                      # Hauptprozess
│   │   ├── renderer/                  # Renderer-Prozess
│   │   └── preload/                   # Preload-Skripte
│   │
│   ├── ide/                           # IDE-Integration
│   │   ├── vscode/                    # VS Code Extension
│   │   ├── jetbrains/                 # JetBrains Plugin
│   │   └── neovim/                    # Neovim Integration
│   │
│   ├── python/                        # Python-Integration
│   │   └── vibe/                      # Mistral Vibe Portierung
│   │
│   └── shared/                        # Gemeinsame Typen & Utilities
│
├── docs/                              # Dokumentation
├── scripts/                           # Build- und Entwicklungs-Skripte
├── tests/                             # Integration-Tests
└── examples/                          # Beispielprojekte
```

---

## 🔧 Entwicklungs-Standards

### Code-Stil

- **TypeScript**: Strict Mode, ESLint, Prettier
- **Namenkonvention**: camelCase für Variablen/Funktionen, PascalCase für Klassen/Typen
- **Kommentare**: JSDoc für öffentliche APIs, Inline-Kommentare für komplexe Logik
- **Tests**: Vitest, 100% Abdeckung für Core-Funktionen

### Commit-Konvention

Wir verwenden **Conventional Commits**:

```
feat: neue Funktion hinzufügen
fix: Bug beheben
chore: Build-Prozess oder Abhängigkeiten
refactor: Code ohne Funktionsänderung umschreiben
docs: Dokumentation aktualisieren
test: Tests hinzufügen oder aktualisieren
perf: Performance-Verbesserungen
```

### Pull Request Richtlinien

1. **Beschreibung**: Klare Beschreibung der Änderungen
2. **Tests**: Alle Tests müssen passieren
3. **Code Review**: Mindestens 2 Approvals nötig
4. **Dokumentation**: Aktualisiere relevante Docs
5. **Changelog**: Füge Einträge für Benutzer-sichtbare Änderungen hinzu

---

## 🛠️ Entwickler-Tools

### Skripte

| **Skript** | **Beschreibung** |
|------------|------------------|
| `pnpm run build` | Alle Pakete bauen |
| `pnpm run dev` | Entwicklungsserver starten |
| `pnpm run test` | Alle Tests ausführen |
| `pnpm run lint` | Linting für alle Pakete |
| `pnpm run typecheck` | TypeScript-Typprüfung |
| `pnpm run generate:docs` | API-Dokumentation generieren |
| `pnpm run clean` | Build-Artefakte bereinigen |

### Debugging

```bash
# Debug-Modus aktivieren
ULTRACODE_DEBUG=true ultracode

# Mit Inspektor (Node.js)
npm run dev --inspect

# Log-Dateien
# Standard: ~/.ultracode/logs/
```

### Performance-Analyse

```bash
# Profiling aktivieren
ULTRACODE_PROFILING=true ultracode

# Speicheranalyse
node --max-old-space-size=8192 packages/cli/dist/index.js
```

---

## 🤝 Contributing

### Erste Schritte

1. **Issue finden**: [GitHub Issues](https://github.com/AndreasSchwan-SIMO/UltraCode/issues)
2. **Forken**: Repository forkern
3. **Branch erstellen**: `git checkout -b feat/mein-feature`
4. **Änderungen commiten**: Conventional Commits verwenden
5. **Pull Request**: Änderungen einreichen

### Good First Issues

Suche nach Issues mit diesen Labels:
- `good first issue` – Einfache Aufgaben für Neueinsteiger
- `help wanted` – Aufgaben, die Hilfe benötigen
- `documentation` – Dokumentationsverbesserungen
- `enhancement` – Feature-Verbesserungen

### Mentoring

- **Discord**: [#development Channel](https://discord.gg/ultracode)
- **Office Hours**: Wöchentliches Q&A (siehe Discord)
- **Code Reviews**: Konstruktives Feedback von Core-Maintainern

---

## 📚 Wichtige Links

- **Main Repository**: [https://github.com/AndreasSchwan-SIMO/UltraCode](https://github.com/AndreasSchwan-SIMO/UltraCode)
- **Issues**: [https://github.com/AndreasSchwan-SIMO/UltraCode/issues](https://github.com/AndreasSchwan-SIMO/UltraCode/issues)
- **Discussions**: [https://github.com/AndreasSchwan-SIMO/UltraCode/discussions](https://github.com/AndreasSchwan-SIMO/UltraCode/discussions)
- **Discord**: [https://discord.gg/ultracode](https://discord.gg/ultracode)
- **Website**: [https://ultracode.ai](https://ultracode.ai)

---

## 🎯 Nächste Schritte

Nach dem Lesen der Entwicklungsdokumentation:

1. **[Architektur →](./architecture.md)** – Systemdesign verstehen
2. **[Core-System →](./core-system.md)** – Kernfunktionen vertiefen
3. **[AI-Versionierung →](./ai-versioning.md)** – Einzigartige Features implementieren
4. **Code beitragen** – Eigene Pull Requests erstellen
