# Konfigurationsoptionen

> **Alle echten Config-Schlüssel mit Typ und Default – aus `DEFAULT_CONFIG` (`packages/shared/src/types/config.ts`) und dem Validierungs-Schema (`packages/core/src/config/schema.ts`).**

---

## Überblick

Die Konfiguration wird aus mehreren Schichten zusammengeführt und gegen ein zod-Schema validiert (`validateConfig` / `checkConfig`). Die TOML-Datei verwendet **snake_case** (`max_tokens`), die internen Interfaces **camelCase** (`maxTokens`); die Umwandlung übernimmt der Spec-Mapper (`packages/core/src/config/spec.ts`, `camelizeKey`/`snakeifyKey`). Unbekannte Schlüssel werden mit Warnung verworfen, harte Typfehler werden zu einem `ConfigError` mit präzisem Dotted-Path.

### Dateien und Pfade

| Konstante | Wert |
|-----------|------|
| `USER_CONFIG_DIR` | `~/.ultracode` |
| `USER_CONFIG_FILE` | `~/.ultracode/config.toml` |
| `USER_ENV_FILE` | `~/.ultracode/.env` |
| `ENV_PREFIX` | `ULTRACODE_` |

Pfade mit `~` werden plattformübergreifend zum jeweiligen Home-Verzeichnis aufgelöst (`resolveHome`).

### Inspektion

```bash
ultracode-ai config show        # aufgelöste Werte (Secrets maskiert)
ultracode-ai config get core.activeModel
ultracode-ai config set core.temperature 0.3
ultracode-ai config validate
```

---

## `core`

| Schlüssel (camelCase) | TOML (snake_case) | Typ | Default | Validierung |
|-----------------------|-------------------|-----|---------|-------------|
| `core.defaultAgent` | `default_agent` | string | `"default"` | nicht-leer |
| `core.activeModel` | `active_model` | string | `"mistral-large"` | nicht-leer |
| `core.activeProvider` | `active_provider` | string | `"mistral"` | nicht-leer |
| `core.language` | `language` | string | `"en"` | nicht-leer |
| `core.maxTokens` | `max_tokens` | number (int) | `32000` | positiv |
| `core.temperature` | `temperature` | number | `0.7` | 0 ≤ x ≤ 1 |
| `core.debug` | `debug` | boolean | `false` | – |
| `core.enableTelemetry` | `enable_telemetry` | boolean | `true` | – |
| `core.enableUpdateChecks` | `enable_update_checks` | boolean | `true` | – |

---

## `providers`

| Schlüssel | TOML | Typ | Default | Validierung |
|-----------|------|-----|---------|-------------|
| `providers.default` | `default` | string | `"mistral"` | nicht-leer |
| `providers.timeout` | `timeout` | number | `60` | positiv |
| `providers.maxRetries` | `max_retries` | number (int) | `3` | ≥ 0 |
| `providers.retryDelay` | `retry_delay` | number | `1` | ≥ 0 |
| `providers.proxy.enabled` | `proxy.enabled` | boolean | `false` | – |
| `providers.proxy.url` | `proxy.url` | string | *(unset)* | optional, nicht-leer |
| `providers.local.enabled` | `local.enabled` | boolean | `false` | – |
| `providers.local.endpoint` | `local.endpoint` | string | `"http://localhost:11434"` | nicht-leer |
| `providers.local.models` | `local.models` | string[] | `[]` | – |
| `providers.apiKeys` | – | record<string,string> | `{}` | **nur im Speicher**, nie persistiert/exportiert |

Unterstützte Provider: Mistral, OpenAI, Anthropic und ein lokaler (Ollama-kompatibler) Provider. `providers.local.endpoint` zeigt standardmäßig auf einen lokalen Ollama-Server.

> API-Keys gehören in `~/.ultracode/.env` oder die Umgebung, nicht in die TOML-Datei. `providers.apiKeys` ist ausschließlich ein In-Memory-Store und wird aus jeder persistierten/exportierten Form entfernt.

---

## `tools`

