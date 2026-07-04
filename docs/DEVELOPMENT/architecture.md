# UltraCode AI Architektur

> **Technische Architektur-Dokumentation – Systemdesign und Komponenten**

---

## 📐 Architektur-Übersicht

UltraCode AI folgt einem **modularen, layer-basierten Architekturansatz** mit klaren Verantwortlichkeiten und striktem **Separation of Concerns**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ULTRACODE ARCHITEKTUR                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    APPLICATION LAYER (User-Facing)                          │ │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐││
│  │  │      CLI             │  │     Desktop           │  │   IDE Plugins   │││
│  │  │   (Terminal UI)      │  │   (Electron)          │  │ (VS Code/JB/NV)│││
│  │  │  React + Ink        │  │   React + Electron    │  │  LSP + MCP     │││
│  │  └─────────────────────┘  └─────────────────────┘  └─────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    PRESENTATION LAYER (UI Logic)                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │  • Command Parser (Commander.js)                                       │││
│  │  │  • UI Renderer (React/Ink)                                             │││
│  │  │  • Theme Manager                                                        │││
│  │  │  • Input Handler (Autocompletion, History)                             │││
│  │  │  • Output Formatter (Markdown, Code Blocks)                            │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    CORE LAYER (Business Logic)                               │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │  🧠 AGENT MANAGER                                                      │││
│  │  │    • Agent Registry                                                   │││
│  │  │    • Agent Lifecycle Management                                       │││
│  │  │    • Agent Selection & Delegation                                     │││
│  │  │    • Subagent Coordination                                            │││
│  │  │                                                                       │││
│  │  │  🛠️  TOOL SYSTEM                                                     │││
│  │  │    • Tool Registry (13 Built-in-Tools + MCP)                           │││
│  │  │    • Tool Execution Engine                                            │││
│  │  │    • Permission System                                                │││
│  │  │    • Tool Validation & Sanitization                                   │││
│  │  │                                                                       │││
│  │  │  💾 MEMORY MANAGER                                                    │││
│  │  │    • Session Management                                               │││
│  │  │    • Context Storage (Short-term & Long-term)                        │││
│  │  │    • Conversation History                                             │││
│  │  │    • Project Metadata Cache                                           │││
│  │  │                                                                       │││
│  │  │  🎯 CONTEXT ENGINE                                                    │││
│  │  │    • Context Collection (Git, Files, Environment)                     │││
│  │  │    • Context Window Management                                        │││
│  │  │    • Context Compression                                              ││││
│  │  │    • Context Ranking & Prioritization                                 │││
│  │  │                                                                       │││
│  │  │  ⚡ EXECUTION ENGINE                                                   │││
│  │  │    • Query Pipeline                                                   │││
│  │  │    • LLM Communication                                                │││
│  │  │    • Tool Execution Queue                                              │││
│  │  │    • Parallel Execution Management                                     ││││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    AI VERSIONING LAYER (Unique Feature)                     │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │  📊 CHANGE ANALYSIS ENGINE                                             │││
│  │  │    • Diff Analysis (Semantic + Structural)                             │││
│  │  │    • Breaking Change Detection                                        │││
│  │  │    • API Compatibility Checking                                       │││
│  │  │    • Dependency Impact Analysis                                        │││
│  │  │    • Security Vulnerability Scanning                                  │││
│  │  │                                                                       │││
│  │  │  🔢 VERSION RECOMMENDER                                               │││
│  │  │    • Semantic Versioning (SemVer 2.0)                                │││
│  │  │    • AI-Powered Version Bump Suggestions                              │││
│  │  │    • Pre-release Versioning (alpha, beta, rc)                         │││
│  │  │    • Channel-Based Versioning (stable, lts, experimental)           │││
│  │  │                                                                       │││
│  │  │  📅 RELEASE PLANNING ENGINE                                          │││
│  │  │    • Release Timeline Generation                                      │││
│  │  │    • Milestone Creation & Tracking                                   │││
│  │  │    • Feature Prioritization                                           │││
│  │  │    • Risk Assessment & Mitigation                                     │││
│  │  │                                                                       │││
│  │  │  ✅ QUALITY GATE SYSTEM                                                │││
│  │  │    • AI-Powered Code Review                                           │││
│  │  │    • Test Coverage Analysis                                           │││
│  │  │    • Performance Benchmarking                                         │││
│  │  │    • Security Scanning (SAST/DAST)                                     │││
│  │  │    • Documentation Completeness Check                                │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    INTEGRATION LAYER (External Services)                    │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │  🔌 LLM PROVIDERS                                                      │││
│  │  │    • Mistral AI (OpenAPI-compatible)                                  │││
│  │  │    • Anthropic Claude                                                │││
│  │  │    • OpenAI (GPT-4, GPT-3.5)                                          │││
│  │  │    • Local Models (Ollama, LM Studio, etc.)                           │││
│  │  │    • Custom Endpoints                                                │││
│  │  │                                                                       │││
│  │  │  🔗 MCP SERVER INTEGRATION                                           │││
│  │  │    • MCP Protocol Support                                            │││
│  │  │    • HTTP/Stdio Transport                                             │││
│  │  │    • Server Discovery & Management                                   │││
│  │  │    • Tool Registration from MCP                                      │││
│  │  │                                                                       │││
│  │  │  💻 LSP INTEGRATION                                                   │││
│  │  │    • Language Server Protocol                                        │││
│  │  │    • VS Code / JetBrains / Neovim Bridge                              │││
│  │  │    • Code Diagnostics & Autocomplete                                 │││
│  │  │                                                                       │││
│  │  │  🗂️  FILE SYSTEM INTEGRATION                                         │││
│  │  │    • ripgrep (rg) for fast searching                                 │││
│  │  │    • SQLite for local storage                                        │││
│  │  │    • Git Integration                                                  │││
│  │  │    • File Watching                                                    │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📐 Design-Prinzipien

