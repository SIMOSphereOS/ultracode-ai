# UltraCode Agenten Referenz

> **Komplette Dokumentation aller Agenten und deren Fähigkeiten**

---

## 🎯 Übersicht

UltraCode bietet **verschiedene Agenten-Typen** für unterschiedliche Anwendungsfälle:

| **Typ** | **Agenten** | **Zweck** | **Modell** | **Tools** |
|---------|-------------|-----------|------------|----------|
| Default | default, build | Allgemeine Nutzung | mistral-large | Alle |
| Specialized | plan, review, release, security | Spezifische Aufgaben | variiert | Eingeschränkt |
| Subagent | general, explore | Delegation | mistral-medium | Eingeschränkt |
| Custom | Benutzerdefiniert | Individuell | variiert | Konfigurierbar |

---

## 🧠 Vordefinierte Agenten

---

### 1. `default` - Standard-Agent

**Typ:** Default
**Modell:** mistral-large (konfigurierbar)
**Zweck:** Allgemeine Nutzung, volle Fähigkeiten

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Vollständiger Zugriff | ✅ |
| Alle Tools verfügbar | ✅ |
| Alle Befehle verfügbar | ✅ |
| Berechtigungen | Voll |
| System-Prompt | Standard |

**Verwendung:**
```bash
ultracode  # Standardmäßig
ultracode --agent default
```

**In Session:**
```
> /agents default
```

**Empfohlen für:**
- Allgemeine Entwicklung
- Komplexe Aufgaben
- Wenn maximale Flexibilität benötigt wird

---

### 2. `build` - Entwicklungs-Agent

**Typ:** Default
**Modell:** mistral-large (konfigurierbar)
**Zweck:** Entwicklung, volle Berechtigungen

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Vollständiger Zugriff | ✅ |
| Alle Tools verfügbar | ✅ |
| Alle Befehle verfügbar | ✅ |
| Berechtigungen | Voll |
| System-Prompt | Entwicklungsfokussiert |

**Verwendung:**
```bash
ultracode --agent build
```

**In Session:**
```
> /agents build
```

**Spezialisierung:**
- Optimiert für Code-Entwicklung
- Besserer Kontext für Entwicklungsaufgaben
- Automatische Tool-Auswahl für Entwicklung

**Empfohlen für:**
- Code schreiben und bearbeiten
- Bugfixing
- Feature-Implementierung
- Entwicklungsspezifische Aufgaben

---

### 3. `plan` - Analyse-Agent

**Typ:** Default
**Modell:** mistral-medium (konfigurierbar)
**Zweck:** Nur Lesen, Analyse, Planung

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Vollständiger Zugriff | ❌ |
| Alle Tools verfügbar | ❌ |
| Deaktivierte Tools | write_file, edit, bash, git_commit, git_push |
| Berechtigungen | Eingeschränkt |
| System-Prompt | Analyse-fokussiert |

**Verwendung:**
```bash
ultracode --agent plan
```

**In Session:**
```
> /agents plan
```

**Spezialisierung:**
- Optimiert für Code-Analyse
- Keine schreibenden Operationen
- Automatische explorative Aufgaben
- Gute Wahl für unbekannte Codebasen

**Empfohlen für:**
- Code-Exploration
- Projekt-Analyse
- Planung von Änderungen
- Review von fremdem Code
- Lernzwecke

**Beispiel-Workflows:**
```
> "Analysiere diese Codebase"
> "Erkläre mir die Architektur"
> "Suche nach Sicherheitslücken"
> "Welche Technologien werden verwendet?"
```

---

### 4. `review` - Code Review-Agent

**Typ:** Specialized
**Modell:** mistral-large (konfigurierbar)
**Zweck:** Code Review, Qualitätsprüfung

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Vollständiger Zugriff | ❌ |
| Deaktivierte Tools | write_file, edit, bash |
| Spezialisierte Tools | code_analysis, complexity_analysis, lsp_* |
| System-Prompt | Code Review-fokussiert |

**Verwendung:**
```bash
ultracode --agent review
```

**In Session:**
```
> /agents review
```

**Spezialisierung:**
- Optimiert für Code-Qualität
- Automatische Code-Analyse
- LSP-Integration für präzise Analyse
- Quality Gate Checks

**Empfohlen für:**
- Code Review
- Qualitätsprüfung
- Sicherheitsaudits
- Performance-Analyse
- Refactoring-Vorschläge

**Beispiel-Workflows:**
```
> "Review diese Pull Request"
> "Finde potenzielle Bugs in dieser Datei"
> "Analysiere die Komplexität dieser Funktion"
> "Prüfe auf Sicherheitslücken"
> "Gib mir Verbesserungsvorschläge"
```

---