| Schlüssel | TOML | Typ | Default |
|-----------|------|-----|---------|
| `tools.disabled` | `disabled` | string[] | `[]` |
| `tools.enabled` | `enabled` | string[] | `[]` |
| `tools.perTool` | `[tools.<name>]` | record | `{}` |

### `tools.perTool.<name>`

Pro Tool konfigurierbar (Schema `perToolSchema`, offen für tool-spezifische Extras):

| Schlüssel | TOML | Typ | Beschreibung |
|-----------|------|-----|--------------|
| `permission` | `permission` | `"ask" \| "always" \| "never"` | Überschreibt die Default-Permission des Tools. |
| `timeout` | `timeout` | number (positiv) | Timeout in Sekunden. |
| `allowedDirs` | `allowed_dirs` | string[] | Erlaubte Verzeichnisse (Pfad-Beschränkung). |
| `protectedExtensions` | `protected_extensions` | string[] | Geschützte Dateiendungen (z. B. für `write_file`). |
| `maxMatches` | `max_matches` | number (int, positiv) | Max. Treffer (z. B. `grep`, `glob`). |
| `maxConcurrent` | `max_concurrent` | number (int, positiv) | Max. parallele Delegationen (`task`). |

Welche `perTool`-Optionen je Tool greifen, siehe [tools-reference.md](./tools-reference.md).

---

## `agents`

| Schlüssel | TOML | Typ | Default |
|-----------|------|-----|---------|
| `agents.default` | `default` | string | `"default"` |
| `agents.agents` | `[agents.<name>]` | record | `{}` |

### `agents.agents.<name>`

| Schlüssel | TOML | Typ |
|-----------|------|-----|
| `activeModel` | `active_model` | string (optional) |
| `activeProvider` | `active_provider` | string (optional) |
| `systemPromptId` | `system_prompt_id` | string (optional) |
| `enabledTools` | `enabled_tools` | string[] (optional) |
| `disabledTools` | `disabled_tools` | string[] (optional) |

Details zu Agenten und eigenen Agenten siehe [../DEVELOPMENT/agents-reference.md](../DEVELOPMENT/agents-reference.md).

---

## `ui`

| Schlüssel | TOML | Typ | Default |
|-----------|------|-----|---------|
| `ui.theme` | `theme` | enum | `"dark"` |
| `ui.colors.primary` | `colors.primary` | string | *(unset)* |
| `ui.colors.secondary` | `colors.secondary` | string | *(unset)* |
| `ui.colors.background` | `colors.background` | string | *(unset)* |
| `ui.colors.text` | `colors.text` | string | *(unset)* |
| `ui.colors.error` | `colors.error` | string | *(unset)* |

Erlaubte Theme-Werte (`KNOWN_THEMES`): `dark`, `light`, `dracula`, `solarized`, `monokai`, `custom`. Die interaktive UI liefert eingebaut `dark`, `light` und `dracula`; `custom` wird über `ui.colors` parametrisiert.

---

## `sessions`

| Schlüssel | TOML | Typ | Default | Validierung |
|-----------|------|-----|---------|-------------|
| `sessions.enablePersistence` | `enable_persistence` | boolean | `true` | – |
| `sessions.saveDir` | `save_dir` | string | `"~/.ultracode/sessions"` | nicht-leer |
| `sessions.timeout` | `timeout` | number (int) | `60` | ≥ 0 |
| `sessions.maxSessions` | `max_sessions` | number (int) | `50` | positiv |
| `sessions.compaction.enabled` | `compaction.enabled` | boolean | `true` | – |
| `sessions.compaction.threshold` | `compaction.threshold` | number (int) | `50` | positiv |
| `sessions.compaction.model` | `compaction.model` | string | `"mistral-medium"` | nicht-leer |

Session-Persistenz nutzt `node:sqlite` mit JSON-Fallback (siehe Memory-Stores in `packages/core/src/memory`).

---

## `git`

| Schlüssel | TOML | Typ | Default |
|-----------|------|-----|---------|
| `git.autoStatus` | `auto_status` | boolean | `true` |
| `git.autoCommit` | `auto_commit` | boolean | `false` |
| `git.commit.enabled` | `commit.enabled` | boolean | `true` |
| `git.commit.model` | `commit.model` | string | `"mistral-medium"` |
| `git.commit.template` | `commit.template` | string | `"conventional"` |
| `git.protection.protectedBranches` | `protection.protected_branches` | string[] | `["main", "master", "develop"]` |
| `git.protection.blockedTools` | `protection.blocked_tools` | string[] | `[]` |

