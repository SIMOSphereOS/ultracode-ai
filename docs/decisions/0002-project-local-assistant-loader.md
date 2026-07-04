# ADR 0002: Projektlokaler Laufzeit-Loader für Skills und Agenten / Project-local runtime loader for skills and agents

| Feld / Field | Wert / Value |
|---|---|
| **Status** | akzeptiert / accepted |
| **Datum / Date** | 2026-07-04 |
| **Entscheider / Deciders** | SIMO GmbH Engineering (ultracode-ai Maintainer) |
| **Betroffene Bereiche / Affected areas** | `packages/core/src/authoring/` (SkillRegistry, SkillInjector, defaults, frontmatter), `packages/core/src/agents/` (AgentManager), `packages/shared/src/types/agent.ts`, `.ultracode/skills/`, `.ultracode/agents/`, `UltraCode.ts` |

## Kontext / Context

**DE:** Nach der Umbenennung des Assistenz-Namensraums von `.uc-ai` zu `.ultracode`
lagen die fünf Standard-Skills und fünf Projekt-Agenten zwar versioniert im Repo unter
`.ultracode/skills/` und `.ultracode/agents/`, wurden aber zur Laufzeit **nicht geladen**:
Die `SkillRegistry` las ausschließlich den Home-Store `~/.ultracode/skills`
(`SKILLS_ROOT` in `authoring/defaults.ts`) und verlangte das schwere Produkt-Frontmatter
(Pflichtfelder `name`, `description`, `version`, `catalog`, `status`, `createdAt`,
`updatedAt`); fehlte eines, wurde der Skill still übersprungen. Für Agenten existierte
gar kein Datei-Loader — der `AgentManager` kannte nur `BUILT_IN_AGENTS` und
config-deklarierte Agenten, und `AgentDefinition` besaß kein Feld für einen inline
gepflegten System-Prompt. Ergebnis: Die im Repo gepflegten, absichtlich
leichtgewichtigen Artefakte (Frontmatter nur `name` + `description`, teils `triggers`;
Agenten-Instruktionen als Markdown-Body) waren reine Doku ohne Laufzeitwirkung.
Betrachtete Alternativen: (a) weiter nur auf den Home-Store `~/.ultracode/` setzen — die
mit dem Repo gelieferten Artefakte laden nie, jeder Entwickler müsste sie manuell nach
Hause kopieren, und sie driften vom Code weg; (b) das schwere Produkt-Frontmatter auch
für Repo-Dateien erzwingen — sieben Pflichtfelder pro Datei sind unnötiger Ballast für
handgepflegte Repo-Artefakte und laden zu Copy-Paste-Fehlern ein.
**EN:** After renaming the assistant namespace from `.uc-ai` to `.ultracode`, the five
standard skills and five project agents lived versioned in the repo under
`.ultracode/skills/` and `.ultracode/agents/`, yet were **not loaded** at runtime: the
`SkillRegistry` read only the home store `~/.ultracode/skills` (`SKILLS_ROOT` in
`authoring/defaults.ts`) and demanded the heavy product frontmatter (mandatory fields
`name`, `description`, `version`, `catalog`, `status`, `createdAt`, `updatedAt`); a
missing field silently skipped the skill. For agents there was no file loader at all —
the `AgentManager` knew only `BUILT_IN_AGENTS` and config-declared agents, and
`AgentDefinition` had no field for an inline system prompt. Result: the deliberately
lightweight artifacts maintained in the repo (frontmatter only `name` + `description`,
sometimes `triggers`; agent instructions as a markdown body) were pure docs with no
runtime effect. Alternatives considered: (a) keep relying on the home store
`~/.ultracode/` only — the artifacts shipped with the repo never load, every developer
would have to copy them home manually, and they drift from the code; (b) enforce the
heavy product frontmatter for repo files too — seven mandatory fields per file are
needless ballast for hand-maintained repo artifacts and invite copy-paste errors.

## Entscheidung / Decision