### 5. `release` - Release-Agent

**Typ:** Specialized
**Modell:** mistral-large (konfigurierbar)
**Zweck:** Release-Management, Versionierung

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Vollständiger Zugriff | ✅ (für Release) |
| Spezialisierte Tools | version_*, release_*, quality_*, changelog_* |
| Berechtigungen | Voll (für Release-Aufgaben) |
| System-Prompt | Release-fokussiert |

**Verwendung:**
```bash
ultracode --agent release
```

**In Session:**
```
> /agents release
```

**Spezialisierung:**
- Integration mit AI-Versionierungssystem
- Automatische Release-Planung
- Quality Gate Ausführung
- Changelog-Generierung
- CI/CD-Integration

**Empfohlen für:**
- Release-Management
- Versionierung
- Quality Assurance
- CI/CD-Pipelines
- Deployment-Vorbereitung

**Beispiel-Workflows:**
```
> "Analysiere Änderungen seit dem letzten Release"
> version_analyze(since="last-release")

> "Schlage neue Version vor"
> version_suggest()

> "Erstelle Release-Plan"
> release_plan(version="1.2.0", target_date="2026-06-15")

> "Führe alle Quality Gates aus"
> quality_check(strict=true)

> "Veröffentliche Release"
> release_publish(version="1.2.0", channel="stable")
```

---

### 6. `security` - Sicherheits-Agent

**Typ:** Specialized
**Modell:** mistral-large (konfigurierbar)
**Zweck:** Sicherheitsprüfungen, Vulnerability Scanning

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Vollständiger Zugriff | ❌ |
| Deaktivierte Tools | write_file, edit, bash |
| Spezialisierte Tools | grep, glob, code_analysis, lsp_diagnostics |
| System-Prompt | Sicherheitsfokussiert |

**Verwendung:**
```bash
ultracode --agent security
```

**In Session:**
```
> /agents security
```

**Spezialisierung:**
- Optimiert für Sicherheitsprüfungen
- Automatisches Scannen nach Vulnerabilities
- Integration mit Security-Tools
- Detaillierte Sicherheitsberichte

**Empfohlen für:**
- Sicherheitsaudits
- Vulnerability Scanning
- Code Security Review
- Compliance Checks

**Beispiel-Workflows:**
```
> "Scanne Projekt nach Sicherheitslücken"
> "Analysiere Abhängigkeiten auf Vulnerabilities"
> "Prüfe auf Hardcoded Secrets"
> "Finde unsichere Code-Patterns"
> "Erstelle Sicherheitsbericht"
```

---

### 7. `general` - Allgemeiner Subagent

**Typ:** Subagent
**Modell:** mistral-medium (konfigurierbar)
**Zweck:** Delegation, parallele Aufgaben

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Lebensdauer | Task-basiert |
| Vollständiger Zugriff | ❌ (begrenzt) |
| Deaktivierte Tools | write_file, edit, bash |
| System-Prompt | Delegationsfokussiert |

**Verwendung:**
```typescript
// Automatisch vom Agent Manager verwendet
> task(task="Analysiere Backend", agent="general")
```

**Spezialisierung:**
- Optimiert für Delegation
- Kurze Lebensdauer
- Spezifische Aufgabenausführung
- Ergebnisse an Parent-Agent zurückmelden

**Empfohlen für:**
- Parallele Aufgaben
- Hintergrundaufgaben
- Spezialisierte Analysen
- Lastverteilung

---

### 8. `explore` - Explorations-Subagent

**Typ:** Subagent
**Modell:** mistral-medium (konfigurierbar)
**Zweck:** Code-Exploration, tiefgehende Analyse

| **Eigenschaft** | **Wert** |
|----------------|----------|
| Lebensdauer | Task-basiert |
| Vollständiger Zugriff | ❌ (nur Lesen) |
| Deaktivierte Tools | write_file, edit, bash |
| System-Prompt | Explorationsfokussiert |

**Verwendung:**
```typescript
// Automatisch vom Agent Manager verwendet
> task(task="Exploriere das Frontend", agent="explore")
```

**Spezialisierung:**
- Optimiert für Code-Exploration
- Tiefgehende Analyse
- Automatische Code-Struktur-Erkennung
- Pattern Matching

**Empfohlen für:**
- Codebase-Exploration
- Architektur-Analyse
- Pattern-Erkennung
- Dokumentationsgenerierung

---

## 🎭 Agent-Typen im Detail

---

### Default Agents

**Eigenschaften:**
- Vollständiger Zugriff auf alle Tools
- Volle Berechtigungen
- Längere Lebensdauer (Session)
- Für allgemeine Nutzung

**Beispiele:** `default`, `build`

