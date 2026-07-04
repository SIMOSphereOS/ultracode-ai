<!-- Interne Analyse / internal analysis — kein Kunden-Lieferobjekt. -->

> **DE:** Faktenbasierter Wettbewerbsvergleich. „UltraCode" beruht auf dem echten Code des Repos, die drei Wettbewerber auf Web-Recherche mit adversarialem Fakten-Check (Stand 2026-07-04). Eine visuell aufbereitete Fassung existiert als Artefakt.
> **EN:** Fact-based competitive comparison. "UltraCode" is grounded in the repo's actual code, the three competitors in web research with adversarial fact-checking (as of 2026-07-04). A visual version exists as an artifact.
>
> **Hinweis / Note:** Die im Vergleich als „nur Schema/fehlt" markierten Lücken (MCP-Client, Custom/OpenAI-kompatibler Endpoint inkl. LM Studio, LSP) werden aktuell testgetrieben geschlossen (Branch `feat/close-gaps`). Desktop-, Web- und IDE-Varianten sind bewusst **nicht** geplant. / The gaps marked "schema only/missing" (MCP client, custom OpenAI-compatible endpoint incl. LM Studio, LSP) are being closed test-driven (branch `feat/close-gaps`). Desktop, web and IDE variants are deliberately **not** planned.

# Coding-Agent-Vergleich fuer SIMO — UltraCode AI vs. OpenCode vs. Claude Code vs. Mistral Vibe
**Entscheidungsvorlage / Decision brief — Stand / As of: 2026-07-04**

**Beleg-Kennzeichnung / Evidence legend**
- `[code]` = im UltraCode-Repo verifiziert / verified in the UltraCode repo
- `[Q]` = durch unabhaengige Quelle bzw. Faktencheck bestaetigt / confirmed by independent source or fact-check
- `(?)` = unsicher, nicht unabhaengig verifiziert / uncertain, not independently verified
- `[Claim!]` = Marketing-/Doc-Claim weicht von der Realitaet ab / marketing or doc claim diverges from reality

---

# TEIL A — DEUTSCH

## 1. Vergleichs-Matrix

