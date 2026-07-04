# Architecture Decision Records (ADRs)

**DE:** Dieses Verzeichnis hält Entscheidungen mit langfristiger Wirkung auf Architektur,
Tooling oder Prozess von UltraCode AI fest — kurz, datiert, nachvollziehbar. ADRs sind
Teil der SIMO-DNA „Wissen konservieren": Wer eine Entscheidung später hinterfragt, findet
hier Kontext und Begründung statt Archäologie in Git-Historie und Chat-Verläufen.
**EN:** This directory records decisions with long-term impact on the architecture,
tooling or process of UltraCode AI — short, dated, traceable. ADRs implement the SIMO
DNA principle "preserve knowledge": whoever questions a decision later finds context and
rationale here instead of digging through git history and chat logs.

## Prozess / Process

1. **DE:** `TEMPLATE.md` kopieren nach `000N-titel.md` — nächste freie Nummer,
   vierstellig, Kurztitel in Kebab-case.
   **EN:** Copy `TEMPLATE.md` to `000N-titel.md` — next free number, four digits,
   short kebab-case title.
2. **DE:** Kontext, Entscheidung und Konsequenzen ausfüllen (zweisprachig DE+EN),
   Status setzen: `vorgeschlagen / proposed`.
   **EN:** Fill in context, decision and consequences (bilingual DE+EN), set status
   to `vorgeschlagen / proposed`.
3. **DE:** Nach Review und Zustimmung im Merge Request: Status auf
   `akzeptiert / accepted` setzen und in die Index-Tabelle unten eintragen.
   **EN:** After review and approval in the merge request: set status to
   `akzeptiert / accepted` and add the ADR to the index table below.
4. **DE:** Wird eine Entscheidung revidiert: alte ADR **nicht löschen**, sondern Status
   `abgelöst durch 000M / superseded by 000M` setzen; die neue ADR verlinkt zurück.
   **EN:** If a decision is revised: do **not** delete the old ADR — set its status to
   `abgelöst durch 000M / superseded by 000M`; the new ADR links back.
5. **Commit:** `docs: ADR 000N <Kurztitel>` — kein Version-Bump (siehe
   [`VERSIONING.md`](../../VERSIONING.md)). / no version bump (see
   [`VERSIONING.md`](../../VERSIONING.md)).

**DE:** Details und Doku-Pflichten: Skill `documentation-management`
(`.ultracode/skills/documentation-management/SKILL.md`); Review durch Agent `doc-curator`.
**EN:** Details and documentation duties: skill `documentation-management`
(`.ultracode/skills/documentation-management/SKILL.md`); reviewed by the `doc-curator` agent.

## Index

| Nr. | ADR | Status | Datum / Date |
|---|---|---|---|
| 0001 | [Einführung der SIMO-Entwicklungsstandards und Projekt-Agenten / Adoption of the SIMO development standards and project agents](./0001-simo-dev-standards.md) | akzeptiert / accepted | 2026-07-03 |
| 0002 | [Projektlokaler Laufzeit-Loader für Skills und Agenten / Project-local runtime loader for skills and agents](./0002-project-local-assistant-loader.md) | akzeptiert / accepted | 2026-07-04 |
| 0003 | [Minimaler LSP-Diagnostics-Client / Minimal LSP diagnostics client](./0003-lsp-diagnostics-client.md) | akzeptiert / accepted | 2026-07-04 |