**Verwendung:**
```typescript
// Agent erstellen
const agent = await agentManager.getAgent('default', context);

// Agent ausführen
const result = await agent.execute(query, context);
```

---

### Specialized Agents

**Eigenschaften:**
- Eingeschränkter Tool-Zugriff
- Spezialisierte System-Prompts
- Optimiert für bestimmte Aufgaben
- Können volle Berechtigungen haben (z.B. `release`)

**Beispiele:** `plan`, `review`, `release`, `security`

**Verwendung:**
```typescript
// Spezialisierten Agent auswählen
> /agents review

// Spezialisierte Aufgabe
> "Review diesen Code"
```

---

### Subagents

**Eigenschaften:**
- Kurze Lebensdauer (Task-basiert)
- Von Parent-Agent erstellt
- Spezifische Aufgabe
- Ergebnisse an Parent zurückmelden

**Beispiele:** `general`, `explore`

**Verwendung:**
```typescript
// Subagent erstellen
> task(task="Analysiere die API", agent="general")

// Oder direkt
const subagent = await agentManager.createSubagent('build', 'Analysiere Dokumentation', context);
```

---

### Custom Agents

**Eigenschaften:**
- Benutzerdefiniert
- Beliebige Konfiguration
- Beliebige Tools
- Beliebiges System-Prompt

**Erstellung:**

```typescript
// Benutzerdefinierter Agent
const customAgent: AgentConfig = {
  id: 'my-security-agent',
  name: 'My Security Agent',
  type: 'custom',
  model: 'mistral-large',
  provider: 'mistral',
  systemPromptId: 'security',
  disabledTools: ['write_file', 'edit', 'bash'],
  enabledTools: ['read', 'grep', 'glob', 'code_analysis', 'lsp_diagnostics'],
  temperature: 0.3,
  maxTokens: 40000,
};

// Registrieren
await agentManager.registerAgent(customAgent);

// Verwenden
> /agents my-security-agent
```

**System-Prompt erstellen:**
```markdown
# My Security Agent

Du bist ein Sicherheits-Experte. Deine Aufgaben:
1. Analysiere Code auf Sicherheitslücken
2. Finde Vulnerabilities
3. Gib detaillierte Empfehlungen
4. Sei besonders vorsichtig

Wichtige Regeln:
- Frage nach, wenn du unsicher bist
- Erkläre immer deine Entscheidungen
- Verwende die verfügbaren Security-Tools
```

---

## 🔄 Agent-Lebenszyklus

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENTEN-LEBENSZYKLUS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│  │  INIT    │────▶│  READY   │────▶│ EXECUTING│────▶│ CLEANUP  │          │
│  │          │     │          │     │          │     │          │          │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘          │
│       │               │               │               │              │
│       ▼               ▼               ▼               ▼              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                          │ │
│  │  INIT PHASE:                                                           │ │
│  │    • Konfiguration laden                                               │ │
│  │    • System-Prompt laden                                               │ │
│  │    • Tools validieren                                                 │ │
│  │    • Provider initialisieren                                            │ │
│  │    • Memory vorbereiten                                               │ │
│  │    • Kontext initialisieren                                            │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  READY PHASE:                                                          │ │
│  │    • Auf Ausführung warten                                             │ │
│  │    • Kontext vorbereiten                                               │ │
│  │    • Tools laden (lazy)                                                │ │
│  │    • Berechtigungen prüfen                                             │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  EXECUTING PHASE:                                                     │ │
│  │    • Anfrage parsen                                                    │ │
│  │    • Kontext aktualisieren                                              │ │
│  │    • LLM abfragen                                                      │ │
│  │    • Tools ausführen                                                   │ │
│  │    • Subagenten erstellen (falls nötig)                                │ │
│  │    • Ergebnisse aggregieren                                             │ │
│  │    • Antwort formatieren                                                │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  CLEANUP PHASE:                                                       │ │
│  │    • Subagenten bereinigen                                             │ │
│  │    • Session speichern (falls aktiv)                                   │ │
│  │    • Cache bereinigen                                                  │ │
│  │    • Ressourcen freigeben                                               │ │
│  │                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎛️ Agent-Wechsel in der Session

### Slash-Kommando

```
> /agents
# Zeigt verfügbare Agenten an

> /agents build
# Wechselt zu 'build' Agent

> /agents review
# Wechselt zu 'review' Agent

> /agents default
# Wechselt zurück zu Standard-Agent
```

### Shortcut

```
Drücke Shift+Tab, um zwischen Agenten zu wechseln
```

### Automatischer Agent-Wechsel

UltraCode kann **automatisch den Agenten wechseln** basierend auf:

1. **Aufgaben-Typ**
   ```
   > "Review diesen Code"
   # → Automatisch zu 'review' Agent
   ```

