# ADR 0003: Minimaler LSP-Diagnostics-Client / Minimal LSP diagnostics client

| Feld / Field | Wert / Value |
|---|---|
| **Status** | akzeptiert / accepted |
| **Datum / Date** | 2026-07-04 |
| **Entscheider / Deciders** | SIMO GmbH Engineering (ultracode-ai Maintainer) |
| **Betroffene Bereiche / Affected areas** | `packages/core/src/lsp/` (transport, LspClient, index), `packages/core/src/tools/builtin/LspDiagnosticsTool.ts`, `packages/shared/src/types/config.ts` (`LspServerConfig`, `lspServers`), `packages/core/src/config/` (mapping/spec/schema), `packages/core/src/UltraCode.ts` |

## Kontext / Context

**DE:** UltraCode hatte bislang **keinerlei** Language-Server-Protocol-Unterstützung; die
Wettbewerbs- und Migrations-Dokumente führten LSP als Lücke bzw. „geplant". Gleichzeitig
sind die eingebauten Tools rein textuell (`read`/`grep`/`edit`): der Agent „sieht" keine
Compiler-/Linter-Diagnostik einer Datei, ohne selbst `bash` mit projektspezifischen Build-
Kommandos zu bemühen. Ein vollwertiger LSP-Layer (Auto-Management vieler Sprachen,
`textDocument/*`-Vollabdeckung, IDE-Bridge, Hover/Completion/Rename) wäre ein großes,
langlebiges Subsystem mit hohem Pflegeaufwand und würde dem bewusst schlanken CLI/TUI-Kern
widersprechen. Betrachtete Alternativen: (a) **gar kein LSP** — der ehrlichste Status quo,
aber der Agent bleibt ohne strukturierte Diagnostik und ein häufiger, billiger Nutzen
(„welche Fehler hat diese Datei?") bleibt liegen; (b) **voller LSP-Client mit
Multi-Language-Auto-Management** wie OpenCode (30+ Server) — mächtig, aber ein
überproportional großes Subsystem gegenüber dem Rest des Kerns, mit dauerhaftem Betriebs-
und Testaufwand; (c) **IDE-Bridge (VS Code/JetBrains/Neovim)** — gehört zu den bewusst
**nicht** geplanten GUI-Surfaces (siehe `docs/comparison.md`) und ist damit ausgeschlossen.
Das MCP-Client-Subsystem (`packages/core/src/mcp/`) diente als Vorlage; der wesentliche
Unterschied ist das **Wire-Format**: LSP rahmt JSON-RPC-2.0-Nachrichten über stdio mit
`Content-Length`-Headern (`Content-Length: N\r\n\r\n<json>`), nicht newline-delimitiert.
**EN:** UltraCode had **no** Language Server Protocol support at all; the competitive and
migration docs listed LSP as a gap or "planned". At the same time the built-in tools are
purely textual (`read`/`grep`/`edit`): the agent cannot "see" a file's compiler/linter
diagnostics without invoking `bash` with project-specific build commands. A full LSP layer
(multi-language auto-management, full `textDocument/*` coverage, IDE bridge,
hover/completion/rename) would be a large, long-lived subsystem with high maintenance cost
and would contradict the deliberately lean CLI/TUI core. Alternatives considered: (a) **no
LSP at all** — the most honest status quo, but the agent stays without structured
diagnostics and a frequent, cheap benefit ("what errors does this file have?") is left on
the table; (b) **a full LSP client with multi-language auto-management** like OpenCode (30+
servers) — powerful, but a disproportionately large subsystem versus the rest of the core,
with ongoing operational and test cost; (c) **an IDE bridge (VS Code/JetBrains/Neovim)** —
part of the GUI surfaces deliberately **not** planned (see `docs/comparison.md`) and thus
ruled out. The MCP client subsystem (`packages/core/src/mcp/`) served as the template; the
key difference is the **wire format**: LSP frames JSON-RPC 2.0 messages over stdio with
`Content-Length` headers (`Content-Length: N\r\n\r\n<json>`), not newline-delimited.

## Entscheidung / Decision

**DE:** Wir führen einen **bewusst minimalen LSP-Client mit Fokus Diagnostics** ein
(`packages/core/src/lsp/`). Der Transport implementiert das LSP-Wire-Format mit
`Content-Length`-Header-Framing über `child_process`-stdio; `LspClient` fährt den Handshake
(`initialize` mit `rootUri`/Capabilities → `initialized`-Notification), öffnet **eine** Datei
via `textDocument/didOpen` und sammelt die vom Server gepushten Diagnostics
(`textDocument/publishDiagnostics`); `shutdown`/`exit` und Dispose räumen sauber ab. Ein
additives, rückwärtskompatibles Config-Schema `LspServerConfig`
(`name`, `command`, `args?`, `languages?`, `rootUri?`) plus `UltraCodeConfig.lspServers`
(TOML `[[lsp_servers]]`, Default `[]`) beschreibt **einen** Server pro Eintrag — **kein**
Auto-Management vieler Sprachen. Ein neues on-demand-Tool `lsp_diagnostics` (Kategorie
`project`, Permission `always`, rein lesend) routet eine Datei anhand Endung/Sprach-ID an den
passenden Server, startet ihn faul und wird nur registriert, wenn mindestens ein
`[[lsp_servers]]`-Eintrag existiert. Alle Fehlerpfade sind **defensiv**: kein passender
Server, Lese-/Verbindungs-/Timeout-Fehler → leeres Ergebnis mit erklärendem `note`, nie ein
Crash der Agenten-Schleife. Eine **IDE-Bridge bleibt ausgeschlossen**.
**EN:** We introduce a **deliberately minimal LSP client focused on diagnostics**
(`packages/core/src/lsp/`). The transport implements the LSP wire format with
`Content-Length` header framing over `child_process` stdio; `LspClient` runs the handshake
(`initialize` with `rootUri`/capabilities → `initialized` notification), opens **one** file
via `textDocument/didOpen` and collects the diagnostics the server pushes
(`textDocument/publishDiagnostics`); `shutdown`/`exit` and dispose clean up. An additive,
backward-compatible config schema `LspServerConfig`
(`name`, `command`, `args?`, `languages?`, `rootUri?`) plus `UltraCodeConfig.lspServers`
(TOML `[[lsp_servers]]`, default `[]`) describes **one** server per entry — **no**
multi-language auto-management. A new on-demand `lsp_diagnostics` tool (category `project`,
permission `always`, read-only) routes a file by its extension/language id to the matching
server, spawns it lazily and is registered only when at least one `[[lsp_servers]]` entry
exists. All failure paths are **defensive**: no matching server, read/connection/timeout
errors → an empty result with an explanatory `note`, never a crash of the agent loop. An
**IDE bridge stays out of scope**.

## Konsequenzen / Consequences

- ✅ **DE:** LSP ist nicht länger eine reine Lücke: Der Agent kann strukturierte
  Diagnostik (Fehler/Warnungen/Hinweise mit 1-basierten Positionen) für eine Datei on-demand
  abrufen, ohne projektspezifische Build-Kommandos über `bash` zu erraten. Die Doku bildet
  diesen Stand jetzt ehrlich als „minimal (Diagnostics)" ab.
  **EN:** LSP is no longer a pure gap: the agent can fetch structured diagnostics
  (errors/warnings/hints with 1-based positions) for a file on demand, without guessing
  project-specific build commands via `bash`. The docs now honestly reflect this as "minimal
  (diagnostics)".
- ✅ **DE:** Der Umfang bleibt klein und auditierbar: ein Server pro Eintrag, ein
  `textDocument/*`-Feature, MCP-Client als bewährte Bauform. Rückwärtskompatibel — bestehende
  Configs ohne `[[lsp_servers]]` verhalten sich unverändert (Tool wird nicht registriert).
  **EN:** The scope stays small and auditable: one server per entry, one `textDocument/*`
  feature, the MCP client as a proven blueprint. Backward compatible — existing configs
  without `[[lsp_servers]]` behave unchanged (the tool is not registered).
- ✅ **DE:** Defensive Fehlerbehandlung schützt die Session: ein fehlender, langsamer oder
  abstürzender Language-Server degradiert zu einem leeren Ergebnis mit `note` statt zu einem
  Loop-Crash.
  **EN:** Defensive error handling protects the session: a missing, slow or crashing language
  server degrades to an empty result with a `note` instead of a loop crash.
- ⚠️ **DE:** Der Funktionsumfang ist **absichtlich schmal** — nur Diagnostics für eine
  geöffnete Datei, kein Hover/Completion/Rename, keine Cross-File-Analyse, kein
  Auto-Management vieler Sprachen, keine IDE-Bridge. Wer mehr braucht, greift zu Werkzeugen
  mit vollem LSP-Stack (z. B. OpenCode); eine Erweiterung wäre eine eigene, spätere Entscheidung.
  **EN:** The feature set is **intentionally narrow** — only diagnostics for one opened file,
  no hover/completion/rename, no cross-file analysis, no multi-language auto-management, no
  IDE bridge. Anyone needing more uses tools with a full LSP stack (e.g. OpenCode); an
  extension would be a separate, future decision.
- ⚠️ **DE:** Ergebnisqualität und Latenz hängen vom extern konfigurierten Language-Server ab
  (Version, Warmlaufzeit, Diagnostics-Push-Timing). Der Diagnostics-Wartezeitraum ist
  timeout-begrenzt; ein Server, der spät pusht, kann ein leeres Ergebnis liefern.
  **EN:** Result quality and latency depend on the externally configured language server
  (version, warm-up, diagnostics-push timing). The diagnostics wait window is timeout-bounded;
  a server that pushes late may yield an empty result.