---

## `versioning`

| Schlüssel | TOML | Typ | Default | Validierung |
|-----------|------|-----|---------|-------------|
| `versioning.enabled` | `enabled` | boolean | `true` | – |
| `versioning.strategy` | `strategy` | `"semantic" \| "date" \| "custom"` | `"semantic"` | enum |
| `versioning.semantic.autoSuggest` | `semantic.auto_suggest` | boolean | `true` | – |
| `versioning.semantic.prefix` | `semantic.prefix` | string | `"v"` | – |
| `versioning.channels` | `channels` | record<string,string> | `{ stable: "0.0.0", lts: "0.0.0", experimental: "0.0.0" }` | – |
| `versioning.quality.minCoverage` | `quality.min_coverage` | number | `80` | 0 ≤ x ≤ 100 |
| `versioning.quality.requireReview` | `quality.require_review` | boolean | `true` | – |
| `versioning.changelog.enabled` | `changelog.enabled` | boolean | `true` | – |
| `versioning.changelog.file` | `changelog.file` | string | `"CHANGELOG.md"` | nicht-leer |
| `versioning.changelog.model` | `changelog.model` | string | `"mistral-medium"` | nicht-leer |

Die AI-Versionierung (Change-Analysis, Version-Recommender, Release-Planning, Quality-Gates) ist real implementiert (`packages/core/src/versioning`) und nutzt Git. Siehe [../DEVELOPMENT/ai-versioning.md](../DEVELOPMENT/ai-versioning.md).

---

## `mcpServers`

Array von MCP-Server-Einträgen (`[[mcp_servers]]`, Schema `mcpServerSchema`); Default `[]`.

| Schlüssel | TOML | Typ | Pflicht |
|-----------|------|-----|---------|
| `name` | `name` | string | ja |
| `transport` | `transport` | `"http" \| "stdio"` | ja |
| `url` | `url` | string | bei `transport = "http"` |
| `command` | `command` | string | bei `transport = "stdio"` |
| `args` | `args` | string[] | nein |
| `apiKeyEnv` | `api_key_env` | string | nein |

Validierung: `http` erfordert `url`, `stdio` erfordert `command`.

---

## Umgebungsvariablen

Die Env-Schicht (`packages/core/src/config/env.ts`) liest zuerst `~/.ultracode/.env` und dann die Prozess-Umgebung (echte Umgebungsvariablen gewinnen).

### Provider-Keys

`MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` → `providers.apiKeys.<provider>` (nur im Speicher, nie persistiert).

### Shortcuts

| Variable | Ziel-Pfad |
|----------|-----------|
| `ULTRACODE_DEBUG` | `core.debug` |
| `ULTRACODE_THEME` | `ui.theme` |
| `ULTRACODE_PROVIDER` | `core.activeProvider` |
| `ULTRACODE_MODEL` | `core.activeModel` |

### Generisches Mapping

`ULTRACODE_<SECTION>__<KEY>` – doppelter Unterstrich (`__`) trennt Pfadsegmente, einfache Unterstriche innerhalb eines Segments werden zu camelCase. Beispiel: `ULTRACODE_CORE__MAX_TOKENS=16000` → `core.maxTokens`. Werte werden anhand des Default-Typs an der Zielstelle koerziert (Boolean/Number/Array/String); unbekannte Pfade werden mit Warnung ignoriert.

---

## Weiterführend

- [cli-commands.md](./cli-commands.md) – `ultracode config …`, `--setup`
- [tools-reference.md](./tools-reference.md) – `tools.*`-Optionen je Tool
- [../DEVELOPMENT/agents-reference.md](../DEVELOPMENT/agents-reference.md) – `agents.*`-Optionen
- [../GETTING-STARTED/configuration.md](../GETTING-STARTED/configuration.md) – Einstieg in die Konfiguration