| Dimension | UltraCode AI | OpenCode | Claude Code | Mistral Vibe |
|---|---|---|---|---|
| **Sprache / Runtime** | TypeScript, strikter ESM (NodeNext), Node >=22.13; pnpm-Monorepo (3 Pakete); schlanke Deps, keine Vendor-SDKs, HTTP/SSE handgerollt `[code]` | Kern/Server TypeScript auf Bun; TUI-Client-Sprache unklar (frueher Go/Bubble Tea; aktuelles Repo nur TS) `(?)` | Node.js/TypeScript; nativer Installer als Hauptweg, exakte Bundelung nicht oeffentlich dokumentiert `(?)` | Python 3.12+ (Rich-TUI) `[Q]` |
| **Lizenz & Geschaeftsmodell** | MIT, Open Source, kostenlos; noch nicht auf npm (Publish-Blocker), Verteilung via Git-Clone `[code]` | MIT, kostenlos; optional Gateway "Zen" (pay-per-token) + optionales Abo "Go" (~10 USD/Mo); kein Pflicht-Abo `[Q]` | Proprietaer, kein OSI-Open-Source (Anthropic Commercial ToS); Abo (Pro ~20, Max ~100/200, Team 100-125/Seat, Enterprise) + PAYG-API `[Q]` | CLI-Kern Apache-2.0; Freemium (Free / Pro 14,99 EUR / Team 24,99 EUR / Enterprise); self-hostbar `[Q]` |
| **LLM-Provider (model-agnostisch?)** | Teil-agnostisch, aber begrenzt: 4 Provider (Anthropic, OpenAI, Mistral, lokal via Ollama); LM Studio/Custom trotz Doc-Claim NICHT vorhanden `[code]` `[Claim!]` | Ja, voll agnostisch: 75+ Provider (Models.dev + Vercel AI SDK), lokal (Ollama/LM Studio/llama.cpp), jede OpenAI-kompatible API; kein Lock-in `[Q]` | Nein: nur Anthropic Claude (aktuell Opus 4.8 / Sonnet 5, GA 2026-06-30); Nicht-Claude nur inoffiziell via Gateway `[Q]` | Ja: Mistral default, aber OpenAI-kompatibles Backend fuer Dritte (OpenRouter -> Claude/GPT/Gemini) + lokal `[Q]` |
| **Agenten / Subagenten** | 6 eingebaute Agenten (default/build/plan/review/release/security), Tool-Filter Allow/Deny, Subagent-Delegation (Tiefe 2), Authoring-Engine (Agenten erzeugen/evolvieren) `[code]` | Primary (build/plan) + Subagents (general/explore/scout), Custom-Agents via Markdown/JSON `[Q]` | Subagents + Agent Teams (bis 10 parallel) + Background/Cloud-Agenten + Routines (managed) + Agent SDK `[Q]` | Agenten-Modi (default/plan/accept-edits/auto-approve), eigene Agenten via TOML, async/Remote-Agenten mit /teleport `[Q]` |
| **Tools / MCP / LSP** | 13 Built-in-Tools (nicht 14, nicht 80+); starke Sandbox (PathGuard, sanitizeEnv, Deny-Listen); MCP nur Schema, KEIN Client; LSP fehlt komplett `[code]` `[Claim!]` | Reiche Tools (read/write/edit/patch/grep/glob/bash/webfetch/websearch/skill/todo/task); MCP lokal+remote; LSP 30+ Server (opt-in) `[Q]` | Datei/Bash/Git/Websuche/GitHub; MCP (offener Standard); LSP JA seit v2.0.74 (11 Sprachen, ENABLE_LSP_TOOL) `[Q]` | ~25 Tools `(?)`; MCP (http/stdio) `[Q]`; kein LSP, IDE-Anbindung via ACP `[Q]` |
| **Extensibility** | Hierarchische TOML-Config, User-Skills, Authoring-Engine, Learning-Modul, Budget-Planner, Session-Optimizer, Memory; projektlokaler Skill-/Agenten-Loader in Umsetzung (uncommittet) `[code]` | Plugins (JS/TS, viele Hooks), offizielles SDK, Themes/Keybinds, Custom Commands/Tools, Skills (SKILL.md), AGENTS.md `[Q]` | Reifstes Oekosystem: CLAUDE.md, Auto-Memory, Skills, Subagents, Slash-Commands, Hooks, MCP, Plugins, settings.json, Agent SDK `[Q]` | Skills (SKILL.md), TOML-Config + AGENTS.md, eigene Agenten/Provider/Modelle `[Q]` |
| **UI / Plattform** | Reine CLI/TUI (Commander + React/Ink), offline-first read-only; KEIN Desktop, KEINE IDE-Plugins `[code]` | Client-Server: TUI + Desktop-App (mac/win/linux, Release-Assets belegt) + IDE-Extension + Web + GitHub/GitLab; remote/mobil `[Q]` | Multi-Surface: CLI, VS Code/Cursor, JetBrains, Desktop, Web, iOS, Slack, CI/CD (GitHub/GitLab) `[Q]` | CLI (OSS-Kern) + Web + IDE (VS Code/JetBrains/Zed via ACP) `[Q]` |
| **Alleinstellung** | KI-Versionierung & Release-Planung (ChangeAnalysis / VersionRecommender / ReleasePlanning / QualityGates) — real & stark getestet, echter Differentiator `[code]` | Konsequent model-agnostisch (75+) + echte Client-Server-Architektur (TUI nur ein Client), remote/mobil `[Q]` | First-Party, tiefste Claude-Kopplung; Agent Teams + Routines; reifstes Oekosystem; De-facto-Referenz `[Q]` | Europaeischer Anbieter (Souveraenitaet/DSGVO), Apache-2.0-Kern, ein Stack CLI+Web+IDE, async/Remote-Agenten `[Q]` |
| **Reife / Zielgruppe** | 1.3.x, erstes Prod-Release (1.3.1 vs 1.3.0 inkonsistent); ~101 Testdateien / ~1323 Tests; Coverage ~93%/86% behauptet (nicht unabh. verifiziert) `(?)`; kleine/keine Community; Entwickler/OSS/Terminal `[code]` | Sehr reif: ~182k Stars, ~972 Contributor, ~830 Releases, v1.17.x; populaerster OSS-Coding-Agent; Terminal-Power-User + Teams `[Q]` | Sehr hoch/Marktreferenz; GA seit 2025, 2026 stark ausgebaut; Profis/Teams/Enterprise (Stripe, Ramp, Wiz) + Nicht-Entwickler `[Q]` | Jung (Launch 12/2025), rasche Entwicklung; als production-ready positioniert; Einzelne bis Enterprise/Self-Hosting `[Q]` |

