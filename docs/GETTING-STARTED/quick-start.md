# UltraCode AI – Quick Start

> **5-Minuten-Tutorial für den Einstieg**

---

## ⚡ Sofort loslegen

Führe diese **5 Schritte** aus, um UltraCode AI in Aktion zu erleben:

---

## Schritt 1: Projekt auswählen

Navigiere zu einem bestehenden Projekt oder erstelle ein neues:

```bash
# Zu einem bestehenden Projekt
cd /pfad/zu/deinem/projekt

# Oder neues Projekt erstellen
mkdir mein-projekt
cd mein-projekt
git init
```

---

## Schritt 2: UltraCode AI starten

```bash
ultracode-ai
```

**Was passiert:**
1. UltraCode AI prüft die Umgebung
2. Lädt die Konfiguration (oder erstellt eine neue)
3. Startet die interaktive CLI

---

## Schritt 3: Erste Anfrage stellen

Gib einen der folgenden Befehle ein und drücke **Enter**:

```
> "Analysiere die Projektstruktur und erkläre sie mir"
> "Was sind die wichtigsten Dateien in diesem Projekt?"
> "Suche nach Sicherheitslücken im Code"
> "Erstelle eine neue API-Endpunkt für /users"
```

**Tipp:** Nutze **@** für Dateiautovervollständigung:
```
> "Lies die Datei @src/index.ts"
```

---

## Schritt 4: Mit Tools arbeiten

UltraCode AI registriert **14 Tools** (13 Built-in-Tools plus das `task`-Subagent-Tool). Hier sind die wichtigsten:

| **Tool** | **Befehl** | **Beispiel** |
|----------|------------|--------------|
| Datei lesen | `read` | `> read(file_path="src/index.ts")` |
| Datei schreiben | `write_file` | `> write_file(path="src/new.ts", content="...")` |
| Datei bearbeiten | `edit` | `> edit(file_path="src/index.ts", old="...", new="...")` |
| Suche | `grep` | `> grep(pattern="TODO", path=".")` |
| Bash ausführen | `bash` | `> bash(command="npm test")` |
| Git-Status | `git_status` | `> git_status()` |
| Aufgabe erstellen | `todo` | `> todo(action="write", todos=[...])` |

---

## Schritt 5: Erste Aufgaben lösen

### 📌 Beispiel 1: Code analysieren

```
> "Analysiere alle TypeScript-Dateien und finde potenzielle Bugs"
```

**UltraCode AI wird:**
- Alle `.ts`-Dateien finden
- Code mit LLM analysieren
- Potenzielle Probleme melden
- Lösungsvorschläge machen

---

### 📌 Beispiel 2: Neue Funktion hinzufügen

```
> "Erstelle eine neue Funktion 'calculateTotal' in src/utils.ts, die die Summe eines Arrays berechnet"
```

**UltraCode AI wird:**
- Die Datei `src/utils.ts` lesen
- Die Funktion hinzufügen
- Den Code formatieren
- Den Änderungen anzeigen

---

### 📌 Beispiel 3: Tests ausführen

```
> "Führe alle Tests aus und berichte die Ergebnisse"
```

**UltraCode AI wird:**
- `npm test` oder ähnlichen Befehl finden
- Tests ausführen
- Ergebnisse analysieren
- Zusammenfassung erstellen

---

## 🎯 Interaktive Features

### Slash-Kommandos

Beginne mit `/` für spezielle Aktionen:

| **Kommando** | **Beschreibung** | **Beispiel** |
|--------------|------------------|--------------|
| `/help` | Hilfe anzeigen | `/help` |
| `/agents` | Agenten wechseln | `/agents build` |
| `/tools` | Tools auflisten | `/tools` |
| `/config` | Konfiguration | `/config show` |
| `/theme` | Theme wechseln | `/theme dark` |
| `/clear` | Chat löschen | `/clear` |
| `/exit` | Beenden | `/exit` |

---

### Datei-Referenzierung

Verwende **@** für einfache Dateiauswahl:

```
> "Lies @src/components/Button.tsx"
> "Suche nach 'onClick' in @src/**/*.tsx"
> "Bearbeite @package.json"
```

---

### Multi-Line Input

Drücke **Strg+J** oder **Shift+Enter** für mehrzeiligen Input:

```
> "Erstelle eine neue Komponente:
> ```typescript
> interface Props {
>   name: string;
> }
> export const Greeting = ({ name }: Props) => <h1>Hello, {name}!</h1>;
> ```"
```

---

## 💡 Power-User Tipps

### 1. Agenten wechseln

UltraCode AI hat vordefinierte Agenten:

