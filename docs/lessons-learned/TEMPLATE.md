# Lesson Learned: <Kurztitel / Short title>

| Feld / Field | Wert / Value |
|---|---|
| **Datum / Date** | YYYY-MM-DD |
| **Bereich / Area** | <z. B. packages/cli, vitest.config.ts, .gitlab-ci.yml / e.g. packages/cli, vitest.config.ts, .gitlab-ci.yml> |
| **Schweregrad / Severity** | niedrig / low · mittel / medium · hoch / high |
| **Fix-Referenz / Fix reference** | <Commit-Hash oder MR-Link / commit hash or MR link> |

## Symptom

**DE:** Was war sichtbar? Fehlermeldung, CI-Job, fehlgeschlagener Test, falsches
Verhalten — so konkret, dass die Datei per Stichwortsuche (`rg`) gefunden wird.
**EN:** What was observable? Error message, CI job, failing test, wrong behaviour —
concrete enough that keyword search (`rg`) finds this file.

## Root Cause

**DE:** Die tatsächliche Ursache, nicht das Symptom. Warum konnte das passieren?
Welche Annahme war falsch?
**EN:** The actual cause, not the symptom. Why could this happen?
Which assumption was wrong?

## Fix

**DE:** Was wurde geändert — Dateien, Kern der Änderung, Commit(s).
**EN:** What was changed — files, essence of the change, commit(s).

## Prävention / Prevention

**DE:** Was verhindert die Wiederholung? Regressionstest, CI-Gate, Hook, Lint-Regel
oder dokumentierte Regel (schwächste Form). Konkret benennen, wo die Maßnahme lebt.
**EN:** What prevents recurrence? Regression test, CI gate, hook, lint rule or a
documented rule (weakest form). Name concretely where the measure lives.
