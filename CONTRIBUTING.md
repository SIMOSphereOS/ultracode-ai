# Contributing zu UltraCode AI

Danke für dein Interesse an UltraCode AI. Dieses Dokument fasst zusammen, wie du Änderungen
beiträgst, damit das Monorepo grün, deterministisch und cross-platform bleibt.

## Voraussetzungen

- **Node.js >= 22.13** (alle Pakete deklarieren `engines.node` `>=22.13.0`; `node:sqlite` benötigt 22.5+)
- **pnpm** (Projekt nutzt `pnpm@11.5.2`)
- **Git** (für die AI-Versioning-Features benötigt; ansonsten optional)

Cross-Platform: UltraCode AI läuft auf **Linux, macOS und Windows**. Beiträge dürfen keine
Unix-only-Annahmen einführen — Pfade über `node:path`, Git ohne Shell, plattformneutrale
Tests.

## Setup

```bash
git clone <repo-url> ultracode
cd ultracode
pnpm install
pnpm build
```

## Architektur in Kürze

Drei Pakete, Abhängigkeitsrichtung `cli → core → shared`:

- **`ultracode-shared`** — bindender Kontrakt-Layer (Typen, Interfaces, Fehler, Utils).
  Quelle der Wahrheit: [`packages/shared/CONTRACTS.md`](./packages/shared/CONTRACTS.md).
- **`ultracode-core`** — Config, Provider, Tools, Memory, Context, Execution, Agenten,
  AI-Versioning.
- **`ultracode-ai`** — die CLI (Commander + React/Ink).

`core` und `cli` implementieren gegen die Interfaces aus `shared`. Änderungen an einem
Kontrakt erfordern, dass alle Implementierungen und Tests mitziehen.

## Entwicklungs-Workflow

1. **Branch** von `main` anlegen.
2. **Test-Driven Development bevorzugt:** Test zuerst schreiben, dann implementieren.
   Tests müssen deterministisch und offline sein (keine echten Netzwerk-Calls,
   injizierbare Runner/Clocks/Provider).
3. **Lokal verifizieren** — alle drei müssen grün sein:

   ```bash
   pnpm build
   pnpm test
   pnpm typecheck
   ```

   Für Coverage: `pnpm test:coverage`. Für End-to-End: `pnpm test:e2e`.

## Code-Konventionen

- **TypeScript strict / ESM (`NodeNext`):** relative Imports mit `.js`-Endung,
  `import type` für reine Typ-Importe (`verbatimModuleSyntax` ist aktiv).
- **Fehler:** mit den Klassen aus `ultracode-shared` werfen
  (`ConfigError`, `ProviderError`, `ToolError`, `AgentError`, `VersioningError`,
  `ValidationError`). Tools werfen **nicht** aus `execute` — sie melden Fehler als
  `ToolResult { ok: false, error }`.
- **Keine Secrets im Klartext:** API-Keys werden nie persistiert und in Ausgaben maskiert.
- **Timestamps** als ISO-8601-Strings (UTC), Dauern als `durationMs`.

Die verbindlichen Cross-cutting Conventions stehen in
[`CONTRACTS.md`](./packages/shared/CONTRACTS.md) — bitte vor größeren Änderungen lesen.

## Commits

**Conventional Commits** verwenden:

```
feat|fix|docs|refactor|test: kurze beschreibung
```

Bei funktionalen Änderungen den passenden Modul-`CHANGELOG.md`
(`packages/*/CHANGELOG.md`) im Abschnitt `Unreleased` pflegen. Die Versionierungs- und
Release-Regeln stehen in [`VERSIONING.md`](./VERSIONING.md).

## Pull Requests

- Beschreibe **was** und **warum**, nicht nur **wie**.
- Halte PRs fokussiert; Build, Tests und Typecheck müssen grün sein.
- Neue Features brauchen Tests; Bugfixes brauchen einen Regressionstest.
- Doku aktualisieren, wenn sich Verhalten, CLI-Kommandos oder Config-Schlüssel ändern.

## Development Standards & Agents

**DE:** Dieses Repo hat fünf verbindliche Entwicklungsstandards als Projekt-Skills
(`.ultracode/skills/`: `clean-code`, `release-management`, `test-management`,
`dev-workflow`, `documentation-management`) und fünf Entwicklungs-Agenten
(`.ultracode/agents/`). Leitdokument für Coding-Agenten: [`ULTRACODE.md`](./ULTRACODE.md);
Überblick über Standards, Agenten und Quality Gates:
[`docs/DEVELOPMENT/standards.md`](./docs/DEVELOPMENT/standards.md).
**EN:** This repo ships five binding development standards as project skills
(`.ultracode/skills/`: `clean-code`, `release-management`, `test-management`,
`dev-workflow`, `documentation-management`) and five development agents
(`.ultracode/agents/`). Guide for coding agents: [`ULTRACODE.md`](./ULTRACODE.md);
overview of standards, agents and quality gates:
[`docs/DEVELOPMENT/standards.md`](./docs/DEVELOPMENT/standards.md).

## Lizenz & CLA / License & CLA

**DE:** UltraCode AI steht unter einem **Dual-License-Modell**: Open-Source-Beiträge werden
unter der [AGPL-3.0-or-later](./LICENSE) veröffentlicht. Mit deinem Beitrag stimmst du zu,
dass dein Code unter dieser Lizenz veröffentlicht wird. Damit die SIMO GmbH das Projekt
zusätzlich unter einer **kommerziellen Lizenz** anbieten kann, ist vor dem Merge ein
unterzeichnetes **Contributor License Agreement (CLA)** erforderlich — siehe
[`CLA.md`](./CLA.md). Details zum Lizenzmodell: [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md).

**EN:** UltraCode AI uses a **dual-license model**: open-source contributions are published
under the [AGPL-3.0-or-later](./LICENSE). By contributing you agree that your code is released
under this license. So that SIMO GmbH can also offer the project under a **commercial
license**, a signed **Contributor License Agreement (CLA)** is required before a merge — see
[`CLA.md`](./CLA.md). For details on the licensing model: [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md).