### 1. SOLID Prinzipien

| **Prinzip** | **Anwendung in UltraCode AI** | **Beispiel** |
|-------------|---------------------------|--------------|
| **Single Responsibility** | Jede Klasse/Modul hat genau eine Verantwortung | `ToolRegistry` verwaltet nur Tools |
| **Open/Closed** | Erweitbar, aber geschlossen für Modifikation | Neue Tools können registriert werden |
| **Liskov Substitution** | Subtypen sind austauschbar | Alle Tools implementieren `ITool` Interface |
| **Interface Segregation** | Kleine, fokussierte Interfaces | `ITool`, `IAgent`, `IProvider` |
| **Dependency Inversion** | Abhängigkeit von Abstraktionen | `ILLMProvider` Interface |

---

### 2. Clean Architecture

```
┌─────────────────────────────────────────────┐
│              Presentation Layer                │
│  (CLI, Desktop, IDE Plugins)                 │
├─────────────────────────────────────────────┤
│              Application Layer                 │
│  (Use Cases, Command Handlers)               │
├─────────────────────────────────────────────┤
│              Domain Layer                      │
│  (Entities, Business Logic)                  │
├─────────────────────────────────────────────┤
│              Infrastructure Layer              │
│  (Tools, Providers, Services)                │
└─────────────────────────────────────────────┘
```

**Dependency Rule:** Inner layers should not know about outer layers.

---

### 3. Domain-Driven Design (DDD)

**Bounded Contexts:**
- **Agent Context**: Agenten-Management und -Ausführung
- **Tool Context**: Tool-Registry und -Ausführung
- **Memory Context**: Sessions und Kontext-Persistenz
- **Versioning Context**: AI-Versionierungssystem
- **Integration Context**: LLM-Anbieter, MCP, LSP

---

### 4. CQRS (Command Query Responsibility Segregation)

```
Commands (Write):            Queries (Read):
─────────────────           ─────────────────
write_file                 read
edit                       grep
bash                       git_status
create_task                list_tools
task                       list_agents
```

---

### 5. Event-Driven Architecture

**Events:**
- `ToolExecutedEvent` – Tool wurde ausgeführt
- `AgentSwitchedEvent` – Agent wurde gewechselt
- `SessionStartedEvent` – Neue Session begann
- `SessionEndedEvent` – Session beendete
- `ErrorEvent` – Fehler trat auf
- `VersionSuggestedEvent` – Version wurde vorgeschlagen

---

## 🏛️ Komponenten im Detail

---

### 🧠 Agent Manager

**Verantwortlichkeiten:**
- Agenten registrieren und verwalten
- Agenten-Lebenszyklus steuern
- Agenten Auswahl und Delegation
- Subagenten-Koordination

