# Agenten-Referenz

> **Alle eingebauten Agenten, ihre Konfiguration und eigene Agenten – aus dem tatsächlichen Code (`packages/core/src/agents`).**

---

## Überblick

Ein Agent koppelt ein System-Prompt mit einer Modell-/Provider-Auswahl und einer erlaubten Tool-Menge und verwandelt einen Prompt in eine Antwort. Die `AgentManager`-Klasse (`packages/core/src/agents/AgentManager.ts`) hält alle Definitionen (Built-ins plus Konfigurations- und Laufzeit-Registrierungen) vor.

### `AgentDefinition`

Aus `packages/shared/src/types/agent.ts`:

```typescript
type AgentType = "default" | "subagent" | "specialized" | "custom";

interface AgentDefinition {
  name: string;
  description: string;
  type: AgentType;
  model?: string;          // Modell-Override; sonst aktives Modell
  systemPromptId?: string; // ID des eingebetteten System-Prompts
  enabledTools?: string[]; // Allow-List, überschreibt disabledTools
  disabledTools?: string[];// Deny-List
}
```

`enabledTools` und `disabledTools` unterstützen `*`-Wildcards (z. B. `git_*`). Ist `enabledTools` gesetzt, wirkt es als Allow-List und überschreibt `disabledTools` (Logik in `toolFilter.ts` → `toolPredicateFor`).

---

## Eingebaute Agenten

Definiert in `BUILT_IN_AGENTS` (`packages/core/src/agents/builtins.ts`). Die System-Prompts sind als TypeScript-Konstanten eingebettet, sodass das Paket ohne Prompt-Verzeichnis funktioniert.

| Name | Typ | System-Prompt-ID | Tool-Beschränkung |
|------|-----|------------------|-------------------|
| `default` | `default` | `default` | keine (voller Tool-Zugriff) |
| `build` | `default` | `build` | keine (voller Tool-Zugriff) |
| `plan` | `specialized` | `plan` | `disabledTools`: `write_file`, `edit`, `delete_file`, `bash` (read-only) |
| `review` | `specialized` | `review` | `disabledTools`: `write_file`, `edit`, `delete_file` (keine Dateimutation) |
| `release` | `specialized` | `release` | keine |
| `security` | `specialized` | `security` | `enabledTools`: `read`, `grep`, `glob`, `git_*` (Allow-List) |

### Agenten im Detail

- **`default`** – General-purpose software engineering agent with full tool access. Verifiziert Fakten mit Tools, bevorzugt minimale, fokussierte Änderungen, liest vor dem Schreiben.
- **`build`** – Development agent for implementing features and fixing bugs (full tool access). Arbeitet nach Verstehen → Plan → Umsetzen → Verifizieren; aktualisiert Tests neben Verhaltensänderungen.
- **`plan`** – Read-only architecture and planning agent. Datei-schreibende und Shell-Tools sind per Design deaktiviert; liefert Kontext, Vorgehen, betroffene Dateien, Risiken.
- **`review`** – Code-review agent (no file mutation). Priorisiert Korrektheit, Sicherheit, Robustheit, Wartbarkeit; gruppiert Findings nach Schweregrad.
- **`release`** – Release-management and versioning agent. Analysiert Änderungen seit dem letzten Release, schlägt Semantic-Versioning-Bumps vor, erstellt Release-Pläne, führt Quality-Gates aus.
- **`security`** – Security-audit agent (read, grep, glob and git tools only). Prüft Injection, Secrets, Input-Handling, AuthN/AuthZ, Krypto und Abhängigkeiten; modifiziert nie den Code.

Die System-Prompts sind über `SYSTEM_PROMPTS` keyed (Konstanten `DEFAULT_SYSTEM_PROMPT`, `BUILD_SYSTEM_PROMPT`, `PLAN_SYSTEM_PROMPT`, `REVIEW_SYSTEM_PROMPT`, `RELEASE_SYSTEM_PROMPT`, `SECURITY_SYSTEM_PROMPT`). Eine unbekannte `systemPromptId` fällt auf den `default`-Prompt zurück.

Live anzeigen:

```bash
ultracode agents list
ultracode agents list --json
```

Im interaktiven Modus: `/agents` bzw. `/agents <name>` (siehe [../REFERENCE/slash-commands.md](../REFERENCE/slash-commands.md)).

---

## Konfiguration eingebauter Agenten

Über `agents.agents.<name>` lassen sich eingebaute Agenten überschreiben (Schema `agentEntrySchema`, Merge in `AgentManager.mergeConfigEntry`):

| Schlüssel | Wirkung |
|-----------|---------|
| `activeModel` | Setzt `AgentDefinition.model` (Modell-Override). |
| `activeProvider` | Provider-Override für diesen Agenten. |
| `systemPromptId` | Wählt einen anderen eingebetteten/benutzerdefinierten Prompt. |
| `enabledTools` | Allow-List der Tools (überschreibt `disabledTools`). |
| `disabledTools` | Deny-List der Tools. |

Beispiel (`~/.ultracode/config.toml`):

```toml
[agents]
default = "build"

[agents.agents.review]
active_model = "mistral-large"
disabled_tools = ["write_file", "edit", "delete_file", "bash"]
```

Der Default-Agent wird über `agents.default` (Fallback `core.defaultAgent`, dann `"default"`) gewählt. Ein unbekannter Default-Agent erzeugt eine Warnung und fällt auf `default` zurück.

---

## Eigene Agenten

Agenten, die nur in der Konfiguration existieren, werden vom `AgentManager` beim Start automatisch als eigene Definition mit `type: "custom"` registriert:

```typescript
{
  name,
  description: `Custom agent "${name}" (from configuration)`,
  type: "custom",
}
```

Beispiel:

```toml
[agents.agents.docs]
system_prompt_id = "default"
disabled_tools = ["bash", "delete_file"]
active_model = "mistral-medium"
```

Damit steht ein Agent `docs` zur Verfügung (`ultracode run -p "…" --agent docs`). Zur Laufzeit lassen sich Definitionen über `AgentManager.register(definition)` registrieren oder ersetzen (invalidiert die gecachte Instanz).

---

## Tool-Filterung

Die effektive Tool-Menge eines Agenten ergibt sich aus `resolveEffectiveTools` (`toolFilter.ts`) gegen die Registry. Ein gefilterter `FilteredToolRunner` listet nur erlaubte Tools und lehnt nicht erlaubte mit einem `ok: false`-Ergebnis (serialisierter `ToolNotFoundError`) ab – ohne zu werfen. Pattern-Matching: `git_*` matcht `git_status`/`git_diff`/`git_log`, nicht aber `git`.

Die globale Permission-Schicht (`ask`/`always`/`never`, `tools.disabled`) bleibt zusätzlich aktiv – siehe [tools-reference.md](./tools-reference.md).

---

## Delegation

Der `AgentManager` unterstützt Subagenten-Delegation mit begrenzter Tiefe (`MAX_DELEGATION_DEPTH`) und begrenzter Parallelität (`DEFAULT_MAX_CONCURRENT_DELEGATIONS`, überschreibbar via `tools.perTool.task.maxConcurrent`).

---

## Weiterführend

- [tools-reference.md](./tools-reference.md) – Built-in-Tools und Permissions
- [../REFERENCE/configuration-options.md](../REFERENCE/configuration-options.md) – `agents.*`-Konfigurationsschlüssel
- [../REFERENCE/cli-commands.md](../REFERENCE/cli-commands.md) – `ultracode agents list`, `run --agent`
- [../REFERENCE/slash-commands.md](../REFERENCE/slash-commands.md) – `/agents`, `Shift+Tab`