**DE:** Wir führen einen projektlokalen Laufzeit-Loader ein. UltraCode entdeckt Skills
und Agenten zusätzlich zum Home-Store aus dem Arbeitsverzeichnis `<cwd>/.ultracode/`
(analog zur cwd-basierten Config-Discovery des `ConfigManager`): Skills aus
`.ultracode/skills/<name>/SKILL.md`, Agenten aus `.ultracode/agents/<name>.md`. Der
projektlokale Store hat **Vorrang vor dem Home-Store** (bei Namensgleichheit gewinnt die
Repo-Version). Ein **Frontmatter-Adapter** akzeptiert das leichtgewichtige Format
(`name` + `description`, optional `triggers`) und füllt die restlichen Produkt-Pflichtfelder
mit sinnvollen Defaults (u. a. `status: "active"`), statt die Datei zu verwerfen. Wir
erweitern `AgentDefinition` um ein **additives, optionales Feld `systemPrompt`**, in das
der Markdown-Body eines datei-geladenen Agenten übernommen wird (`systemPromptId` bleibt
unangetastet). Ein **Schreib-Guard** hält die Autoring-Schreibpfade (Skill-/Agent-Erstellung)
weiter auf den Home-Store gerichtet: Der projektlokale Store ist reine Lese-Discovery und
wird vom Loader nie mutiert.
**EN:** We introduce a project-local runtime loader. In addition to the home store,
UltraCode discovers skills and agents from the working directory `<cwd>/.ultracode/`
(mirroring the `ConfigManager`'s cwd-based config discovery): skills from
`.ultracode/skills/<name>/SKILL.md`, agents from `.ultracode/agents/<name>.md`. The
project-local store **takes precedence over the home store** (on a name clash the repo
version wins). A **frontmatter adapter** accepts the lightweight format
(`name` + `description`, optional `triggers`) and fills the remaining mandatory product
fields with sensible defaults (including `status: "active"`) instead of discarding the
file. We extend `AgentDefinition` with an **additive, optional `systemPrompt` field** that
receives the markdown body of a file-loaded agent (`systemPromptId` stays untouched). A
**write guard** keeps the authoring write paths (skill/agent creation) pointed at the home
store: the project-local store is read-only discovery and is never mutated by the loader.

## Konsequenzen / Consequences

- ✅ **DE:** Die mit dem Repo gelieferten Skills und Agenten sind ab jetzt
  laufzeit-aktiv, ohne manuelles Kopieren nach `~/.ultracode/`; sie bleiben versioniert,
  reviewbar und driftfrei am Code.
  **EN:** The skills and agents shipped with the repo are now runtime-active without
  copying to `~/.ultracode/`; they stay versioned, reviewable and drift-free next to the
  code.
- ✅ **DE:** Repo-Autoren pflegen minimales Frontmatter (`name` + `description`); der
  Adapter setzt die Defaults. Weniger Boilerplate, weniger stille Skips wegen fehlender
  Pflichtfelder.
  **EN:** Repo authors maintain minimal frontmatter (`name` + `description`); the adapter
  supplies the defaults. Less boilerplate, fewer silent skips due to missing mandatory
  fields.
- ✅ **DE:** Projekt-Vorrang macht repo-spezifische Anpassungen wirksam: Eine gleichnamige
  Home-Store-Version wird durch die Repo-Version überschrieben, das Verhalten pro Projekt
  bleibt vorhersehbar.
  **EN:** Project precedence makes repo-specific tailoring effective: a same-named home
  store version is overridden by the repo version, keeping per-project behavior
  predictable.
- ⚠️ **DE:** **Hooks bleiben weiter ungenutzt** — es gibt kein Produkt-Hook-Runtime, und
  der Loader ändert das bewusst nicht. Datei-Hooks unter `.ultracode/` sind Doku/Beispiele
  ohne Laufzeitwirkung; wer echtes Hook-Verhalten braucht, braucht eine eigene, spätere
  Entscheidung.
  **EN:** **Hooks remain unused** — there is no product hook runtime, and the loader
  deliberately does not change that. File hooks under `.ultracode/` are docs/examples with
  no runtime effect; real hook behavior would require a separate, future decision.
- ⚠️ **DE:** Der Frontmatter-Adapter mit Defaults verdeckt echte Fehler leichter: Ein
  Skill mit falsch geschriebenem Feld wird eher „repariert" als abgelehnt. Gegenmaßnahme:
  Tests für den Adapter (gültiges/leichtgewichtiges/kaputtes Frontmatter) und das
  Anti-Riesendatei-Gate `pnpm check:filesize` halten Artefakte klein und prüfbar.
  **EN:** The defaulting frontmatter adapter masks genuine mistakes more easily: a skill
  with a misspelled field is more likely "repaired" than rejected. Mitigation: tests for
  the adapter (valid/lightweight/broken frontmatter) and the anti-giant-file gate
  `pnpm check:filesize` keep artifacts small and inspectable.
- ⚠️ **DE:** Zwei Quellen (Projekt + Home) erhöhen die Diagnose-Komplexität; bei
  überraschendem Verhalten muss klar sein, welche Version gewonnen hat (Projekt-Vorrang).
  **EN:** Two sources (project + home) raise diagnostic complexity; on surprising behavior
  it must be clear which version won (project precedence).