**Architektur:**
```
┌─────────────────────────────────────────────────────────────┐
│                        AGENT MANAGER                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  AgentRegistry  │  │ AgentFactory    │  │  AgentPool   │  │
│  │                 │  │                 │  │              │  │
│  │ • Register      │  │ • Create        │  │ • Manage    │  │
│  │ • Unregister    │  │ • Configure     │  │ • Recycle   │  │
│  │ • List          │  │ • Validate      │  │ • Cleanup   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   AGENT INSTANCES                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Agent A   │  │   Agent B   │  │   Agent C   │          │
│  │ (build)     │  │ (plan)      │  │ (review)    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**Agent-Typen:**

| **Typ** | **Beschreibung** | **Beispiel** | **Lebensdauer** |
|---------|------------------|--------------|----------------|
| Default | Vollständiger Agent mit allen Fähigkeiten | `build`, `default` | Session |
| Subagent | Spezialisierter Agent für Delegation | `general`, `explore` | Task |
| Specialized | Agent für spezifische Aufgaben | `review`, `release` | Session/Task |
| Custom | Benutzerdefinierter Agent | `security-audit` | Session |

---

### 🛠️ Tool System

**Verantwortlichkeiten:**
- Tools registrieren und verwalten
- Tool-Ausführung koordinieren
- Berechtigungen prüfen
- Ergebnisse validieren

**Architektur:**
```
┌─────────────────────────────────────────────────────────────┐
│                         TOOL SYSTEM                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  ToolRegistry   │  │  ExecutionEngine │  │ Permission   │  │
│  │                 │  │                 │  │ Manager      │  │
│  │ • Register      │  │ • Execute       │  │ • Check      │  │
│  │ • Unregister    │  │ • Queue         │  │ • Resolve    │  │
│  │ • Get           │  │ • Parallel      │  │ • Validate   │  │
│  │ • List          │  │ • Timeout       │  │ • Audit      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      TOOL CATEGORIES                            │
├─────────────────────────────────────────────────────────────┤
│  File Operations      Code Analysis      System Operations   │
│  ├── read             ├── grep            ├── bash             │
│  ├── write_file       ├── glob            ├── git_*           │
│  ├── edit             ├── todo            ├── mcp_*           │
│  └── delete_file      └── ask_question    └── lsp_*           │
│                                                                  │
│  Project Operations    AI Operations      Utility Operations   │
│  ├── project_status   ├── version_*      ├── config           │
│  ├── dependencies     ├── release_*       ├── help              │
│  └── search           └── quality_*       └── history          │
└─────────────────────────────────────────────────────────────┘
```

**Tool-Kategorien:**

| **Kategorie** | **Zweck** | **Beispiel-Tools** | **Berechtigung** |
|---------------|-----------|-------------------|------------------|
| File Operations | Datei-Operationen | `read`, `write_file`, `edit` | `ask` |
| Code Analysis | Code-Analyse | `grep`, `glob`, `todo` | `always` |
| System Operations | System-Operationen | `bash`, `git_*` | `ask` |
| Project Operations | Projekt-Operationen | `project_status`, `dependencies` | `always` |
| AI Operations | AI-Funktionen | `version_analyze`, `release_plan` | `always` |
| Utility Operations | Utilities | `config`, `help`, `history` | `always` |
| MCP Operations | MCP-Tools | `mcp_*`, `lsp_*` | `ask` |

---

### 💾 Memory Manager

**Verantwortlichkeiten:**
- Sessions verwalten
- Kontext speichern und wiederherstellen
- Project Metadata cachen
- Conversation History verwalten

**Architektur:**
```
┌─────────────────────────────────────────────────────────────┐
│                      MEMORY MANAGER                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ SessionManager  │  │ ContextStore    │  │  Metadata    │  │
│  │                 │  │                 │  │  Cache       │  │
│  │ • Create        │  │ • Save          │  │ • Project    │  │
│  │ • Load          │  │ • Load          │  │ • Git        │  │
│  │ • Save          │  │ • Compress     │  │ • Dependencies│  │
│  │ • Delete        │  │ • Search        │  │ • Config     │  │
│  │ • Resume        │  │ • Rank          │  │              │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      STORAGE BACKENDS                            │
├─────────────────────────────────────────────────────────────┤
│  Local Storage          Remote Storage          Memory        │
│  ├── SQLite           ├── PostgreSQL          ├── In-Memory  │
│  ├── JSON Files       └── MySQL               └── LRU Cache   │
│  └── RocksDB         ┘                        ┘              │
└─────────────────────────────────────────────────────────────┘
```

**Speicherhierarchie:**

```
Short-term Memory (Session):
├── Current Conversation
├── Tool Execution Results
└── Temporary Context

