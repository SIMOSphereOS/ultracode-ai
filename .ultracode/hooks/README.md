# UltraCode — Projekt-Hooks / Project Hooks

**DE** · Projekt-lokale Hooks des UltraCode-Assistenten für den UltraCode-Dev-Workflow. Sie
aktivieren sich automatisch, sobald der UltraCode-Assistent in diesem Repository läuft —
registriert in [`.ultracode/settings.json`](../settings.json).

> **Echte Hooks:** Jeder Hook ist ein Shell-Command, der das Event-JSON auf **stdin**
> empfängt und über den **Exit-Code** steuert. Das ist das tatsächliche Hook-Modell des
> Assistenten — keine importierten TS-Funktionen, keine erfundenen Events.

### Exit-Code-Kontrakt

| Exit | Wirkung |
|------|---------|
| `0` | Erfolg. stdout fließt bei `SessionStart`/`PreToolUse` als Kontext ein. |
| `2` | Blockierend. stderr wird an den Assistenten zurückgegeben (Tool-Call wird verhindert bzw. Hinweis erzwungen). |
| sonst | Nicht-blockierender Fehler, stderr nur im Transkript. |

### Registrierte Hooks

| Datei | Event | Matcher | Zweck | Blockiert? |
|-------|-------|---------|-------|------------|
| `session-start.sh` | `SessionStart` | — | Repo-Status (Branch, letzter Commit, uncommitted) + Konventions-Reminder als Kontext | nein |
| `guard-bash.sh` | `PreToolUse` | `Bash` | Blockt destruktive Befehle (`rm -rf /`/`~`, Fork-Bomb, `mkfs`/Disk-Overwrite, `git push --force`, direkter Push auf `main`) | ja (`exit 2`) |
| `protect-paths.sh` | `PreToolUse` | `Write\|Edit` | Schützt generierte/gesperrte Artefakte (`pnpm-lock.yaml`, `node_modules/`, `dist/`, `coverage/`, `.git/`) vor Direktbearbeitung | ja (`exit 2`) |
| `lint-changed.sh` | `PostToolUse` | `Write\|Edit` | Compile-freier Schnellcheck der geänderten `.ts/.tsx`: `.only(` / `debugger` → Fix erzwingen; `console.log` in `src/` → Hinweis | teils (`exit 2` nur bei `.only`/`debugger`) |
| `verify-on-stop.sh` | `Stop` | — | Bei **gestagten** TS-Änderungen Typecheck als Pre-Commit-Sicherheitsnetz (advisory) | nein (`exit 0`) |

### Designprinzipien

- **Konservativ:** Guards treffen nur eindeutig destruktive/generierte Fälle — niedrige False-Positive-Rate, kein Ausbremsen normaler Arbeit.
- **Schnell:** Kein Build/Compile im Edit-Pfad. `verify-on-stop` läuft nur bei gestagten TS-Änderungen (bewusster Commit-Vorgang), sonst null Overhead.
- **Loop-sicher:** `verify-on-stop` respektiert `stop_hook_active` und ist advisory (`exit 0`), blockiert das Beenden also nie.
- **Portabel:** JSON-Parsing über `python3` (im Env vorhanden); fehlt es, fällt der Hook still auf „erlauben" zurück.

### Anpassen

- **Hook hart erzwingen:** In `verify-on-stop.sh` das abschließende `exit 0` im Fehlerzweig auf `exit 2` setzen — dann muss der Typecheck vor dem Beenden grün sein.
- **Pfad-Schutz erweitern:** Weitere `case`-Muster in `protect-paths.sh` ergänzen.
- **Hook deaktivieren:** Den jeweiligen Eintrag aus `.ultracode/settings.json` entfernen.

### Manuell testen

```bash
# PreToolUse: destruktiver Befehl wird geblockt (Exit 2 erwartet)
echo '{"tool_input":{"command":"rm -rf /"}}' | bash .ultracode/hooks/guard-bash.sh; echo "exit=$?"

# PreToolUse: Schreibschutz auf Lockfile (Exit 2 erwartet)
echo '{"tool_input":{"file_path":"pnpm-lock.yaml"}}' | bash .ultracode/hooks/protect-paths.sh; echo "exit=$?"

# SessionStart: Statusabriss
echo '{}' | ULTRACODE_PROJECT_DIR="$PWD" bash .ultracode/hooks/session-start.sh
```

