# UltraCode — Projekt-Hooks für Claude Code

Projekt-lokale [Claude-Code-Hooks](https://docs.claude.com/en/docs/claude-code/hooks)
für den UltraCode-Dev-Workflow. Sie aktivieren sich automatisch, sobald Claude Code in
diesem Repository läuft — registriert in [`.claude/settings.json`](../settings.json).

> **Echte CC-Hooks:** Jeder Hook ist ein Shell-Command, der das Event-JSON auf **stdin**
> empfängt und über den **Exit-Code** steuert. Das ist das tatsächliche Claude-Code-Modell —
> keine importierten TS-Funktionen, keine erfundenen Events.

## Exit-Code-Kontrakt

| Exit | Wirkung |
|------|---------|
| `0` | Erfolg. stdout fließt bei `SessionStart`/`PreToolUse` als Kontext ein. |
| `2` | Blockierend. stderr wird an Claude zurückgegeben (Tool-Call wird verhindert bzw. Hinweis erzwungen). |
| sonst | Nicht-blockierender Fehler, stderr nur im Transkript. |

## Registrierte Hooks

| Datei | Event | Matcher | Zweck | Blockiert? |
|-------|-------|---------|-------|------------|
| `session-start.sh` | `SessionStart` | — | Repo-Status (Branch, letzter Commit, uncommitted) + Konventions-Reminder als Kontext | nein |
| `guard-bash.sh` | `PreToolUse` | `Bash` | Blockt destruktive Befehle (`rm -rf /`/`~`, Fork-Bomb, `mkfs`/Disk-Overwrite, `git push --force`, direkter Push auf `main`) | ja (`exit 2`) |
| `protect-paths.sh` | `PreToolUse` | `Write\|Edit` | Schützt generierte/gesperrte Artefakte (`pnpm-lock.yaml`, `node_modules/`, `dist/`, `coverage/`, `.git/`) vor Direktbearbeitung | ja (`exit 2`) |
| `lint-changed.sh` | `PostToolUse` | `Write\|Edit` | Compile-freier Schnellcheck der geänderten `.ts/.tsx`: `.only(` / `debugger` → Fix erzwingen; `console.log` in `src/` → Hinweis | teils (`exit 2` nur bei `.only`/`debugger`) |
| `verify-on-stop.sh` | `Stop` | — | Bei **gestagten** TS-Änderungen Typecheck als Pre-Commit-Sicherheitsnetz (advisory) | nein (`exit 0`) |

## Designprinzipien

- **Konservativ:** Guards treffen nur eindeutig destruktive/generierte Fälle — niedrige False-Positive-Rate, kein Ausbremsen normaler Arbeit.
- **Schnell:** Kein Build/Compile im Edit-Pfad. `verify-on-stop` läuft nur bei gestagten TS-Änderungen (bewusster Commit-Vorgang), sonst null Overhead.
- **Loop-sicher:** `verify-on-stop` respektiert `stop_hook_active` und ist advisory (`exit 0`), blockiert das Beenden also nie.
- **Portabel:** JSON-Parsing über `python3` (im Env vorhanden); fehlt es, fällt der Hook still auf „erlauben" zurück.

## Anpassen

- **Hook hart erzwingen:** In `verify-on-stop.sh` das abschließende `exit 0` im Fehlerzweig auf `exit 2` setzen — dann muss der Typecheck vor dem Beenden grün sein.
- **Pfad-Schutz erweitern:** Weitere `case`-Muster in `protect-paths.sh` ergänzen.
- **Hook deaktivieren:** Den jeweiligen Eintrag aus `.claude/settings.json` entfernen.

## Manuell testen

```bash
# PreToolUse: destruktiver Befehl wird geblockt (Exit 2 erwartet)
echo '{"tool_input":{"command":"rm -rf /"}}' | bash .claude/hooks/guard-bash.sh; echo "exit=$?"

# PreToolUse: Schreibschutz auf Lockfile (Exit 2 erwartet)
echo '{"tool_input":{"file_path":"pnpm-lock.yaml"}}' | bash .claude/hooks/protect-paths.sh; echo "exit=$?"

# SessionStart: Statusabriss
echo '{}' | CLAUDE_PROJECT_DIR="$PWD" bash .claude/hooks/session-start.sh
```

## Hinweise

- Claude Code lädt Hooks beim **Session-Start**. Änderungen an `settings.json` oder den
  Skripten greifen erst in einer **neuen Session** (oder nach `/config`-Reload).
- Aus Sicherheitsgründen prüft Claude Code Hook-Änderungen: neue/veränderte Hooks werden
  erst nach Bestätigung im Review aktiv.
- Diese Hooks sind **projekt-lokal** und unabhängig von etwaigen globalen `~/.claude/hooks`.