Long-term Memory (Persistent):
├── Session History
├── Project Metadata
├── User Preferences
└── Learned Patterns
```

---

### 🎯 Context Engine

**Verantwortlichkeiten:**
- Kontext aus verschiedenen Quellen sammeln
- Kontext-Fenster verwalten
- Kontext komprimieren
- Kontext priorisieren

**Kontext-Quellen:**
```
┌─────────────────────────────────────────────────────────────┐
│                    CONTEXT SOURCES                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  Project        │  │  User Input     │  │  System     │  │
│  │                 │  │                 │  │              │  │
│  │ • File Tree    │  │ • Current       │  │ • Environment│  │
│  │ • Git Status    │  │ • History       │  │ • Config     │  │
│  │ • Dependencies  │  │ • Preferences   │  │ • OS Info    │  │
│  │ • Recent Files  │  │                 │  │ • Time       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CONTEXT ENGINE                              │
├─────────────────────────────────────────────────────────────┤
│  1. Collection: Sammle alle relevanten Informationen          │
│  2. Filtering: Filtere irrelevante Informationen heraus        │
│  3. Ranking: Priorisiere Informationen nach Relevanz         │
│  4. Compression: Komprimiere bei Token-Limit                  │
│  5. Delivery: Liefer Kontext an LLM                           │
└─────────────────────────────────────────────────────────────┘
```

---

### ⚡ Execution Engine

**Verantwortlichkeiten:**
- LLM-Anfragen verarbeiten
- Tool-Ausführungen koordinieren
- Ergebnisse aggregieren
- Fehler behandeln

**Ausführungs-Pipeline:**
```
┌─────────────────────────────────────────────────────────────┐
│                    EXECUTION PIPELINE                           │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐  │
│  │ Request │────▶│  Parse  │────▶│ Validate│────▶│ Execute │  │
│  │         │     │         │     │         │     │         │  │
│  └─────────┘     └─────────┘     └─────────┘     └─────────┘  │
│                              │                         │          │
│                              ▼                         ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    QUERY PROCESSING                          │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                 │ │
│  │  │ LLM Query      │  │ Tool Execution │                 │ │
│  │  │                 │  │                 │                 │ │
│  │  │ • Model Select │  │ • Single       │                 │ │
│  │  │ • Prompt Build │  │ • Parallel     │                 │ │
│  │  │ • Stream       │  │ • Queue        │                 │ │
│  │  │ • Retry        │  │ • Timeout      │                 │ │
│  │  └─────────────────┘  └─────────────────┘                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                         │          │
│                              ▼                         ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    RESULT AGGREGATION                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                 │ │
│  │  │ LLM Response   │  │ Tool Results    │                 │ │
│  │  │ Processing     │  │ Processing      │                 │ │
│  │  └─────────────────┘  └─────────────────┘                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                                         │
│                              ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    OUTPUT FORMATTING                         │ │
│  │  • Markdown Rendering                                       │ │
│  │  • Code Syntax Highlighting                                │ │
│  │  • Tool Output Integration                                  │ │
│  │  • Response Streaming                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Verzeichnisstruktur

