# Lessons Learned

**DE:** Dieses Verzeichnis setzt die SIMO-DNA „**Fehler nur einmal**" um: Jeder behobene
Fehler mit nicht-trivialer Ursache hinterlässt hier eine Erkenntnis — Symptom, Root
Cause, Fix und vor allem die Prävention, die eine Wiederholung verhindert. Zwei Beispiele
aus der Geschichte dieses Repos, die hierher gehört hätten: der JUnit-Report, der trotz
CI-Deklaration nie erzeugt wurde, und die farb-instabilen CLI-UI-Tests unter
`FORCE_COLOR` (beide dokumentiert im `CHANGELOG.md` unter `[Unreleased]` → *Behoben*).
**EN:** This directory implements the SIMO DNA principle "**mistakes only once**": every
fixed defect with a non-trivial cause leaves a finding here — symptom, root cause, fix
and, above all, the prevention that stops it from recurring. Two examples from this
repo's history that would have belonged here: the JUnit report that was declared in CI
but never produced, and the colour-unstable CLI UI tests under `FORCE_COLOR` (both
documented in `CHANGELOG.md` under `[Unreleased]` → *Fixed*).

## Prozess / Process

1. **VOR dem Fix / BEFORE the fix:**
   **DE:** Dieses Verzeichnis nach ähnlichen Fällen durchsuchen —
   `rg -i "<stichwort>" docs/lessons-learned/` — vielleicht ist die Lösung schon dokumentiert.
   **EN:** Search this directory for similar cases —
   `rg -i "<keyword>" docs/lessons-learned/` — the solution may already be documented.
2. **NACH dem Fix / AFTER the fix:**
   **DE:** [`TEMPLATE.md`](./TEMPLATE.md) kopieren nach `YYYY-MM-DD-kurz-titel.md`
   (Datum des Fixes, Kebab-case-Kurztitel) und alle vier Pflichtfelder ausfüllen.
   **EN:** Copy [`TEMPLATE.md`](./TEMPLATE.md) to `YYYY-MM-DD-kurz-titel.md`
   (date of the fix, kebab-case short title) and fill in all four mandatory fields.
3. **Prävention verankern / Anchor the prevention:**
   **DE:** Eine Lesson ohne Präventionsmaßnahme ist unvollständig. Bevorzugt:
   Regressionstest (Skill `test-management`), CI-Gate oder Hook — eine Regel, die nur
   auf Disziplin baut, ist die schwächste Form.
   **EN:** A lesson without a prevention measure is incomplete. Preferred: regression
   test (skill `test-management`), CI gate or hook — a rule relying on discipline alone
   is the weakest form.
4. **Index pflegen / Maintain the index:**
   **DE:** Neue Lesson in die Tabelle unten eintragen; zusätzlich der
   CHANGELOG-Eintrag unter *Behoben / Fixed* (Skill `documentation-management`).
   **EN:** Add the new lesson to the table below; additionally add the changelog entry
   under *Behoben / Fixed* (skill `documentation-management`).
5. **Commit:** `docs: Lesson Learned <Kurztitel>` — kein Version-Bump. / no version bump.

## Index

| Datum / Date | Lesson | Prävention / Prevention |
|---|---|---|
| — | *Noch keine Einträge — der nächste dokumentierte Fix beginnt die Liste.* / *No entries yet — the next documented fix starts this list.* | — |