### Hinweise

- Der UltraCode-Assistent lädt Hooks beim **Session-Start**. Änderungen an `settings.json` oder den
  Skripten greifen erst in einer **neuen Session** (oder nach `/config`-Reload).
- Aus Sicherheitsgründen prüft der Assistent Hook-Änderungen: neue/veränderte Hooks werden
  erst nach Bestätigung im Review aktiv.
- Diese Hooks sind **projekt-lokal** und unabhängig von etwaigen global konfigurierten Hooks des Assistenten.

---

**EN** · Project-local hooks of the UltraCode assistant for the UltraCode dev workflow. They
activate automatically as soon as the UltraCode assistant runs in this repository — registered in
[`.ultracode/settings.json`](../settings.json).

> **Real hooks:** each hook is a shell command that receives the event JSON on **stdin** and
> steers via its **exit code**. This is the assistant's actual hook model — no imported TS
> functions, no invented events.

### Exit-code contract

| Exit | Effect |
|------|--------|
| `0` | Success. stdout is fed in as context on `SessionStart`/`PreToolUse`. |
| `2` | Blocking. stderr is returned to the assistant (the tool call is prevented, or a notice is enforced). |
| other | Non-blocking error, stderr only in the transcript. |

### Registered hooks

| File | Event | Matcher | Purpose | Blocking? |
|------|-------|---------|---------|-----------|
| `session-start.sh` | `SessionStart` | — | Repo status (branch, last commit, uncommitted) + convention reminder as context | no |
| `guard-bash.sh` | `PreToolUse` | `Bash` | Blocks destructive commands (`rm -rf /`/`~`, fork bomb, `mkfs`/disk overwrite, `git push --force`, direct push to `main`) | yes (`exit 2`) |
| `protect-paths.sh` | `PreToolUse` | `Write\|Edit` | Protects generated/locked artefacts (`pnpm-lock.yaml`, `node_modules/`, `dist/`, `coverage/`, `.git/`) from direct edits | yes (`exit 2`) |
| `lint-changed.sh` | `PostToolUse` | `Write\|Edit` | Compile-free quick check of the changed `.ts/.tsx`: `.only(` / `debugger` → enforce fix; `console.log` in `src/` → notice | partly (`exit 2` only for `.only`/`debugger`) |
| `verify-on-stop.sh` | `Stop` | — | On **staged** TS changes, typecheck as a pre-commit safety net (advisory) | no (`exit 0`) |

### Design principles

- **Conservative:** guards only hit clearly destructive/generated cases — low false-positive rate, no slowing down of normal work.
- **Fast:** no build/compile in the edit path. `verify-on-stop` runs only on staged TS changes (a deliberate commit), otherwise zero overhead.
- **Loop-safe:** `verify-on-stop` respects `stop_hook_active` and is advisory (`exit 0`), so it never blocks stopping.
- **Portable:** JSON parsing via `python3` (present in the env); if it is missing, the hook silently falls back to „allow".

### Customizing

- **Enforce a hook hard:** in `verify-on-stop.sh`, change the trailing `exit 0` in the failure branch to `exit 2` — then the typecheck must be green before stopping.
- **Extend path protection:** add further `case` patterns in `protect-paths.sh`.
- **Disable a hook:** remove the respective entry from `.ultracode/settings.json`.

### Testing manually

```bash
# PreToolUse: destructive command is blocked (exit 2 expected)
echo '{"tool_input":{"command":"rm -rf /"}}' | bash .ultracode/hooks/guard-bash.sh; echo "exit=$?"

# PreToolUse: write protection on the lockfile (exit 2 expected)
echo '{"tool_input":{"file_path":"pnpm-lock.yaml"}}' | bash .ultracode/hooks/protect-paths.sh; echo "exit=$?"

# SessionStart: status summary
echo '{}' | ULTRACODE_PROJECT_DIR="$PWD" bash .ultracode/hooks/session-start.sh
```

### Notes

- The UltraCode assistant loads hooks at **session start**. Changes to `settings.json` or the
  scripts only take effect in a **new session** (or after a `/config` reload).
- For safety reasons the assistant reviews hook changes: new/modified hooks only become active
  after confirmation in the review.
- These hooks are **project-local** and independent of any globally configured hooks of the assistant.