```
ultracode/
├── packages/                          # Monorepo-Pakete (pnpm workspaces)
│
│   ├── core/                          # 🧠 Kernsystem
│   │   ├── src/
│   │   │   ├── index.ts               # Package Export
│   │   │   │
│   │   │   ├── agents/                # Agenten
│   │   │   │   ├── AgentManager.ts    # Agenten-Verwaltung
│   │   │   │   ├── BaseAgent.ts       # Basis-Agenten-Klasse
│   │   │   │   ├── BuiltInAgents/      # Vordefinierte Agenten
│   │   │   │   │   ├── BuildAgent.ts
│   │   │   │   │   ├── PlanAgent.ts
│   │   │   │   │   ├── ReviewAgent.ts
│   │   │   │   │   ├── ReleaseAgent.ts
│   │   │   │   │   └── SecurityAgent.ts
│   │   │   │   └── AgentTypes.ts      # Typ-Definitionen
│   │   │   │
│   │   │   ├── tools/                 # Tools
│   │   │   │   ├── ToolRegistry.ts    # Tool-Registry
│   │   │   │   ├── ToolExecutor.ts    # Tool-Ausführung
│   │   │   │   ├── ToolTypes.ts       # Typ-Definitionen
│   │   │   │   ├── file/              # Datei-Tools
│   │   │   │   │   ├── ReadTool.ts
│   │   │   │   │   ├── WriteFileTool.ts
│   │   │   │   │   ├── EditTool.ts
│   │   │   │   │   └── DeleteFileTool.ts
│   │   │   │   ├── search/            # Such-Tools
│   │   │   │   │   ├── GrepTool.ts
│   │   │   │   │   └── GlobTool.ts
│   │   │   │   ├── system/            # System-Tools
│   │   │   │   │   ├── BashTool.ts
│   │   │   │   │   └── GitTools.ts
│   │   │   │   ├── project/           # Projekt-Tools
│   │   │   │   │   ├── ProjectStatusTool.ts
│   │   │   │   │   └── DependenciesTool.ts
│   │   │   │   ├── ai/                # AI-Tools (UltraCode AI-spezifisch)
│   │   │   │   │   ├── versioning/
│   │   │   │   │   │   ├── AnalyzeTool.ts
│   │   │   │   │   │   ├── SuggestTool.ts
│   │   │   │   │   │   ├── PlanTool.ts
│   │   │   │   │   │   └── QualityTool.ts
│   │   │   │   │   └── release/
│   │   │   │   └── mcp/               # MCP-Tools
│   │   │   │       └── McpTool.ts
│   │   │   │
│   │   │   ├── memory/                # Memory
│   │   │   │   ├── SessionManager.ts
│   │   │   │   ├── ContextStore.ts
│   │   │   │   └── MetadataCache.ts
│   │   │   │
│   │   │   ├── context/               # Kontext
│   │   │   │   ├── ContextEngine.ts
│   │   │   │   ├── ContextCollector.ts
│   │   │   │   └── ContextCompressor.ts
│   │   │   │
│   │   │   ├── execution/             # Ausführung
│   │   │   │   ├── ExecutionEngine.ts
│   │   │   │   ├── QueryPipeline.ts
│   │   │   │   └── ToolQueue.ts
│   │   │   │
│   │   │   ├── providers/             # LLM-Anbieter
│   │   │   │   ├── BaseProvider.ts
│   │   │   │   ├── MistralProvider.ts
│   │   │   │   ├── AnthropicProvider.ts
│   │   │   │   ├── OpenAIProvider.ts
│   │   │   │   └── LocalProvider.ts
│   │   │   │
│   │   │   └── config/                # Konfiguration
│   │   │       ├── ConfigManager.ts
│   │   │       ├── ConfigTypes.ts
│   │   │       └── defaults.ts
│   │   │
│   │   └── tests/                     # Unit-Tests
│   │
│   ├── cli/                           # 🖥️  CLI
│   │   ├── src/
│   │   │   ├── index.ts               # Entry Point
│   │   │   ├── main.tsx              # React Entry
│   │   │   ├── App.tsx               # Hauptkomponente
│   │   │   │
│   │   │   ├── components/            # UI-Komponenten
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── ChatOutput.tsx
│   │   │   │   ├── ToolOutput.tsx
│   │   │   │   ├── StatusBar.tsx
│   │   │   │   └── themes/
│   │   │   │       ├── dark.ts
│   │   │   │       ├── light.ts
│   │   │   │       └── dracula.ts
│   │   │   │
│   │   │   ├── hooks/                 # React Hooks
│   │   │   │   ├── useChat.ts
│   │   │   │   ├── useTools.ts
│   │   │   │   └── useConfig.ts
│   │   │   │
│   │   │   ├── commands/              # CLI-Kommandos
│   │   │   │   ├── CommandRegistry.ts
│   │   │   │   ├── StartCommand.ts
│   │   │   │   └── ConfigCommand.ts
│   │   │   │
│   │   │   └── utils/                 # Utilities
│   │   │
│   │   └── tests/
│   │
│   ├── desktop/                       # 💻 Desktop App
│   │   ├── main/                      # Electron Main Process
│   │   │   ├── index.ts
│   │   │   ├── window.ts
│   │   │   └── menu.ts
│   │   │
│   │   ├── renderer/                  # Electron Renderer Process
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   └── App.tsx
│   │   │
│   │   └── preload/                   # Preload Scripts
│   │
│   ├── ide/                           # 🔌 IDE Integration
│   │   ├── vscode/                    # VS Code Extension
│   │   │   ├── extension.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   │
│   │   ├── jetbrains/                 # JetBrains Plugin
│   │   │   └── src/
│   │   │
│   │   └── neovim/                    # Neovim Integration
│   │       └── lua/
│   │
│   ├── python/                        # 🐍 Python Integration
│   │   └── vibe/                      # Mistral Vibe Portierung
│   │       ├── core/
│   │       └── cli/
│   │
│   └── shared/                        # 📦 Shared Code
│       ├── types/
│       ├── utils/
│       └── constants/
│
├── docs/                              # 📚 Dokumentation
├── scripts/                           # 📜 Build-Skripte
│   ├── build.ts
│   ├── test.ts
│   └── deploy.ts
│
├── tests/                             # 🧪 Integration-Tests
├── examples/                          # 📁 Beispielprojekte
└── package.json                      # Root package.json (pnpm workspaces)
```

