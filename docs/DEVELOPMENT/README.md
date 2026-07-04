# UltraCode AI Entwicklung

> **Dokumentation für Entwickler, Contributors und System-Architekten**

---

## 🛠️ In diesem Abschnitt

Dieser Abschnitt enthält **technische Dokumentation** für die Entwicklung und Erweiterung von UltraCode AI.

```
DEVELOPMENT/
├── 🏗️  architecture.md          # Systemarchitektur und Design
├── 🔧 core-system.md           # Kernsystem-Implementierung
├── 🤖 ai-versioning.md         # AI-Versionierungssystem
├── 📋 tools-reference.md       # Alle 14 Tools im Detail
├── 🎭 agents-reference.md      # Agenten-System und -Typen
└── 📐 standards.md             # Entwicklungsstandards (Skills, Agenten, Quality Gates)
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

UltraCode AI folgt einem **modularen Mikroarchitektur-Ansatz** mit klaren Verantwortlichkeiten:

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

### [📐 Entwicklungsstandards / Development Standards →](./standards.md)

**DE — Enthält:**
- 🧭 **Die 5 Standards** als Projekt-Skills (`clean-code`, `release-management`, `test-management`, `dev-workflow`, `documentation-management`)
- 🤝 **Die 5 Repo-Entwicklungs-Agenten** (`.ultracode/agents/` — nicht zu verwechseln mit den Produkt-Agenten in [agents-reference.md](./agents-reference.md))
- ✅ **Quality Gates** (`pnpm ci:local`, `pnpm release:check`, GitLab-CI-Jobs)
- 📐 **Entscheidungen**: [docs/decisions/](../decisions/README.md) — Architecture Decision Records
- 🧠 **Erkenntnisse**: [docs/lessons-learned/](../lessons-learned/README.md) — Fehler nur einmal

**EN — Contains:**
- 🧭 **The 5 standards** as project skills (`clean-code`, `release-management`, `test-management`, `dev-workflow`, `documentation-management`)
- 🤝 **The 5 repo development agents** (`.ultracode/agents/` — not to be confused with the product agents in [agents-reference.md](./agents-reference.md))
- ✅ **Quality gates** (`pnpm ci:local`, `pnpm release:check`, GitLab CI jobs)
- 📐 **Decisions**: [docs/decisions/](../decisions/README.md) — Architecture Decision Records
- 🧠 **Lessons learned**: [docs/lessons-learned/](../lessons-learned/README.md) — mistakes only once

**Zielgruppe / Audience:** Alle Contributors und Coding-Agenten / all contributors and coding agents

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
git clone https://gitlab.simo-online.com/simo/ultracode-ai.git
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
ULTRACODE_DEBUG=true ultracode-ai

# Mit Inspektor (Node.js)
npm run dev --inspect

# Log-Dateien
# Standard: ~/.ultracode/logs/
```

### Performance-Analyse

```bash
# Profiling aktivieren
ULTRACODE_PROFILING=true ultracode-ai

# Speicheranalyse
node --max-old-space-size=8192 packages/cli/dist/index.js
```

---

## 🤝 Contributing

### Erste Schritte

1. **Issue finden**: [GitLab Issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues)
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

## 🧾 SBOM / Supply-Chain

UltraCode AI pflegt ein **Abhängigkeits- und Lizenz-Inventar** der Produktions-Abhängigkeiten (SBOM — Software Bill of Materials) unter **[`../SBOM.md`](../SBOM.md)**. Es dient der Lieferketten-Transparenz und dem Lizenz-Compliance-Nachweis (alle Produktionslizenzen permissiv und AGPL-kompatibel).

### Menschenlesbares Inventar aktualisieren

`docs/SBOM.md` wird **deterministisch** aus dem Lockfile generiert — nicht von Hand bearbeiten:

```bash
pnpm install            # Lockfile-Stand herstellen / materialize lockfile state
node scripts/gen-sbom.mjs
```

Der Generator liest `pnpm licenses list --prod --json` (nur Produktion, entspricht `--omit dev`), sortiert stabil und schreibt ohne Zeitstempel — zwei Läufe erzeugen byte-gleiche Ausgabe. Nach jedem Abhängigkeits-Update (`package.json`/`pnpm-lock.yaml`) neu erzeugen und mitcommiten.

### Maschinenlesbare CycloneDX-SBOM (CI)

Für Tooling (Scanner, VEX, Vulnerability-Feeds) sollte zusätzlich eine maschinenlesbare **CycloneDX-SBOM (`sbom.json`)** im CI erzeugt werden. In diesem **pnpm-Workspace** ist der pnpm-fähige Generator zu verwenden:

```bash
# Empfohlen: pnpm-fähiger, universeller Generator (liest pnpm-lock.yaml)
npx -y @cyclonedx/cdxgen@latest -t pnpm -o sbom.json --spec-version 1.6 --no-recurse
```

> **Hinweis / Note:** `@cyclonedx/cyclonedx-npm` benötigt eine `package-lock.json` und liefert in einem reinen pnpm-Workspace eine **leere** Komponentenliste; ein Paket `@cyclonedx/cyclonedx-pnpm` existiert in der npm-Registry **nicht**. Deshalb `cdxgen -t pnpm`. `cdxgen` erfasst den **gesamten** Lockfile-Baum (inkl. Dev-Abhängigkeiten); für ein reines Produktions-SBOM ist das menschenlesbare `docs/SBOM.md` maßgeblich.

### Secret-Hygiene

Eine SBOM darf **ausschließlich** Paketnamen, Versionen und Lizenzen enthalten — **niemals** Secrets, Tokens, API-Keys oder lokale Pfade. `docs/SBOM.md` enthält per Konstruktion nur diese drei Felder. Ein generiertes `sbom.json` vor dem Commit prüfen (keine `*_API_KEY`-Werte, keine absoluten Home-Pfade); es ist bereits über `.gitignore`/CI-Artefakt-Handling von versehentlichem Einchecken auszuschließen, sofern nicht bewusst als Release-Artefakt versioniert.

---

## 📚 Wichtige Links

- **Main Repository**: [https://gitlab.simo-online.com/simo/ultracode-ai](https://gitlab.simo-online.com/simo/ultracode-ai)
- **Issues**: [https://gitlab.simo-online.com/simo/ultracode-ai/-/issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues)
- **Discussions**: [https://gitlab.simo-online.com/simo/ultracode-ai/-/issues](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues)
- **Discord**: [https://discord.gg/ultracode](https://discord.gg/ultracode)
- **Website**: [https://ultracode.ai](https://ultracode.ai)

---

## 🎯 Nächste Schritte

Nach dem Lesen der Entwicklungsdokumentation:

1. **[Architektur →](./architecture.md)** – Systemdesign verstehen
2. **[Core-System →](./core-system.md)** – Kernfunktionen vertiefen
3. **[AI-Versionierung →](./ai-versioning.md)** – Einzigartige Features implementieren
4. **Code beitragen** – Eigene Pull Requests erstellen