---

## 2. Ehrliche Einordnung je Wettbewerber

### OpenCode (anomalyco/opencode, frueher sst/opencode `[Q]`)
- **Wo OpenCode UltraCode ueberlegen ist:** Reife und Verbreitung (~182k Stars, ~972 Contributor vs. quasi keine Community) `[Q]`; Plattform-Breite (Desktop-App, IDE-Extension, Web, remote/mobil) `[Q]`; Provider-Breite (75+ vs. 4) `[Q]`; funktionierendes MCP UND LSP (UltraCode hat beides nicht) `[Q]`; reifes Plugin-/SDK-Oekosystem; produktionsreife Verteilung (npm/Homebrew/Scoop/Nix). 
- **Wo OpenCode unterlegen ist:** Kein dediziertes KI-Versionierungs-/Release-Planungssystem als Kernprodukt (UltraCodes Differentiator) `[code]`; keine SIMO-nahe Governance; Architektur (Client-Server) ist maechtiger, aber schwerer als UltraCodes schlanker Ein-Prozess-Kern. Beide MIT/kostenlos — hier kein Vorteil fuer UltraCode.

### Claude Code (Anthropic)
- **Wo Claude Code UltraCode ueberlegen ist:** Praktisch alles bei Reife, Oekosystem (Skills/Plugins/Hooks/Subagents/MCP/Agent SDK), Multi-Surface (CLI/VS Code/JetBrains/Desktop/Web/iOS/Slack/CI) `[Q]`; LSP (11 Sprachen, seit v2.0.74) `[Q]` — Korrektur ggue. Rohprofil, das LSP als "unbestaetigt" fuehrte; Agent Teams (bis 10 parallel) + Routines auf managed Infrastruktur `[Q]`; Enterprise-Deployment (Bedrock/Vertex/Foundry, SSO/RBAC); tiefste Modell-Kopplung/Qualitaet.
- **Wo Claude Code unterlegen ist:** Proprietaer und kostenpflichtig (kein MIT, kein kostenloses Self-Hosting) `[Q]`; NICHT model-agnostisch — nur Claude `[Q]`; keine Datensouveränitaet/EU-Ansatz; kein dediziertes Release-Planungssystem als Produkt. UltraCode gewinnt nur bei Offenheit, Kosten, Self-Hosting und Release-Automation — nicht bei Reife.

### Mistral Vibe (Vibe CLI)
- **Wo Vibe UltraCode ueberlegen ist:** Multi-Surface (CLI+Web+IDE via ACP) `[Q]`; funktionierendes MCP (http/stdio) `[Q]`; async/Remote-Agenten mit /teleport `[Q]`; echte Modell-Breite via OpenAI-kompatibles Backend `[Q]`; europaeischer Anbieter/DSGVO-Argument (Konkurrenz zu SIMOs eigenem Souveraenitaets-Pitch); breitere Verteilung (uv/pip/Installer); Freemium mit Support/SLA-Pfad.
- **Wo Vibe unterlegen ist:** Kein dediziertes KI-Release-/Versionierungssystem `[code]`; kein LSP (wie UltraCode) `[Q]`; Python-Kern statt schlankem TS-Kern (Geschmacks-/Deps-Frage). Vibe ist juenger als der Markt, aber deutlich besser dokumentiert und vermarktet als UltraCode.