---

## 🔗 Abhängigkeiten

### Interne Abhängigkeiten

```
core/
├── agents/     → dépends on: config, tools, memory, context
├── tools/      → dépends on: config, execution
├── memory/     → dépends on: config
├── context/    → dépends on: config, tools
├── execution/  → dépends on: tools, providers, config
└── providers/  → dépends on: config

cli/
├── components/ → dépends on: core, shared
├── commands/   → dépends on: core, cli/utils
└── hooks/      → dépends on: core, cli/utils

Desktop/IDE
└── → dépends on: core, shared
```

### Externe Abhängigkeiten

| **Kategorie** | **Paket** | **Version** | **Zweck** |
|--------------|-----------|-------------|-----------|
| **Runtime** | Node.js | 20.0+ | JavaScript Runtime |
| **Package Manager** | pnpm | 8.0+ | Monorepo-Management |
| **TypeScript** | typescript | 5.3+ | Type Checking |
| **UI** | react | 18.2+ | React Library |
| **UI** | ink | 4.0+ | Terminal UI |
| **CLI** | commander | 11.0+ | CLI Parsing |
| **Validation** | zod | 3.22+ | Schema Validation |
| **HTTP** | axios | 1.6+ | HTTP Client |
| **File System** | @node-rs/fs | latest | High-Performance FS |
| **Search** | ripgrep | 13.0+ | Fast Search |
| **Database** | better-sqlite3 | 8.0+ | SQLite Driver |
| **WebSocket** | ws | 8.15+ | WebSocket Client |
| **MCP** | @modelcontextprotocol/sdk | latest | MCP SDK |
| **LSP** | vscode-languageserver-protocol | 3.17+ | LSP Support |

---

## 🎯 Design-Entscheidungen

### 1. Warum TypeScript?

| **Pro** | **Contra** | **Entscheidung** |
|---------|-----------|-----------------|
| Typsicherheit | Längere Build-Zeiten | ✅ **Pro überwiegt** |
| Bessere IDE-Unterstützung | Komplexere Konfiguration | ✅ **Pro überwiegt** |
| Gute Performance | Lernkurve | ✅ **Pro überwiegt** |
| Große Community | - | ✅ **Pro überwiegt** |

**Fazit:** TypeScript bietet die beste Kombination aus Typsicherheit, Performance und Entwicklererfahrung.

---

### 2. Warum React + Ink für CLI?

| **Option** | **Pro** | **Contra** | **Entscheidung** |
|-----------|---------|-----------|-----------------|
| Plain CLI | Einfach | Keine interaktive UI | ❌ |
| Blessed | Terminal-Kompatibel | Eingeschränkte Features | ❌ |
| **React + Ink** | **Volle UI-Fähigkeiten** | **Größere Bundle-Size** | ✅ **Beste Wahl** |
| Terminal UI Libraries | Viel Auswahl | Wenig Integration | ❌ |

**Fazit:** React + Ink bietet die beste Basis für eine moderne, interaktive CLI mit voller UI-Fähigkeiten.

---

### 3. Warum Monorepo?

| **Pro** | **Contra** | **Entscheidung** |
|---------|-----------|-----------------|
| Gemeinsame Abhängigkeiten | Höherer Speicherverbrauch | ✅ **Pro überwiegt** |
| Einfache Code-Sharing | Komplexere Builds | ✅ **Pro überwiegt** |
| Vereinfachtes Deployment | - | ✅ **Pro überwiegt** |
| Bessere Integration | - | ✅ **Pro überwiegt** |

