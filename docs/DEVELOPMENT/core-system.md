# UltraCode Core System

> **Detaillierte Dokumentation des Kernsystems – Agent Manager, Tool System, Memory, Context & Execution**

---

## 🧠 Übersicht

Das **Core System** ist das Herz von UltraCode. Es enthält alle Business-Logic-Komponenten und ist in **TypeScript** implementiert.

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE SYSTEM MODULE                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   AGENTS    │  │    TOOLS    │  │   MEMORY    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│        │                │               │                  │
│        ▼                ▼               ▼                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  CONTEXT    │  │  EXECUTION  │  │  PROVIDERS  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Modulstruktur

```
packages/core/src/
├── agents/              # Agenten-System
│   ├── AgentManager.ts
│   ├── BaseAgent.ts
│   └── BuiltInAgents/
│
├── tools/              # Tool-System
│   ├── ToolRegistry.ts
│   ├── ToolExecutor.ts
│   └── implementations/
│
├── memory/             # Memory-System
│   ├── SessionManager.ts
│   └── ContextStore.ts
│
├── context/            # Kontext-System
│   ├── ContextEngine.ts
│   └── sources/
│
├── execution/          # Ausführungs-Pipeline
│   └── QueryPipeline.ts
│
└── providers/          # LLM-Anbieter
    ├── BaseProvider.ts
    ├── MistralProvider.ts
    └── OpenAIProvider.ts
```

---

## 🧠 Agent Manager

### Verantwortlichkeiten
- Agenten registrieren und verwalten
- Agenten-Lebenszyklus steuern (init → ready → executing → cleanup)
- Agenten-Auswahl und Delegation
- Subagenten-Koordination

### Vordefinierte Agenten

| **Agent** | **Typ** | **Modell** | **Zweck** | **Deaktivierte Tools** |
|-----------|---------|------------|-----------|----------------------|
| `default` | default | mistral-large | Allgemein | - |
| `build` | default | mistral-large | Entwicklung | - |
| `plan` | default | mistral-medium | Analyse | write_file, edit, bash |
| `review` | specialized | mistral-large | Code Review | write_file, edit |
| `release` | specialized | mistral-large | Release | - |
| `general` | subagent | mistral-medium | Delegation | - |

### Agent-Lebenszyklus
```
INIT → READY → EXECUTING → CLEANUP
```

---

## 🛠️ Tool System (80+ Tools)

### Kategorien

| **Kategorie** | **Tools** | **Berechtigung** |
|---------------|-----------|------------------|
| File | read, write_file, edit, delete_file | ask |
| Search | grep, glob, todo | always |
| System | bash, git_*, mcp_* | ask |
| Project | project_status, dependencies | always |
| AI | version_analyze, release_plan | always |
| Utility | config, help, history | always |

### Tool-Interface

```typescript
interface ITool {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly schema: ToolSchema;
  readonly permission: ToolPermission;
  
  execute(args: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult>;
  validate(args: Record<string, unknown>): Promise<ValidationResult>;
}
```

---

## 💾 Memory Manager

### Speicherhierarchie

```
Short-term Memory (Session):
├── Current Conversation
├── Tool Execution Results
└── Temporary Context

Long-term Memory (Persistent):
├── Session History
├── Project Metadata
└── User Preferences
```

### Storage Backends
- **Local:** SQLite, JSON Files, RocksDB
- **Remote:** PostgreSQL, MySQL
- **Memory:** In-Memory, LRU Cache

---

## 🎯 Context Engine

### Kontext-Quellen
- **Project:** File Tree, Git Status, Dependencies
- **User:** Current Input, History, Preferences
- **System:** Environment, Config, OS Info

### Pipeline
```
Collection → Filtering → Ranking → Compression → Delivery
```

---

## ⚡ Execution Engine

### Anfrage-Pipeline
```
Request → Preprocessing → Context → LLM Query → Tool Execution → Postprocessing → Response
```

### Parallel Execution
- Gleichzeitige Ausführung unabhängiger Tools
- Subagents für komplexe Aufgaben
- Queue-System für Kontrolle

---

## 🔌 LLM Providers

### Unterstützte Anbieter
- **Mistral AI** (mistral-large, mistral-medium, mistral-small)
- **Anthropic** (claude-3-5-sonnet, claude-3-opus)
- **OpenAI** (gpt-4, gpt-3.5-turbo)
- **Local Models** (Ollama, LM Studio)

### Provider-Interface

```typescript
interface IProvider {
  query(params: QueryParams): Promise<LLMResult>;
  listModels(): Promise<Model[]>;
  getModelInfo(modelId: string): Promise<ModelInfo>;
}
```

---

## 📊 Nächste Schritte

- [AI-Versionierungssystem →](./ai-versioning.md) – Einzigartige AI-Features
- [Tools-Referenz →](./tools-reference.md) – Alle Tools im Detail
- [Agenten-Referenz →](./agents-reference.md) – Agenten verstehen
- [Architektur →](./architecture.md) – Systemdesign

---

## 🔗 Verweise

- [Architektur-Dokumentation](./architecture.md)
- [AI-Versionierung](./ai-versioning.md)
- [ Tools-Referenz](./tools-reference.md)