**Wichtige Korrekturen ggue. den UltraCode-eigenen Migrations-Docs:** Vibes Agenten-System ist NICHT "begrenzt" (vollwertig inkl. Remote-Agenten) `[Q]`; Vibe ist model-agnostisch, nicht Mistral-gebunden `[Q]`; die Vibe-CLI war NIE "Le Chat" (nur die uebergeordnete Marke wurde umbenannt) `[Q]`.

---

## 3. UltraCode-Positionierung — ehrlich

### Echte Staerken (belegt)
1. **KI-Versionierung & Release-Planung als echter Differentiator** `[code]` — vier real implementierte, stark getestete Engines (ChangeAnalysisEngine mit Conventional-Commit- und Breaking-Change-Erkennung via Exported-Symbol-Diff; VersionRecommender SemVer 2.0 inkl. 0.x/Prerelease; ReleasePlanningEngine mit Keep-a-Changelog-Entwurf; QualityGateSystem mit CI-tauglichem Exit-Code). Kein Wettbewerber bietet das als Kernprodukt.
2. **MIT/Open Source + schlanker, sicherer TS-Kern** `[code]` — keine Vendor-SDKs, handgerolltes HTTP/SSE, starke Tool-Sandbox (PathGuard gegen Pfad-Traversal/Symlinks, sanitizeEnv-Credential-Stripping, safe-by-default Deny-Listen fuer .env/.pem/.key). Auditierbar, self-hostbar, nah an SIMO-Governance.
3. **Multi-Provider inkl. lokal + projektlokaler Loader in Umsetzung** `[code]` — Anthropic/OpenAI/Mistral/Ollama ohne harten Lock-in, API-Keys nur via ENV (nie persistiert); projektlokaler Skill-/Agenten-Loader (.ultracode/agents, .ultracode/skills) in Arbeit.

### Echte Schwaechen / Luecken (belegt)
1. **Keine GUI-Surfaces, MCP nur Schema, kein LSP** `[code]` `[Claim!]` — reine CLI/TUI ohne Desktop/IDE; MCP existiert nur als Config-Typ (kein Client, keine Server-Discovery), LSP gar nicht. Mehrere Doc-/Marketing-Claims (80+ Tools, MCP, LM Studio/Custom-Endpoints, LSP, Desktop-App) liegen ueber der Realitaet — bei Entscheidern ein Vertrauensrisiko.
2. **Fruehe Reife und fehlende Verteilung/Community** `[code]` `(?)` — 1.3.x mit Versions-Inkonsistenz (1.3.1 vs 1.3.0), Test-/Coverage-Zahlen im README uneinheitlich (1347 vs 1426; Coverage nicht unabhaengig gegen JSON-Summary verifiziert), noch nicht auf npm (nur Git-Clone), praktisch keine externe Community gegenueber ~182k Stars (OpenCode) bzw. der Claude-Code-Referenz.
3. **Deutlich schmaleres Provider- und Extensibility-Oekosystem** `[code]` — 4 Provider statt 75+; kein Plugin-Marktplatz, keine IDE-/CI-Integrationen wie bei den drei Wettbewerbern.

---

## 4. Empfehlung — wann UltraCode die richtige Wahl ist

**JA, UltraCode passt, wenn:**
- **KI-gestuetzte Versionierung/Release-Planung/Quality-Gates in CI** der zentrale Use-Case ist — das ist der einzige Bereich, in dem UltraCode heute fuehrt. `[code]`
- **Terminal-first, self-hosted, auditierbarer MIT-Kern** mit SIMO-Governance/Datensouveraenitaet und schlanken Deps gefordert ist (starke Tool-Sandbox als Sicherheits-Plus).
- **Volle Kontroll-/Fork-Faehigkeit** gewuenscht ist und keine Desktop-/IDE-/Web-Oberflaeche gebraucht wird.
- **Multi-Provider inkl. lokal (Ollama)** fuer offline- oder DSGVO-sensible Umgebungen ausreicht (4 Provider genuegen).