| **Agent** | **Zweck** | **Aktivierung** |
|-----------|-----------|----------------|
| `default` | Allgemeine Nutzung | Standard |
| `build` | Entwicklung, volle Berechtigungen | `/agents build` |
| `plan` | Nur Lesen, Analyse | `/agents plan` |
| `review` | Code Review | `/agents review` |
| `release` | Release-Management | `/agents release` |

---

### 2. Sessions verwalten

```bash
# Session fortsetzen
ultracode-ai --continue

# Spezifische Session laden
ultracode-ai --resume abc123

# Neue Session starten
ultracode-ai --new
```

---

### 3. Kontext erweitern

```
> "Berücksichtige auch die Datei @src/types.ts für deine Analyse"
> "Lies alle Dateien im @src/utils/ Ordner"
```

---

### 4. Aufgaben delegieren

```
> task(task="Analysiere das Backend", agent="plan")
> task(task="Erstelle Tests für @src/api.ts", agent="build")
```

---

## 🎨 UI-Shortcuts

| **Shortcut** | **Aktion** |
|--------------|------------|
| **Strg+J** / **Shift+Enter** | Neue Zeile im Input |
| **Strg+G** | Im externen Editor bearbeiten |
| **Strg+O** | Tool-Ausgabe ein/ausblenden |
| **Strg+T** | Todo-Liste ein/ausblenden |
| **Strg+\** | Debug-Konsole ein/ausblenden |
| **Shift+Tab** | Agenten wechseln |
| **Pfeil hoch/runter** | Durch Command-History navigieren |
| **Strg+C** | Abbrechen |
| **Strg+D** | Exit (wie `/exit`) |

---

## 📝 Beispiel-Workflows

### Workflow 1: Bug finden und beheben

```
1. > "Suche nach 'TODO' im gesamten Projekt"
2. > grep(pattern="TODO", path=".")
3. > "Öffne die Datei mit dem wichtigsten TODO"
4. > read(file_path="src/api.ts")
5. > "Behebe den Bug in Zeile 42"
6. > edit(file_path="src/api.ts", old="...", new="...")
7. > "Führe die Tests aus"
8. > bash(command="npm test")
```

---

### Workflow 2: Neues Feature implementieren

```
1. > "Erstelle eine neue API-Route für /users"
2. > write_file(path="src/routes/users.ts", content="...")
3. > "Füge die Route in @src/app.ts ein"
4. > edit(file_path="src/app.ts", old="...", new="...")
5. > "Erstelle Tests für die neue Route"
6. > write_file(path="tests/users.test.ts", content="...")
7. > "Führe die Tests aus"
8. > bash(command="npm test")
```

---

### Workflow 3: Code Review

```
1. > /agents review
2. > "Review die letzten 5 Commits"
3. > bash(command="git log --oneline -5")
4. > "Analysiere die Änderungen und gib Feedback"
5. > git_status()
6. > "Erstelle einen detaillierten Review-Bericht"
```

---

## 🚀 Nächste Schritte

Nach dem Quick Start:

1. **[Konfiguration →](./configuration.md)** – UltraCode AI anpassen
2. **[AI-Versionierung →](../AI-FEATURES/versioning-system.md)** – Einzigartige Features entdecken
3. **[Tools-Referenz →](../REFERENCE/tools-reference.md)** – Alle 14 Tools kennenlernen
4. **[Agenten →](../DEVELOPMENT/agents-reference.md)** – Agenten im Detail

---

## 🔍 Häufige Fragen

### Q: Wie wechsle ich das LLM-Modell?

```
> /config set model mistral-large
> /config set provider mistral
```

Unterstützte Anbieter: `mistral`, `anthropic`, `openai`, `local`

---

### Q: Wie füge ich einen API-Key hinzu?

```bash
# Interaktiv
ultracode-ai --setup

# Oder manuell
ultracode-ai --config set MISTRAL_API_KEY=xxx
```

---

### Q: Wie deaktiviere ich ein Tool?

```
> /config disable-tool write_file
> /config enable-tool write_file
```

---

### Q: Wie sehe ich die Geschichte?

```
> /history
> /history --limit 20
```

---

## 📞 Hilfe erhalten

- **In-App Hilfe**: `/help`
- **Dokumentation**: [https://ultracode.ai/docs](https://ultracode.ai/docs)
- **Discord**: [https://discord.gg/ultracode](https://discord.gg/ultracode)
- **GitHub**: [https://github.com/AndreasSchwan-SIMO/UltraCode](https://github.com/AndreasSchwan-SIMO/UltraCode)
