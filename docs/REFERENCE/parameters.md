# Parameter-Katalog (ausgelagerte Defaults)

> **Vollständiger, kategorisierter Katalog ALLER ausgelagerten Magic-Werte / Default-Parameter der fünf Module — extrahiert nach `defaults.ts` pro Modul. Werte sind 1:1 reproduziert; die Auslagerung ändert kein Verhalten.**

Module und ihre Default-Dateien:

| Modul | `defaults.ts` |
|-------|---------------|
| budget | `packages/core/src/budget/defaults.ts` |
| learning | `packages/core/src/learning/defaults.ts` |
| session-optimizer | `packages/core/src/session-optimizer/defaults.ts` |
| authoring | `packages/core/src/authoring/defaults.ts` |
| tokens | `packages/core/src/tokens/defaults.ts` |

---

## Wie man Parameter überschreibt

Es gibt zwei Wege, abhängig davon, ob ein Parameter als **überschreibbar** markiert ist (Spalte „Überschreibbar via").

### 1. Factory-Options (überschreibbare Parameter)

Jedes Modul exportiert eine Factory-Funktion, die ein Options-Objekt entgegennimmt. Fehlt eine Option, fällt die Factory auf die jeweilige Konstante aus `defaults.ts` zurück. Nur die in den Tabellen als überschreibbar markierten Konstanten haben einen solchen Options-Pfad.

| Modul | Factory | Options-Typ |
|-------|---------|-------------|
| budget | `createBudgetPlanner(opts)` | `BudgetPlannerOptions` |
| learning | `createLearnAgent(opts)` | `LearnAgentOptions` (+ `NativeCrawlerOptions`, `DistillOptions`) |
| session-optimizer | `createSessionOptimizer(opts)` | `SessionOptimizerOptions` |
| authoring | `createAuthoring(opts)` | `AuthoringOptions` |
| tokens | `createDefaultOptimizer(opts)` | `CreateDefaultOptimizerOptions` / `TokenOptimizerOptions` |

Beispiel (learning):

```ts
import { createLearnAgent } from "@ultracode/core";

// Default: DEFAULT_CONCURRENCY = 4, DEFAULT_CHUNK_TOKENS = 512
const agent = createLearnAgent({
  homeDir: "/tmp/uc",
  concurrency: 8,        // überschreibt DEFAULT_CONCURRENCY
  chunkTokens: 1024,     // überschreibt DEFAULT_CHUNK_TOKENS
});
```

Dynamische Seeds (learning): Der `SourceLibrary`-Konstruktor nimmt optional ein `seeds`-Override; ohne Argument greift `SEED_SOURCES` aus `defaults.ts`.

```ts
import { SourceLibrary, SEED_SOURCES } from "@ultracode/core";

// Standard: SEED_SOURCES
const lib = new SourceLibrary();

// Erweiterter Seed-Satz ohne Änderung der Defaults
const custom = new SourceLibrary(homeDir, logger, [
  ...SEED_SOURCES,
  { id: "react-docs", url: "https://react.dev/", type: "web-docs",
    catalog: "react", schedule: "on-demand", localeDefault: "en" },
]);
```

### 2. Config / Pricing-Tabellen (überschreibbare Tabellen)

Tabellenartige Defaults (z. B. `DEFAULT_PRICE_TABLE`, `DEFAULT_PLAN_ENVELOPES`, `DEFAULT_ROUTING`) werden ebenfalls über Factory-Options bzw. die jeweilige Plan-/Config-Datei (`plan.toml`, `sources.toml`) überschrieben. Nicht-überschreibbare Konstanten sind rein interne Tuning-/Struktur-Werte und werden bewusst nicht als Option durchgereicht.

> **Hinweis:** HTTP-Statuscodes (z. B. `304`, `429`, `5xx`), Array-Index-Parität (`i % 2`), Markdown-Fence-Längen (` ```{3,} `) und ähnliche Protokoll-/Struktur-Konstanten sind **keine** tunable Parameter und bleiben bewusst inline.

---

## budget — `packages/core/src/budget/defaults.ts`

### Cost-formula factors
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `OVERHEAD_FACTOR` | `1.2` | — |
| `RETRY_FACTOR` | `1.1` | — |
| `BATCH_FACTOR` | `0.5` | — |
| `DEFAULT_SAFETY_FACTOR` | `2.0` | Factory-Options |

### FX & estimate band
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_FX_RATE` | `0.92` | Factory-Options |
| `USD_LOW_FACTOR` | `0.85` | — |
| `USD_HIGH_FACTOR` | `1.25` | — |

### Rounding / token scale
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `ROUND_SCALE` | `1e6` | — |
| `TOKENS_PER_MILLION` | `1e6` | — |

### Date slicing
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DAY_KEY_LENGTH` | `10` | — |
| `MONTH_KEY_LENGTH` | `7` | — |

### Alerts
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `ALERT_BANDS` | `[50, 80, 100]` | — |

### Pricing
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_MODEL` | `"mistral-small"` | — |
| `FREE_PRICE` | `{ inputPerMTok: 0, outputPerMTok: 0 }` | — |
| `DEFAULT_PRICE_TABLE` | `mistral-small 0.05/0.15`, `claude-3-5-haiku 0.5/2.5`, `claude-3-5-sonnet 1.5/7.5`, `haiku 0.5/2.5`, `sonnet 1.5/7.5`, `local FREE`, `ollama FREE` | Factory-Options |

### Paths / filenames
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `PLAN_FILENAME` | `"plan.toml"` | — |
| `LEDGER_FILENAME` | `"ledger.jsonl"` | — |
| `BUDGET_DIR_ROOT` | `".ultracode"` | — |
| `BUDGET_DIR_NAME` | `"budget"` | — |

### Plan policy & defaults
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_PLAN_POLICY` | `"ask-threshold"` | — |

### Seeds: installDefaultPlan envelopes
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_PLAN_ENVELOPES` | `development`: perRun 2 / daily 10 / monthly 100 / total null / ask 0.5; `learning`: 5 / 15 / 50 / 200 / 1; `operations`: 1 / 5 / 30 / null / 0.25 | Factory-Options |

### Seeds: planInteractive wizard fallbacks
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `WIZARD_DEFAULT_ASK_THRESHOLD_USD` | `0.5` | Factory-Options |
| `WIZARD_DEVELOPMENT_MONTHLY_USD` | `100` | Factory-Options |
| `WIZARD_LEARNING_MONTHLY_USD` | `50` | Factory-Options |
| `WIZARD_OPERATIONS_MONTHLY_USD` | `30` | Factory-Options |
| `WIZARD_DEVELOPMENT_PER_RUN_USD` | `2` | — |
| `WIZARD_LEARNING_PER_RUN_USD` | `5` | — |
| `WIZARD_OPERATIONS_PER_RUN_USD` | `1` | — |
| `WIZARD_DAILY_FROM_MONTHLY_DIVISOR` | `10` | — |

---

## learning — `packages/core/src/learning/defaults.ts`

### Limits
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_MAX_CANDIDATES` | `6000` | Factory-Options |
| `DEFAULT_MAX_SHARDS` | `64` | Factory-Options |
| `MAX_FACTS` | `50` | — |
| `MAX_CODE_SNIPPETS` | `20` | — |
| `SUMMARY_CHUNK_COUNT` | `3` | — |
| `SUMMARY_MAX_CHARS` | `1000` | — |
| `DETERMINISTIC_SUMMARY_SENTENCES` | `2` | — |
| `DETERMINISTIC_SUMMARY_MAX_CHARS` | `400` | — |
| `TOC_WALK_GUARD` | `1_000_000` | — |

### Timeouts / Retries
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_MAX_RETRIES` | `3` | Factory-Options |
| `DEFAULT_BACKOFF_BASE_MS` | `200` | Factory-Options |
| `BACKOFF_FACTOR` | `2` | — |
| `DEFAULT_CONCURRENCY` | `4` | Factory-Options |
| `CHECKPOINT_INTERVAL` | `100` | — |

### Sizing / Chunking
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_CHUNK_TOKENS` | `512` | Factory-Options |
| `DEFAULT_OVERLAP` | `0.1` | Factory-Options |
| `MAX_OVERLAP` | `0.9` | — |
| `CHARS_PER_TOKEN` | `4` | — |

### Pricing / Planning
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `PER_PAGE_TOKENS_IN` | `1200` | — |
| `PER_PAGE_TOKENS_OUT` | `300` | — |
| `ROUND_USD_SCALE` | `1e4` | — |

### Routing weights
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_ROUTE_MODEL` | `"cheap"` | — |
| `ROUTING_WINDOW` | `100` | — |
| `DEFAULT_ROUTING` | `[{cheap,0.8},{standard,0.15},{premium,0.05}]` | Factory-Options |

### Crawler identity / locale
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_USER_AGENT` | `"ultracode-learn/1.0"` | Factory-Options |
| `DEFAULT_LOCALE` | `"de-de"` | Factory-Options |

### Seeds
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SEED_SOURCES` | `[azure-docs, azure-training, pytest-docs]` (on-demand `LearnSource[]`) | `SourceLibrary`-Konstruktor (`seeds`-Argument) |

### Paths
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `HOME_STATE_DIRNAME` | `".ultracode"` | — |
| `LEARNING_DIRNAME` | `"learning"` | — |
| `STATE_DIRNAME` | `"state"` | — |
| `SOURCES_FILENAME` | `"sources.toml"` | — |

### Default-name fallbacks
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_CATALOG` | `"default"` | — |
| `DEFAULT_SCHEDULE` | `"on-demand"` | — |
| `DEFAULT_TOPIC` | `"doc"` | — |

### Parser tables
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `NOISE_PARAMS` | `Set(view, toc, tabs, pivots, branch, preserve-view, wt.mc_id)` | — |
| `NAMED_ENTITIES` | Record mit 18 HTML-Entities (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`=U+00A0, `copy`, `reg`, `hellip`, `mdash`, `ndash`, `rsquo`, `lsquo`, `ldquo`, `rdquo`, `euro`, `trade`, `deg`) | — |

---

## session-optimizer — `packages/core/src/session-optimizer/defaults.ts`

### Thresholds
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_MIN_MESSAGES` | `12` | Factory-Options |
| `DEFAULT_RECENT_KEEP` | `8` | Factory-Options |
| `DEFAULT_SUMMARY_MAX_CHARS` | `4000` | Factory-Options |
| `DEFAULT_ENABLE_LLM_SUMMARY` | `false` | Factory-Options |

### Paths & Categories
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SIDECAR_ROOT` | `~/.ultracode/sessions-opt` | — |
| `BUDGET_CATEGORY` | `operations` | — |
| `SIDECAR_FILENAME_UNSAFE_RE` | `/[^A-Za-z0-9._-]/g` | — |

### Dedup
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEDUP_MIN_CONTENT_CHARS` | `80` | — |
| `DEDUP_BACKREF_TEMPLATE` | `[duplicate of an earlier {role} message — content elided]` | — |

### Summarisation
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `FIRST_SENTENCE_MAX_CHARS` | `160` | — |
| `SENTENCE_BOUNDARY_RE` | `/[.!?](?:\s\|$)/` | — |
| `LLM_SUMMARY_SYSTEM_PROMPT` | `Summarise the following conversation turns into a terse, factual running summary. Preserve decisions, file paths, identifiers and open tasks.` | — |
| `LLM_SUMMARY_BUDGET_NOTE` | `session-optimizer rolling summary` | — |
| `LLM_SUMMARY_MAX_TOKENS` | `512` | — |
| `LLM_SUMMARY_TEMPERATURE` | `0` | — |

### Cheap-model routing
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `CHEAP_MODEL_ROUTES` | `anthropic → claude-3-5-haiku-latest`, `openai → gpt-4o-mini`, `mistral → mistral-small-latest` | — |

### Pinned limits
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `MAX_FACT_CHARS` | `200` | — |
| `MAX_FACTS` | `64` | — |
| `CODE_SYMBOL_MIN_CHARS` | `3` | — |

### Pinned patterns
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `FILE_PATH_RE` | `/(?:[A-Za-z]:\\\|\.{0,2}[/\\])?(?:[\p{L}\p{N}.@_-]+[/\\])+[\p{L}\p{N}.@_-]+\.[A-Za-z][A-Za-z0-9]{0,9}/gu` | — |
| `BARE_FILE_RE` | `/[\p{L}\p{N}_-]+\.(?:[A-Za-z][A-Za-z0-9]{0,9})\b/gu` | — |
| `VERSION_RE` | `/\bv?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/g` | — |
| `IDENTIFIER_RE` | `/(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:\(\))?/g` | — |
| `DECISION_RE` | `/(?:^\|[\s.;])((?:decided\|decide\|chosen\|choose\|chose\|use\|using\|adopt(?:ed)?\|pick(?:ed)?\|go with\|selected\|prefer(?:red)?)\b[^.!?\n]{0,180})/gi` | — |
| `TODO_RE` | `/\b(?:TODO\|FIXME\|XXX\|HACK\|next step\|open task\|action item)\b[^.\n]{0,180}/gi` | — |

---

## authoring — `packages/core/src/authoring/defaults.ts`

### Tools
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEFAULT_ALLOWED_TOOLS` | `[read, grep, glob, write, edit, bash, git_status, git_diff, git_log]` | Factory-Options |
| `INFER_TOOLS_BASE` | `[read, grep]` | — |

### Budget / Refinement
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `AUTHORING_CATEGORY` | `development` | — |
| `DEFAULT_MODEL` | `local` | Factory-Options |

### Versioning
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `INITIAL_SKILL_VERSION` | `1.0.0` | — |
| `FALLBACK_SKILL_VERSION` | `1.0.0` | — |
| `SKILL_UPGRADE_RELEASE` | `minor` | — |
| `UNKNOWN_FROM_VERSION` | `0.0.0` | — |

### Limits / Sizes
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SLUG_MAX_LENGTH` | `64` | — |
| `HEURISTIC_DESCRIPTION_MAX_LENGTH` | `160` | — |
| `DEFAULT_MAX_SKILLS` | `3` | Factory-Options |
| `DEFAULT_MAX_CHARS` | `4000` | Factory-Options |
| `CLIP_MIN_BUDGET_FRACTION` | `0.6` | — |

### Scoring weights
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SCORE_DESCRIPTION_MAX` | `25` | — |
| `SCORE_DESCRIPTION_TARGET_LENGTH` | `80` | — |
| `SCORE_TRIGGERS_MAX` | `25` | — |
| `SCORE_TRIGGERS_TARGET` | `4` | — |
| `SCORE_SOURCES_MAX` | `20` | — |
| `SCORE_SOURCES_TARGET` | `3` | — |
| `SCORE_BODY_MAX` | `20` | — |
| `SCORE_BODY_TARGET_LENGTH` | `600` | — |
| `SCORE_STATUS_ACTIVE` | `10` | — |
| `SCORE_STATUS_DRAFT` | `5` | — |
| `SCORE_STATUS_DEPRECATED` | `0` | — |
| `SCORE_MIN` | `0` | — |
| `SCORE_MAX` | `100` | — |

### Paths
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SKILLS_ROOT` | `~/.ultracode/skills` | — |
| `AGENTS_DIR` | `~/.ultracode/agents` | — |
| `AUTHORING_DIR` | `~/.ultracode/authoring` | — |
| `AUDIT_FILENAME` | `audit.jsonl` | — |

### Injection / Headers
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SKILL_CONTEXT_HEADER` | `## Active skills` | — |

### Regexes
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SAFE_SEGMENT` | `/^[A-Za-z0-9._-]+$/` | — |

### Seeds
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `FORBIDDEN_PHRASES` | 18-Phrasen-Blocklist für schädliche Instruktionen (`ignore previous instructions`, `exfiltrate`, `rm -rf /`, `jailbreak`, `base64 -d`, …) | — |
| `STOPWORDS` | 17-Wort-Stopword-Liste (`this`, `that`, `with`, `from`, …, `skill`, `knowledge`) | — |

---

## tokens — `packages/core/src/tokens/defaults.ts`

### Limits
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `ANTHROPIC_MAX_CACHE_BREAKPOINTS` | `4` | — |
| `PREFIX_KEY_HEX_LENGTH` | `32` | — |
| `BLOCK_HASH_HEX_LENGTH` | `16` | — |
| `DEFAULT_TOOL_DESC_MAX` | `200` | Factory-Options |
| `DEFAULT_KEEP_HEAD` | `2` | Factory-Options |
| `KEEP_HEAD_FLOOR` | `0` | — |
| `DEFAULT_KEEP_TAIL` | `6` | Factory-Options |
| `KEEP_TAIL_FLOOR` | `1` | — |

### Summarizer
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `SUMMARIZER_TRANSCRIPT_MAX_CHARS` | `8000` | — |
| `SUMMARIZER_MAX_TOKENS` | `512` | — |
| `SUMMARIZER_SYSTEM_PROMPT` | `Summarize the following conversation excerpt in at most 5 bullet points. Preserve decisions, facts and open questions. Do not invent content.` | — |

### Counter weights & factors
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `PER_MESSAGE_OVERHEAD` | `4` | — |
| `PER_TOOL_CALL_OVERHEAD` | `8` | — |
| `WORD_WEIGHT` | `0.5` | — |
| `CHARS_PER_TOKEN` | `4` | — |
| `WORD_TO_TOKEN` | `1.3` | — |
| `PUNCTUATION_PENALTY` | `0.3` | — |
| `CJK_OR_ASTRAL_PENALTY` | `1.2` | — |
| `MIN_TOKENS_NON_EMPTY` | `1` | — |

### Markers & placeholders
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `DEDUP_PLACEHOLDER` | `[identical to block above]` | — |
| `DEFAULT_IMMUTABLE_OPEN` | `<!--immutable-->` | Factory-Options |
| `DEFAULT_IMMUTABLE_CLOSE` | `<!--/immutable-->` | Factory-Options |

### Events
| Name | Default | Überschreibbar via |
|------|---------|--------------------|
| `TOKENS_OPTIMIZED_EVENT` | `tokens.optimized` | — |

---

## Garantien

- **Verhalten unverändert:** Alle Werte sind exakt aus dem bisherigen Inline-Code übernommen; die Auslagerung nach `defaults.ts` ändert keine Default-Werte.
- **Überschreibbare Parameter** behalten ihren Options-Pfad; fehlt die Option, greift die Konstante als Fallback.
- **Nicht-überschreibbare Konstanten** sind interne Tuning-/Struktur-Werte ohne öffentlichen Override.