**NEIN (noch nicht), wenn:**
- **Desktop-App, IDE-Integration, Web oder Mobile** gebraucht werden -> OpenCode, Claude Code oder Vibe. `[Q]`
- **Funktionierendes MCP (externe Integrationen)** oder **LSP-Diagnostics** erforderlich sind -> OpenCode, Claude Code oder Vibe (MCP); OpenCode/Claude Code (LSP). `[Q]`
- **Maximale Modell-Breite (75+)** oder ein **reifes Plugin-Oekosystem / grosse Community / Enterprise-Support** noetig sind -> OpenCode oder Claude Code. `[Q]`
- **Produktionsreife Distribution (npm/brew) und breite Adoption** Voraussetzung sind -> aktuell noch nicht UltraCode. `[code]`

---
---

# PART B — ENGLISH

## 1. Comparison matrix

| Dimension | UltraCode AI | OpenCode | Claude Code | Mistral Vibe |
|---|---|---|---|---|
| **Language / Runtime** | TypeScript, strict ESM (NodeNext), Node >=22.13; pnpm monorepo (3 packages); lean deps, no vendor SDKs, hand-rolled HTTP/SSE `[code]` | Core/server TypeScript on Bun; TUI client language unclear (formerly Go/Bubble Tea; current repo TS-only) `(?)` | Node.js/TypeScript; native installer as main path, exact bundling not publicly documented `(?)` | Python 3.12+ (Rich TUI) `[Q]` |
| **License & business model** | MIT, open source, free; not yet on npm (publish blocker), distributed via git clone `[code]` | MIT, free; optional gateway "Zen" (pay-per-token) + optional subscription "Go" (~10 USD/mo); no mandatory subscription `[Q]` | Proprietary, no OSI open source (Anthropic Commercial ToS); subscription (Pro ~20, Max ~100/200, Team 100-125/seat, Enterprise) + PAYG API `[Q]` | CLI core Apache-2.0; freemium (Free / Pro 14.99 EUR / Team 24.99 EUR / Enterprise); self-hostable `[Q]` |
| **LLM provider (model-agnostic?)** | Partly agnostic but limited: 4 providers (Anthropic, OpenAI, Mistral, local via Ollama); LM Studio/custom NOT present despite doc claim `[code]` `[Claim!]` | Yes, fully agnostic: 75+ providers (Models.dev + Vercel AI SDK), local (Ollama/LM Studio/llama.cpp), any OpenAI-compatible API; no lock-in `[Q]` | No: Anthropic Claude only (currently Opus 4.8 / Sonnet 5, GA 2026-06-30); non-Claude only unofficially via gateway `[Q]` | Yes: Mistral default, but OpenAI-compatible backend for third parties (OpenRouter -> Claude/GPT/Gemini) + local `[Q]` |
| **Agents / subagents** | 6 built-in agents (default/build/plan/review/release/security), allow/deny tool filter, subagent delegation (depth 2), authoring engine `[code]` | Primary (build/plan) + subagents (general/explore/scout), custom agents via Markdown/JSON `[Q]` | Subagents + Agent Teams (up to 10 parallel) + background/cloud agents + Routines (managed) + Agent SDK `[Q]` | Agent modes (default/plan/accept-edits/auto-approve), custom agents via TOML, async/remote agents with /teleport `[Q]` |
| **Tools / MCP / LSP** | 13 built-in tools (not 14, not 80+); strong sandbox (PathGuard, sanitizeEnv, deny-lists); MCP schema only, NO client; LSP entirely absent `[code]` `[Claim!]` | Rich tools (read/write/edit/patch/grep/glob/bash/webfetch/websearch/skill/todo/task); MCP local+remote; LSP 30+ servers (opt-in) `[Q]` | File/Bash/Git/web search/GitHub; MCP (open standard); LSP YES since v2.0.74 (11 languages, ENABLE_LSP_TOOL) `[Q]` | ~25 tools `(?)`; MCP (http/stdio) `[Q]`; no LSP, IDE via ACP `[Q]` |
| **Extensibility** | Hierarchical TOML config, user skills, authoring engine, learning module, budget planner, session optimizer, memory; project-local skill/agent loader in progress (uncommitted) `[code]` | Plugins (JS/TS, many hooks), official SDK, themes/keybinds, custom commands/tools, skills (SKILL.md), AGENTS.md `[Q]` | Most mature ecosystem: CLAUDE.md, auto-memory, skills, subagents, slash commands, hooks, MCP, plugins, settings.json, Agent SDK `[Q]` | Skills (SKILL.md), TOML config + AGENTS.md, custom agents/providers/models `[Q]` |
| **UI / platform** | Pure CLI/TUI (Commander + React/Ink), offline-first read-only; NO desktop, NO IDE plugins `[code]` | Client-server: TUI + desktop app (mac/win/linux, release assets confirmed) + IDE extension + web + GitHub/GitLab; remote/mobile `[Q]` | Multi-surface: CLI, VS Code/Cursor, JetBrains, desktop, web, iOS, Slack, CI/CD (GitHub/GitLab) `[Q]` | CLI (OSS core) + web + IDE (VS Code/JetBrains/Zed via ACP) `[Q]` |
| **Differentiator** | AI versioning & release planning (ChangeAnalysis / VersionRecommender / ReleasePlanning / QualityGates) — real & well tested, genuine differentiator `[code]` | Consistently model-agnostic (75+) + true client-server architecture (TUI just one client), remote/mobile `[Q]` | First-party, deepest Claude coupling; Agent Teams + Routines; most mature ecosystem; de-facto reference `[Q]` | European vendor (sovereignty/GDPR), Apache-2.0 core, one stack CLI+web+IDE, async/remote agents `[Q]` |
| **Maturity / audience** | 1.3.x, first prod release (1.3.1 vs 1.3.0 inconsistent); ~101 test files / ~1323 tests; coverage ~93%/86% claimed (not independently verified) `(?)`; small/no community; developers/OSS/terminal `[code]` | Very mature: ~182k stars, ~972 contributors, ~830 releases, v1.17.x; most popular OSS coding agent; terminal power users + teams `[Q]` | Very high/market reference; GA since 2025, heavily expanded in 2026; pros/teams/enterprise (Stripe, Ramp, Wiz) + non-developers `[Q]` | Young (launched 12/2025), fast iteration; positioned as production-ready; individuals to enterprise/self-hosting `[Q]` |