**Fazit:** pnpm Workspaces bieten die besten Monorepo-Features mit minimalen Nachteilen.

---

### 4. Warum SQLite für lokale Speicherung?

| **Option** | **Pro** | **Contra** | **Entscheidung** |
|-----------|---------|-----------|-----------------|
| JSON Files | Einfach | Langsam für große Daten | ❌ |
| RocksDB | Schnell | Komplexere API | ❌ |
| **SQLite** | **Einfach + Schnell** | **Keine Server nötig** | ✅ **Beste Wahl** |
| PostgreSQL | Skalierbar | Server nötig | ❌ (für Cloud) |

**Fazit:** SQLite bietet die beste Kombination aus Einfachheit, Performance und lokaler Speicherung.

---

### 5. Warum MCP + LSP?

| **Protokoll** | **Zweck** | **Integration** |
|--------------|-----------|----------------|
| **MCP** | Tool-Integration | Für erweiterte Tools |
| **LSP** | Code-Intelligenz | Für IDE-Integration |
| Beides | Vollständige Features | ✅ **Beste Wahl** |

**Fazit:** MCP und LSP ergänzen sich perfekt für maximale Kompatibilität und Funktionalität.

---

## 📊 Performance-Optimierungen

### 1. Lazy Loading

- **Problem:** Große Module erhöhen Startzeit
- **Lösung:** Dynamisches Importieren von nicht kritischen Modulen

```typescript
// Vorher
import { HeavyModule } from './heavy';

// Nachher
const heavyModule = await import('./heavy');
```

---

### 2. Caching

- **Tool Results:** Zwischenspeichern von Tool-Ausführungen
- **LLM Responses:** Caching von häufigen Anfragen
- **File Index:** Persistente Datei-Indexierung

---

### 3. Parallel Execution

- **Tool Execution:** Parallele Ausführung unabhängiger Tools
- **Subagents:** Gleichzeitige Ausführung mehrerer Subagenten
- **Batch Processing:** Massenverarbeitung von Dateien

---

### 4. Streaming

- **LLM Responses:** Streaming von Token für bessere UX
- **Tool Output:** Echtzeit-Ausgabe von Tool-Ergebnissen
- **Progress:** Fortschrittsbalken für lange Operationen

---

### 5. Memory Management

- **Session Compression:** Automatische Kompression langer Sessions
- **Context Window:** Dynamische Anpassung des Kontext-Fensters
- **Garbage Collection:** Automatische Bereinigung alter Sessions

---

## 🔮 Zukunftsarchitektur

### 1. Microservices-Architektur

Zukünftig könnte UltraCode AI in **Microservices** aufgeteilt werden:

```
┌─────────────────────────────────────────────────────────────┐
│                    MICROSERVICES ARCHITEKTUR                     │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  API        │  │  Worker      │  │  AI Service  │          │
│  │  Gateway    │  │  Pool        │  │              │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                              │                         │          │
│                              ▼                         ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    SERVICE MESH                               │ │
│  │  • Service Discovery                                       │ │
│  │  • Load Balancing                                           │ │
│  │  • Circuit Breaking                                          │ │
│  │  • Retry Logic                                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2. Plugin-Architektur

Erweiterbare Architektur für **Third-Party-Plugins**:

```
┌─────────────────────────────────────────────────────────────┐
│                    PLUGIN ARCHITEKTUR                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                    │
│  │  Plugin Host    │  │  Plugin          │                    │
│  │                 │  │                 │                    │
│  │ • Load          │  │ • Register Tools │                    │
│  │ • Unload        │  │ • Register Agents│                    │
│  │ • Manage        │  │ • Extend UI     │                    │
│  │ • Isolate       │  │ • Custom Logic  │                    │
│  └─────────────────┘  └─────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📖 Nächste Schritte

- [Core-System →](./core-system.md) – Kernfunktionen vertiefen
- [AI-Versionierung →](./ai-versioning.md) – Einzigartige Features
- [Tools-Referenz →](./tools-reference.md) – Alle Tools im Detail
- [Agenten-Referenz →](./agents-reference.md) – Agenten verstehen

---

## 🔗 Externe Ressourcen

- [SOLID Prinzipien](https://en.wikipedia.org/wiki/SOLID)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design](https://domainlanguage.com/ddd/)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Microservices](https://martinfowler.com/microservices/)
