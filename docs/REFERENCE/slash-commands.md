# Slash-Kommandos und interaktiver Modus

> **Referenz des interaktiven Ink-UI – Slash-Kommandos und Tastenkürzel aus `packages/cli/src/ui/App.tsx`.**

---

## Überblick

Wird `ultracode` ohne Subkommando in einem interaktiven Terminal (TTY für `stdin` und `stdout`) gestartet, läuft die interaktive UI auf Basis von [Ink](https://github.com/vadimdemedes/ink) (React im Terminal). Der Einstieg erfolgt über `startInteractive` (`packages/cli/src/ui/start.ts`), die Root-Komponente ist `App` (`packages/cli/src/ui/App.tsx`).

```bash
ultracode
```

Eingaben, die mit `/` beginnen, werden als Slash-Kommando interpretiert (`handleSlash`). Jede andere Eingabe wird als Prompt an den aktiven Agenten geschickt. Die UI funktioniert plattformübergreifend (Linux/macOS/Windows) in jedem TTY-fähigen Terminal.

---

## Slash-Kommandos

Aus der eingebauten `HELP_TEXT`-Konstante und dem `switch` in `handleSlash`:

| Kommando | Beschreibung |
|----------|--------------|
| `/help` | Zeigt die Hilfe (Slash-Kommandos und Tastenkürzel). |
| `/agents [name]` | Listet alle Agenten auf. Mit `name`: zeigt einen einzelnen Agenten (`name (type) — description` plus Modell, sonst `(active model)`). Unbekannter Name → Fehlermeldung. |
| `/tools` | Listet alle registrierten Tools im Format `name [category] — description`. |
| `/config show` | Druckt die Konfiguration als formatiertes JSON (Secrets maskiert über `redactConfig`). Andere Argumente → `Usage: /config show`. |
| `/theme <name>` | Wechselt das Theme. Verfügbar: `dark`, `light`, `dracula`. Unbekanntes Theme → Fehlermeldung mit Liste der verfügbaren Themes. |
| `/clear` | Leert das Transkript und die Tool-Event-Anzeige. |
| `/exit` | Beendet UltraCode. |

Ein unbekanntes Kommando erzeugt die Meldung `Unknown command /<cmd> — try /help`.

```text
/help
/agents plan
/tools
/config show
/theme dracula
/clear
/exit
```

---

## Tastenkürzel

Aus dem `useInput`-Handler und der `ChatInput`-Komponente:

| Taste | Wirkung |
|-------|---------|
| `Enter` | Sendet die Eingabe (Prompt oder Slash-Kommando). |
| `Ctrl+J` | Fügt einen Zeilenumbruch in die Eingabe ein (mehrzeilige Prompts). |
| `↑` / `↓` | Navigiert durch die Eingabe-Historie. |
| `Shift+Tab` | Wechselt zyklisch durch die verfügbaren Agenten. |
| `Esc` | Bricht den laufenden Lauf ab (`AbortController.abort()`). |
| `Ctrl+C` `Ctrl+C` | Zweimaliges `Ctrl+C` innerhalb von 1,5 s beendet die UI. Einmaliges `Ctrl+C` zeigt den Hinweis `Press Ctrl+C again to exit`. |

Das Doppel-`Ctrl+C` ist über die `DoublePress`-Klasse (`packages/cli/src/ui/ctrl-c.ts`) implementiert; Ink wird mit `exitOnCtrlC: false` gerendert, damit die App das Verhalten selbst steuert.

---

## Statusleiste

Die `StatusBar`-Komponente zeigt den aktiven **Agenten**, das **Modell** (Agenten-Override oder `core.activeModel`), die **Session-ID** (sobald ein `session.started`-Event eingegangen ist), den kumulierten **Token-Verbrauch** (Input/Output) und das aktive **Theme** an.

Während ein Lauf aktiv ist und noch kein Text gestreamt wurde, erscheint `… thinking (Esc to cancel)`.

---

## Tool-Events

Während eines Laufs ausgeführte Tools werden über das `tool.executed`-Event der Facade in der `ToolOutput`-Komponente angezeigt (Tool-Name, Erfolg/Fehler, Dauer in ms). Die Anzeige hält die letzten Einträge vor.

---

## Weiterführend

- [cli-commands.md](./cli-commands.md) – Nicht-interaktive Kommandos
- [../DEVELOPMENT/agents-reference.md](../DEVELOPMENT/agents-reference.md) – Agenten und ihre Tool-Beschränkungen
- [tools-reference.md](./tools-reference.md) – Built-in-Tools