---

## 2. Honest per-competitor read

### OpenCode
- **Where superior to UltraCode:** maturity and reach (~182k stars, ~972 contributors vs. virtually none) `[Q]`; platform breadth (desktop app, IDE extension, web, remote/mobile) `[Q]`; provider breadth (75+ vs. 4) `[Q]`; working MCP AND LSP (UltraCode has neither) `[Q]`; mature plugin/SDK ecosystem; production-grade distribution.
- **Where inferior:** no dedicated AI versioning/release-planning system as a core product (UltraCode's differentiator) `[code]`; no SIMO-adjacent governance; heavier client-server architecture vs. UltraCode's lean single-process core. Both MIT/free — no UltraCode edge there.

### Claude Code
- **Where superior:** essentially everything on maturity, ecosystem, multi-surface, LSP (11 languages, since v2.0.74 — corrects the raw profile which listed LSP as "unconfirmed") `[Q]`, Agent Teams (up to 10 parallel) + Routines `[Q]`, enterprise deployment (SSO/RBAC), deepest model coupling/quality.
- **Where inferior:** proprietary and paid (no MIT, no free self-hosting) `[Q]`; NOT model-agnostic — Claude only `[Q]`; no data sovereignty/EU stance; no release-planning system as a product. UltraCode only wins on openness, cost, self-hosting and release automation — not maturity.

### Mistral Vibe
- **Where superior:** multi-surface (CLI+web+IDE via ACP) `[Q]`; working MCP (http/stdio) `[Q]`; async/remote agents with /teleport `[Q]`; real model breadth via OpenAI-compatible backend `[Q]`; European vendor/GDPR angle; broader distribution (uv/pip/installer); freemium with a support/SLA path.
- **Where inferior:** no dedicated AI release/versioning system `[code]`; no LSP (like UltraCode) `[Q]`; Python core vs. lean TS core (taste/deps). Younger to market but far better documented and marketed than UltraCode.

**Key corrections vs. UltraCode's own migration docs:** Vibe's agent system is NOT "limited" (full-featured incl. remote agents) `[Q]`; Vibe is model-agnostic, not Mistral-bound `[Q]`; the Vibe CLI was NEVER "Le Chat" (only the umbrella brand was renamed) `[Q]`.

---

## 3. UltraCode positioning — honest

### Real strengths (evidenced)
1. **AI versioning & release planning as a true differentiator** `[code]` — four real, well-tested engines (ChangeAnalysisEngine with conventional-commit and breaking-change detection via exported-symbol diff; VersionRecommender SemVer 2.0 incl. 0.x/prerelease; ReleasePlanningEngine with Keep-a-Changelog draft; QualityGateSystem with CI-ready exit code). No competitor ships this as a core product.
2. **MIT/open source + lean, secure TS core** `[code]` — no vendor SDKs, hand-rolled HTTP/SSE, strong tool sandbox (PathGuard against path traversal/symlinks, sanitizeEnv credential stripping, safe-by-default deny-lists). Auditable, self-hostable, aligned with SIMO governance.
3. **Multi-provider incl. local + project-local loader in progress** `[code]` — Anthropic/OpenAI/Mistral/Ollama without hard lock-in, API keys via ENV only (never persisted); project-local skill/agent loader in the works.

### Real weaknesses / gaps (evidenced)
1. **No GUI surfaces, MCP schema-only, no LSP** `[code]` `[Claim!]` — pure CLI/TUI; MCP exists only as a config type (no client/discovery), LSP absent. Multiple doc/marketing claims (80+ tools, MCP, LM Studio/custom endpoints, LSP, desktop app) exceed reality — a trust risk with decision-makers.
2. **Early maturity and missing distribution/community** `[code]` `(?)` — 1.3.x with version inconsistency, inconsistent test/coverage numbers, not yet on npm (git clone only), effectively no external community vs. ~182k stars (OpenCode) or the Claude Code reference.
3. **Much narrower provider and extensibility ecosystem** `[code]` — 4 providers vs. 75+; no plugin marketplace, no IDE/CI integrations like the three competitors.

---

## 4. Recommendation — when UltraCode is the right choice

**YES, UltraCode fits when:**
- **AI-assisted versioning/release planning/quality gates in CI** is the central use case — the only area where UltraCode currently leads. `[code]`
- **Terminal-first, self-hosted, auditable MIT core** with SIMO governance/data sovereignty and lean deps is required (strong tool sandbox as a security plus).
- **Full control/fork capability** is wanted and no desktop/IDE/web surface is needed.
- **Multi-provider incl. local (Ollama)** for offline or GDPR-sensitive environments is sufficient (4 providers enough).

**NO (not yet) when:**
- **Desktop app, IDE integration, web or mobile** are needed -> OpenCode, Claude Code or Vibe. `[Q]`
- **Working MCP (external integrations)** or **LSP diagnostics** are required -> OpenCode, Claude Code or Vibe (MCP); OpenCode/Claude Code (LSP). `[Q]`
- **Maximum model breadth (75+)** or a **mature plugin ecosystem / large community / enterprise support** is needed -> OpenCode or Claude Code. `[Q]`
- **Production-grade distribution (npm/brew) and broad adoption** are prerequisites -> not UltraCode yet. `[code]`