2. **Kontext**
   ```
   > "Ich möchte eine neue Funktion erstellen"
   # → Automatisch zu 'build' Agent
   ```

3. **Benutzerpräferenz**
   ```toml
   [core]
   auto_agent_switch = true
   ```

---

## 📊 Agenten-Vergleich

| **Agent** | **Typ** | **Modell** | **Tools** | **Berechtigungen** | **Lebensdauer** | **Empfohlen für** |
|-----------|---------|------------|-----------|-------------------|-----------------|-------------------|
| default | Default | mistral-large | Alle | Voll | Session | Allgemein |
| build | Default | mistral-large | Alle | Voll | Session | Entwicklung |
| plan | Default | mistral-medium | Lesen | Eingeschränkt | Session | Analyse |
| review | Specialized | mistral-large | Analyse-Tools | Eingeschränkt | Session | Code Review |
| release | Specialized | mistral-large | Version-Tools | Voll | Session | Release |
| security | Specialized | mistral-large | Sicherheits-Tools | Eingeschränkt | Session | Sicherheit |
| general | Subagent | mistral-medium | Lesen | Eingeschränkt | Task | Delegation |
| explore | Subagent | mistral-medium | Lesen | Eingeschränkt | Task | Exploration |
| Benutzerdefiniert | Custom | variiert | Konfigurierbar | Konfigurierbar | Session | Individuell |

---

## 🛠️ Benutzerdefinierte Agenten erstellen

### Schritt 1: Agent-Konfiguration erstellen

```typescript
// packages/core/src/agents/BuiltInAgents/MyCustomAgent.ts

import { BaseAgent } from '../BaseAgent';
import type { AgentConfig } from '../AgentTypes';
import type { ITool } from '../../tools/ToolTypes';
import type { IProvider } from '../../providers/BaseProvider';
import type { IMemory } from '../../memory/MemoryManager';

export const myCustomAgentConfig: AgentConfig = {
  id: 'my-custom-agent',
  name: 'My Custom Agent',
  type: 'custom',
  model: 'mistral-large',
  provider: 'mistral',
  systemPromptId: 'custom-agent',
  disabledTools: ['write_file', 'edit', 'bash'],
  enabledTools: ['read', 'grep', 'glob', 'code_analysis'],
  temperature: 0.5,
  maxTokens: 40000,
  timeout: 300,
};

// Benutzerdefinierter Agent
import { toolRegistry } from '../../tools/ToolRegistry';
import { providerRegistry } from '../../providers/ProviderRegistry';
import { memoryManager } from '../../memory/MemoryManager';

export class MyCustomAgent extends BaseAgent {
  constructor() {
    const tools = toolRegistry.list().filter(tool => 
      myCustomAgentConfig.enabledTools.includes(tool.name) &&
      !myCustomAgentConfig.disabledTools.includes(tool.name)
    );
    const provider = providerRegistry.get(myCustomAgentConfig.provider);
    
    super(
      myCustomAgentConfig,
      tools,
      provider,
      memoryManager
    );
  }
  
  // Überschreibe execute für benutzerdefinierte Logik
  async execute(query: string, context: ExecutionContext): Promise<ExecutionResult> {
    // Benutzerdefinierte Vorverarbeitung
    const preprocessedQuery = this.preprocessQuery(query);
    
    // Standard execute
    return super.execute(preprocessedQuery, context);
  }
  
  private preprocessQuery(query: string): string {
    // Benutzerdefinierte Vorverarbeitung
    return query;
  }
}
```

### Schritt 2: Agent registrieren

```typescript
// In der Initialisierung
import { agentRegistry } from '../AgentRegistry';
import { myCustomAgentConfig } from './BuiltInAgents/MyCustomAgent';

// Konfiguration registrieren
agentRegistry.register(myCustomAgentConfig);

// Oder Agent-Klasse direkt registrieren
// agentRegistry.registerAgent(new MyCustomAgent());
```

### Schritt 3: System-Prompt erstellen

```markdown
# My Custom Agent

Du bist mein benutzerdefinierter Agent. Deine Aufgaben:
- Analysiere Code
- Gib klare Empfehlungen
- Sei präzise und hilfreich

Wichtige Regeln:
- Verwende nur die verfügbaren Tools
- Frage nach, wenn du unsicher bist
- Dokumentiere deine Entscheidungen
```

---

## 📖 Nächste Schritte

- [Tools-Referenz →](./tools-reference.md) – Alle Tools im Detail
- [Architektur →](./architecture.md) – Systemdesign
- [Core-System →](./core-system.md) – Kernfunktionen
- [Konfiguration →](../GETTING-STARTED/configuration.md) – Agenten konfigurieren
