# UltraCode AI Plug-in Entwicklung

> ⚠️ **Vision / noch nicht implementiert.** Es gibt im aktuellen Code **kein** Plug-in-System (kein `packages/core/src/plugin`, kein Plug-in-Loader, kein `examples/plugins`-Verzeichnis). Diese Anleitung beschreibt die angestrebte Plug-in-Architektur und ist Roadmap. Erweiterbar ist UltraCode AI heute über die [Skill-](../REFERENCE/cli-commands.md#ultracode-skills) und [Agenten-Authoring-Kommandos](../REFERENCE/cli-commands.md#ultracode-agents-authoring).

> **Anleitung zur Erstellung eigener Plug-ins für UltraCode AI** *(geplant)*

---

## 🎯 Übersicht

UltraCode AI bietet ein **erweiterbares Plug-in-System**, mit dem du:
- **Eigene Tools** hinzufügen kannst
- **Neue Agenten** erstellen kannst
- **Benutzerdefinierte Kommandos** registrieren kannst
- **MCP-Server** integrieren kannst
- **UI-Erweiterungen** vornehmen kannst

---

## 📦 Plug-in-Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    PLUG-IN ARCHITEKTUR                         │
├─────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │   PLUGIN HOST   │    │     PLUGIN      │                  │
│  │                 │    │                 │                  │
│  │ • Load          │    │ • Register Tools│                  │
│  │ • Unload        │    │ • Register Agents│                  │
│  │ • Manage        │    │ • Register Commands│               │
│  │ • Isolate       │    │ • Extend UI     │                  │
│  │ • Validate      │    │ • Add MCP Servers│                  │
│  │                 │    │ • Custom Logic  │                  │
│  └─────────────────┘    └─────────────────┘                  │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    PLUGIN INTERFACE                        │ │
│  │  ┌─────────────────┐    ┌─────────────────┐              │ │
│  │  │  IPlugin        │    │  PluginMetadata │              │ │
│  │  │                 │    │                 │              │ │
│  │  │ • name          │    │ • name         │              │ │
│  │  │ • version       │    │ • version      │              │ │
│  │  │ • description   │    │ • description  │              │ │
│  │  │ • author        │    │ • author       │              │ │
│  │  │ • initialize()  │    │ • license      │              │ │
│  │  │ • cleanup()     │    │ • homepage     │              │ │
│  │  │ • getTools()    │    │ • dependencies │              │ │
│  │  │ • getAgents()   │    └─────────────────┘              │ │
│  │  │ • getCommands() │                                      │ │
│  │  └─────────────────┘                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Schnellstart: Einfaches Plug-in

### 1. Plug-in-Struktur erstellen

```bash
# Verzeichnisstruktur
my-ultracode-plugin/
├── package.json          # Plug-in-Metadaten
├── plugin.ts             # Plug-in-Hauptdatei
├── tools/                # Eigene Tools
│   └── MyTool.ts
├── agents/               # Eigene Agenten
│   └── MyAgent.ts
├── commands/             # Eigene Kommandos
│   └── MyCommand.ts
└── README.md             # Dokumentation
```

---

### 2. package.json

```json
{
  "name": "my-ultracode-plugin",
  "version": "1.0.0",
  "description": "Mein erstes UltraCode AI Plug-in",
  "main": "plugin.ts",
  "ultracode": {
    "plugin": {
      "name": "my-plugin",
      "version": "1.0.0",
      "description": "Mein erstes UltraCode AI Plug-in",
      "author": "Dein Name",
      "license": "MIT",
      "homepage": "https://github.com/username/my-ultracode-plugin"
    }
  },
  "keywords": ["ultracode", "plugin"],
  "author": "Dein Name",
  "license": "MIT",
  "dependencies": {
    "ultracode-core": "^1.0.0"
  }
}
```

---

### 3. Plug-in-Hauptdatei (plugin.ts)

```typescript
// my-ultracode-plugin/plugin.ts

import type { IPlugin, PluginMetadata, PluginContext } from 'ultracode-core';
import { MyTool } from './tools/MyTool';
import { myAgentConfig } from './agents/MyAgent';

export const metadata: PluginMetadata = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Mein erstes UltraCode AI Plug-in',
  author: 'Dein Name',
  license: 'MIT',
  homepage: 'https://github.com/username/my-ultracode-plugin',
  dependencies: [],
};

export class MyPlugin implements IPlugin {
  private context?: PluginContext;
  
  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    
    // Tools registrieren
    const myTool = new MyTool();
    context.toolRegistry.register(myTool);
    
    // Agenten registrieren
    context.agentRegistry.register(myAgentConfig);
    
    console.log(`[MyPlugin] Plug-in ${metadata.name} v${metadata.version} geladen`);
  }
  
  async cleanup(): Promise<void> {
    // Aufräumen
    console.log(`[MyPlugin] Plug-in ${metadata.name} bereinigt`);
  }
  
  getTools() {
    return [MyTool];
  }
  
  getAgents() {
    return [myAgentConfig];
  }
}

// Plug-in exportieren
export default new MyPlugin();
```

---

### 4. Eigenes Tool erstellen

```typescript
// my-ultracode-plugin/tools/MyTool.ts

import { BaseTool } from 'ultracode-core';
import type { ToolSchema } from 'ultracode-core';

export class MyTool extends BaseTool {
  constructor() {
    super(
      'my_tool',
      'Führt meine benutzerdefinierte Aktion aus',
      'utility',
      {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Eingabetext',
          },
          count: {
            type: 'number',
            description: 'Wiederholungen',
            default: 1,
          },
        },
        required: ['input'],
      } as ToolSchema
    );
  }
  
  protected async run(args: { input: string; count?: number }): Promise<string> {
    const count = args.count || 1;
    const result = args.input.repeat(count);
    
    return `MyTool ausgeführt: ${result}`;
  }
}
```

---

### 5. Eigenen Agenten erstellen

```typescript
// my-ultracode-plugin/agents/MyAgent.ts

import type { AgentConfig } from 'ultracode-core';

export const myAgentConfig: AgentConfig = {
  id: 'my_agent',
  name: 'My Custom Agent',
  type: 'custom',
  model: 'mistral-large',
  provider: 'mistral',
  systemPrompt: `Du bist mein benutzerdefinierter Agent. 
  Sei hilfreich und präzise. Verwende die verfügbaren Tools.`,
  systemPromptId: 'my-agent',
  disabledTools: ['bash', 'write_file'],
  enabledTools: ['read', 'grep', 'my_tool'],
  temperature: 0.7,
  maxTokens: 40000,
  timeout: 300,
};
```

---

### 6. Plug-in testen

#### 6.1 Lokales Testen

```bash
# Plug-in-Verzeichnis linken
cd my-ultracode-plugin
npm link

# UltraCode AI starten
ultracode-ai

# Tool testen
> my_tool(input="Hello", count=3)

# Agent testen
> /agents my_agent
> "Verwende mein Tool"
```

#### 6.2 Plug-in installieren

```bash
# Global installieren
npm install -g my-ultracode-plugin

# Oder lokal
npm install my-ultracode-plugin
```

---

## 📦 Plug-in-Verpackung & Veröffentlichung

### 1. Plug-in bauen

```bash
npm run build
```

### 2. Plug-in veröffentlichen

```bash
# npm
npm publish

# GitHub
# Release auf GitHub erstellen
```

### 3. Plug-in registrieren (optional)

Füge dein Plug-in zum **UltraCode AI Plug-in Registry** hinzu:

```bash
# Plug-in bei UltraCode AI registrieren
ultracode-ai --plugin-registry add my-ultracode-plugin https://github.com/username/my-ultracode-plugin
```

---

## 🧩 Plug-in-Typen

### 1. Tool-Plug-ins

**Zweck:** Neue Tools hinzufügen

```typescript
import { BaseTool } from 'ultracode-core';

export class MySearchTool extends BaseTool {
  constructor() {
    super(
      'my_search',
      'Such nach spezifischen Patterns',
      'search',
      {
        type: 'object',
        properties: {
          pattern: { type: 'string', required: true },
          path: { type: 'string', default: '.' },
        },
      }
    );
  }
  
  protected async run(args: { pattern: string; path: string }): Promise<string> {
    // Implementiere benutzerdefinierte Suche
    return `Gefunden: ${this.customSearch(args.pattern, args.path)}`;
  }
}
```

---

### 2. Agent-Plug-ins

**Zweck:** Neue Agenten erstellen

```typescript
import type { AgentConfig } from 'ultracode-core';

export const mySpecializedAgent: AgentConfig = {
  id: 'code-review-expert',
  name: 'Code Review Expert',
  type: 'specialized',
  model: 'mistral-large',
  provider: 'mistral',
  systemPromptId: 'code-review-expert',
  disabledTools: ['write_file', 'edit', 'bash'],
  enabledTools: ['read', 'grep', 'code_analysis', 'lsp_*'],
  temperature: 0.3,
  maxTokens: 40000,
};
```

---

### 3. Command-Plug-ins

**Zweck:** Neue Slash-Commands hinzufügen

```typescript
import type { ICommand, CommandContext } from 'ultracode-core';

export class MyCommand implements ICommand {
  readonly name = 'my-command';
  readonly description = 'Mein benutzerdefiniertes Kommando';
  readonly aliases = ['mc'];
  readonly usage = '/my-command [args]';
  
  async execute(context: CommandContext, args: string[]): Promise<void> {
    context.send(`MyCommand ausgeführt mit Args: ${args.join(', ')}`);
  }
}
```

**Registrierung:**
```typescript
// In deinem Plug-in
context.commandRegistry.register(new MyCommand());
```

**Verwendung:**
```
> /my-command arg1 arg2
> /mc arg1 arg2  # Alias
```

---

### 4. MCP-Plug-ins

**Zweck:** MCP-Server integrieren

```typescript
import type { MCPServerConfig } from 'ultracode-core';

export const myMCPServer: MCPServerConfig = {
  name: 'my-mcp-server',
  transport: 'http',
  url: 'http://localhost:3000',
  headers: {
    'Authorization': 'Bearer token',
  },
};

// Registrierung
await context.mcpRegistry.register(myMCPServer);
```

---

### 5. UI-Plug-ins

**Zweck:** UI-Erweiterungen

```typescript
import type { UIExtension, UIContext } from 'ultracode-core';

export class MyUIExtension implements UIExtension {
  readonly name = 'my-ui';
  
  initialize(context: UIContext): void {
    // UI-Elemente registrieren
    context.registerComponent('MyComponent', MyReactComponent);
    context.registerTheme('my-theme', myTheme);
  }
  
  cleanup(): void {
    // Aufräumen
  }
}
```

---

## 🎯 Best Practices

### 1. Plug-in-Entwicklungs-Richtlinien

✅ **Kleine, fokussierte Plug-ins** erstellen
✅ **Gute Dokumentation** hinzufügen
✅ **Fehlerbehandlung** implementieren
✅ **Tests** schreiben
✅ **TypeScript** verwenden
✅ **Abhängigkeiten** minimal halten
✅ **Performance** optimieren

---

### 2. Plug-in-Lebenszyklus

```
┌─────────────────────────────────────────────────────────────┐
│                    PLUG-IN LEBENSZYKLUS                         │
├─────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐              │
│  │  LOAD    │────▶│  INIT    │────▶│  READY   │              │
│  │          │     │          │     │          │              │
│  └──────────┘     └──────────┘     └──────────┘              │
│       │               │               │                  │
│       ▼               ▼               ▼                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  LOAD PHASE:                                                   │ │
│  │    • Plug-in laden                                             │ │
│  │    • Metadaten prüfen                                         │ │
│  │    • Abhängigkeiten laden                                     │ │
│  │    • Plug-in-Instanz erstellen                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  INIT PHASE:                                                   │ │
│  │    • initialize() aufrufen                                     │ │
│  │    • Tools registrieren                                        │ │
│  │    • Agenten registrieren                                      │ │
│  │    • Kommandos registrieren                                    │ │
│  │    • MCP-Server registrieren                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  READY PHASE:                                                   │ │
│  │    • Plug-in ist aktiv                                         │ │
│  │    • Tools/Agenten/Commands verfügbar                         │ │
│  │    • Auf Nutzung warten                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  UNLOAD PHASE:                                                 │ │
│  │    • cleanup() aufrufen                                        │ │
│  │    • Registrierungen aufheben                                  │ │
│  │    • Ressourcen freigeben                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Plug-in-Isolation

UltraCode AI bietet **Isolation für Plug-ins**:

- **Sandboxing:** Plug-ins laufen in isolierten Kontexten
- **Fehlerisolation:** Plug-in-Fehler beeinflussen nicht das Hauptsystem
- **Berechtigungen:** Plug-ins haben eingeschränkte Berechtigungen
- **Abhängigkeits-Isolation:** Jedes Plug-in hat eigene Abhängigkeiten

---

## 🛠️ Erweiterte Plug-in-Features

### 1. Event-Listener

```typescript
// In deinem Plug-in
context.eventBus.on('ToolExecuted', (event) => {
  console.log(`Tool ${event.toolName} wurde ausgeführt`);
});

context.eventBus.on('AgentSwitched', (event) => {
  console.log(`Agent gewechselt zu ${event.agentId}`);
});
```

---

### 2. Kontext-Erweiterung

```typescript
// Benutzerdefinierte Kontext-Quellen hinzufügen
context.contextEngine.addSource('my-context', async (ctx) => {
  return {
    type: 'my-context',
    content: 'Benutzerdefinierter Kontext',
    priority: 0.5,
  };
});
```

---

### 3. Storage-Erweiterung

```typescript
// Benutzerdefinierten Storage-Backend hinzufügen
context.storageRegistry.register('my-storage', {
  get: async (key) => { /* implementieren */ },
  set: async (key, value) => { /* implementieren */ },
  delete: async (key) => { /* implementieren */ },
  list: async () => { /* implementieren */ },
});
```

---

### 4. API-Erweiterung

```typescript
// REST API Endpunkte hinzufügen
context.apiRouter.post('/my-endpoint', async (req, res) => {
  // Implementierung
  res.json({ success: true });
});
```

---

## 📚 Plug-in-Beispiele

### Beispiel 1: GitHub-Integration Plug-in

```typescript
// github-plugin/tools/GitHubTool.ts
import { BaseTool } from 'ultracode-core';

export class GitHubTool extends BaseTool {
  constructor() {
    super(
      'github_get_issue',
      'Holt GitHub Issue',
      'mcp',
      {
        type: 'object',
        properties: {
          owner: { type: 'string', required: true },
          repo: { type: 'string', required: true },
          number: { type: 'number', required: true },
        },
      }
    );
  }
  
  protected async run(args: { owner: string; repo: string; number: number }): Promise<any> {
    // GitHub API aufrufen
    const response = await fetch(
      `https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.number}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
        },
      }
    );
    
    const issue = await response.json();
    return issue;
  }
}
```

---

### Beispiel 2: Code-Qualität Plug-in

```typescript
// code-quality-plugin/agents/CodeQualityAgent.ts
import type { AgentConfig } from 'ultracode-core';

export const codeQualityAgent: AgentConfig = {
  id: 'code-quality-expert',
  name: 'Code Quality Expert',
  type: 'specialized',
  model: 'mistral-large',
  provider: 'mistral',
  systemPrompt: `Du bist ein Code-Qualitäts-Experte. Analysiere Code und gib Verbesserungsvorschläge.`,
  disabledTools: ['write_file', 'edit', 'bash'],
  enabledTools: ['read', 'grep', 'code_analysis', 'complexity_analysis', 'lsp_diagnostics'],
  temperature: 0.3,
  maxTokens: 40000,
};
```

---

## 📖 Dokumentation & Veröffentlichung

### 1. README.md

```markdown
# My UltraCode AI Plugin

Mein erstes UltraCode AI Plug-in mit benutzerdefinierten Tools und Agenten.

## Features

- `my_tool` - Mein benutzerdefiniertes Tool
- `my_agent` - Mein benutzerdefinierter Agent
- `/my-command` - Mein benutzerdefiniertes Kommando

## Installation

```bash
npm install my-ultracode-plugin
```

## Verwendung

```
> my_tool(input="test")
> /agents my_agent
> /my-command
```

## Konfiguration

```toml
[plugins.my-plugin]
enabled = true
config = { my_setting = "value" }
```
```

---

### 2. CHANGELOG.md

Führe ein **Changelog** für dein Plug-in:

```markdown
# Changelog

## v1.0.0 - 2026-06-11

### Added
- Erstes Release von my-ultracode-plugin
- MyTool hinzugefügt
- MyAgent hinzugefügt

## v1.1.0 - 2026-06-12

### Added
- MyCommand hinzugefügt
- GitHub-Integration
```

---

### 3. LICENSE

Verwende eine **Open-Source-Lizenz** (MIT, Apache 2.0, etc.):

```
MIT License

Copyright (c) 2026 Dein Name

Permission is hereby granted...
```

---

## 🤝 Community & Support

### Plug-in registrieren

Füge dein Plug-in zum **offiziellen UltraCode AI Plug-in Registry** hinzu:

```bash
ultracode-ai --plugin-registry add <name> <url>
```

### Plug-in-Dokumentation

Dokumentiere dein Plug-in im **UltraCode AI Docs**:

```markdown
# Plug-ins

## Offizielle Plug-ins

- [my-ultracode-plugin](https://github.com/username/my-ultracode-plugin) - Beschreibung

## Community Plug-ins

- [dein-plugin](https://github.com/username/dein-plugin) - Beschreibung
```

---

## 🚀 Nächste Schritte

1. **Plug-in entwickeln** mit den Beispiele
2. **Plug-in testen** und debuggen
3. **Plug-in veröffentlichen**
4. **Feedback einholen** von der Community

---

## 🔗 Nützliche Links

- UltraCode AI Plug-in API → *(geplant; `packages/core/src/plugin` existiert noch nicht)*
- Beispiel-Plug-ins → *(geplant; `examples/plugins` existiert noch nicht)*
- [Plug-in-Registry →](https://ultracode.ai/plugins)
- [Discord #plugins →](https://discord.gg/ultracode)
- [GitLab Issues →](https://gitlab.simo-online.com/simo/ultracode-ai/-/issues) (Label: `plugin`)
