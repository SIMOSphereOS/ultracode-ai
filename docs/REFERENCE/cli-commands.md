# CLI-Kommandos

> **Komplette Referenz aller UltraCode CLI-Kommandos - Mutter aller Entwicklungstools**

---

## 🚀 Übersicht

Die UltraCode CLI ist ein mächtiges Command-Line-Interface für die Interaktion mit UltraCode. Sie bietet Zugriff auf alle Funktionen: AI, Code-Generierung, Versionierung, Verwaltung und mehr.

---

## 📋 Installation & Setup

### Installation

```bash
# Global installieren (empfohlen)
npm install -g ultracode

# Oder mit pnpm
pnpm add -g ultracode

# Oder mit yarn
yarn global add ultracode
```

### Version prüfen

```bash
ultracode version
# Output: ultracode@1.0.0
```

### Hilfe anzeigen

```bash
# Allgemeine Hilfe
ultracode --help
ultracode -h

# Hilfe für spezifisches Kommando
ultracode <kommando> --help
```

---

## 🔐 Authentication

### Login

```bash
# Login mit E-Mail und Passwort
ultracode login
# → Prompt für E-Mail und Passwort

# Mit Parametern
ultracode login --email alice@yourcompany.com --password secure-password

# Mit OAuth
ultracode login --provider google
ultracode login --provider github
ultracode login --provider azure
```

**Optionen:**
- `--email, -e`: E-Mail-Adresse
- `--password, -p`: Passwort (oder Prompt)
- `--provider, -P`: OAuth-Provider (google, github, azure, okta)
- `--token, -t`: API-Token (für Nicht-Interaktive Logins)
- `--server, -s`: Server-URL (Standard: https://api.ultracode.ai)

### Logout

```bash
ultracode logout
ultracode logout --all  # Alle Sessions beenden
```

### Whoami

```bash
ultracode whoami
# → Zeigt aktuellen Benutzer und Session-Informationen
```

---

## 🤖 AI-Kommandos

### Ask (Frage stellen)

```bash
# Einfache Frage
ultracode ask "Wie schreibe ich eine TypeScript-Funktion für User Authentication?"

# Mit Kontext
ultracode ask "Wie optimiere ich diese Funktion?" --context "Die Funktion wird für 1000+ Benutzer verwendet"

# Mit Datei-Kontext
ultracode ask "Was macht dieser Code?" --file app.ts
```

**Optionen:**
- `--context, -c`: Zusätzlicher Kontext
- `--file, -f`: Datei für Kontext
- `--language, -l`: Programmiersprache
- `--model, -m`: AI-Modell (gpt-4, claude-3-sonnet, mistral-large)
- `--temperature, -t`: Kreativität (0-2, Standard: 0.7)
- `--max-tokens, -T`: Maximale Tokens (Standard: 4096)

### Chat (Interaktiver Chat)

```bash
# Chat-Modus starten
ultracode chat

# Mit Initial-Nachricht
ultracode chat "Erkläre mir React Hooks"

# Mit Modell
ultracode chat --model gpt-4
```

**Optionen:**
- `--model, -m`: AI-Modell
- `--system, -s`: System-Prompt
- `--temperature, -t`: Temperatur
- `--no-stream`: Streaming deaktivieren

### Complete (Code vervollständigen)

```bash
# Code vervollständigen
ultracode complete --file app.ts --line 42

# Mit manuellem Prompt
ultracode complete --prompt "def calculate_factorial(n):"

# Mehrere Vorschläge
ultracode complete --file app.ts --line 42 --count 5
```

**Optionen:**
- `--file, -f`: Dateipfad
- `--line, -l`: Zeilennummer
- `--prompt, -p`: Manueller Prompt
- `--count, -c`: Anzahl Vorschläge (Standard: 1)
- `--language, -L`: Sprache
- `--model, -m`: Modell
- `--temperature, -t`: Temperatur

### Analyze (Code analysieren)

```bash
# Datei analysieren
ultracode analyze --file app.ts

# Verzeichnis analysieren
ultracode analyze --dir src/

# Spezifische Analysen
ultracode analyze --file app.ts --check quality,security,performance
```

**Optionen:**
- `--file, -f`: Dateipfad
- `--dir, -d`: Verzeichnispfad
- `--check, -c`: Analyse-Typen (quality, security, performance, complexity, duplicates)
- `--format, -F`: Ausgabeformat (json, markdown, table)
- `--output, -o`: Ausgabedatei
- `--severity, -s`: Mindest-Severität (error, warning, info)

---

## 💻 Code-Kommandos

### Generate (Code generieren)

```bash
# Funktion generieren
ultracode generate --type function --language typescript --name "UserService"

# Klasse generieren
ultracode generate --type class --language python --name "UserModel"

# Komplette Datei generieren
ultracode generate --type file --language javascript --name "utils.js" --requirements "Helper functions for strings and arrays"

# Projekt-Struktur generieren
ultracode generate --type project --language typescript --name "New Project" --template react-express
```

**Optionen:**
- `--type, -t`: Typ (function, class, file, project, test, documentation)
- `--language, -l`: Programmiersprache
- `--name, -n`: Name
- `--description, -d`: Beschreibung
- `--requirements, -r`: Anforderungen (kommagetrennt)
- `--template, -T`: Vorlage
- `--output, -o`: Ausgabepfad
- `--overwrite, -w`: Überschreiben (Standard: false)

### Optimize (Code optimieren)

```bash
# Datei optimieren
ultracode optimize --file app.ts

# Verzeichnis optimieren
ultracode optimize --dir src/

# Mit spezifischen Optimierungen
ultracode optimize --file app.ts --focus performance,memory
```

**Optionen:**
- `--file, -f`: Dateipfad
- `--dir, -d`: Verzeichnispfad
- `--focus, -F`: Fokus (performance, memory, readability, security)
- `--aggressive, -a`: Aggressive Optimierung
- `--dry-run, -n`: Nur Vorschau
- `--interactive, -i`: Interaktiv

### Explain (Code erklären)

```bash
# Code erklären
ultracode explain --file app.ts

# Funktion erklären
ultracode explain --file app.ts --function calculateSum

# Zeile erklären
ultracode explain --file app.ts --line 42
```

**Optionen:**
- `--file, -f`: Dateipfad
- `--function, -F`: Funktionsname
- `--line, -l`: Zeilennummer
- `--class, -c`: Klassenname
- `--language, -L`: Sprache
- `--depth, -d`: Erklärungstiefe (1-5, Standard: 3)

### Refactor (Code refaktorieren)

```bash
# Code refaktorieren
ultracode refactor --file app.ts

# Funktion extrahieren
ultracode refactor --file app.ts --extract-function calculateSum

# Duplikate entfernen
ultracode refactor --file app.ts --remove-duplicates
```

**Optionen:**
- `--file, -f`: Dateipfad
- `--extract-function, -F`: Funktion extrahieren
- `--extract-class, -C`: Klasse extrahieren
- `--remove-duplicates, -d`: Duplikate entfernen
- `--dry-run, -n`: Nur Vorschau
- `--interactive, -i`: Interaktiv

### Review (Code-Review)

```bash
# Pull-Request Review
ultracode review --pull-request 123

# Lokale Dateien reviewen
ultracode review --files app.ts,utils.ts

# Mit spezifischen Checks
ultracode review --pull-request 123 --check quality,security
```

**Optionen:**
- `--pull-request, -p`: Pull-Request-Nummer
- `--files, -f`: Dateien (kommagetrennt)
- `--check, -c`: Checks (quality, security, performance, consistency)
- `--severity, -s`: Mindest-Severität
- `--output, -o`: Ausgabedatei
- `--format, -F`: Ausgabeformat

---

## 🔢 Versioning-Kommandos

### Analyze (Änderungen analysieren)

```bash
# Änderungen analysieren
ultracode version analyze

# Mit Git-Changes
ultracode version analyze --git "HEAD~1..HEAD"

# Mit manuellen Änderungen
ultracode version analyze --changes "feat: Add user authentication"
```

**Optionen:**
- `--git, -g`: Git-Bereich
- `--changes, -c`: Manuelle Änderungen
- `--project, -p`: Projekt-Name
- `--format, -F`: Ausgabeformat
- `--output, -o`: Ausgabedatei

### Suggest (Version vorschlagen)

```bash
# Version vorschlagen
ultracode version suggest

# Für spezifisches Projekt
ultracode version suggest --project "New Product"

# Mit Änderungen
ultracode version suggest --changes "feat: Add user authentication, fix: Login bug"
```

**Optionen:**
- `--project, -p`: Projekt-Name
- `--changes, -c`: Änderungen
- `--current, -C`: Aktuelle Version
- `--strategy, -s`: Strategie (semver, date, calver)
- `--format, -F`: Ausgabeformat

### Release (Release planen)

```bash
# Release planen
ultracode release plan

# Für spezifisches Projekt
ultracode release plan --project "New Product"

# Vollständiger Release-Plan
ultracode release plan --full
```

**Optionen:**
- `--project, -p`: Projekt-Name
- `--version, -v`: Version
- `--full, -f`: Vollständiger Plan
- `--checklist, -c`: Checkliste generieren
- `--changelog, -C`: Changelog generieren
- `--output, -o`: Ausgabedatei

### Quality-Gate (Qualitätscheck)

```bash
# Qualitätscheck durchführen
ultracode version quality-gate

# Mit spezifischen Kriterien
ultracode version quality-gate --min-quality 80 --min-security 95

# Für Pull-Request
ultracode version quality-gate --pull-request 123
```

**Optionen:**
- `--min-quality, -q`: Mindest-Qualität (0-100)
- `--min-security, -s`: Mindest-Sicherheit (0-100)
- `--min-performance, -p`: Mindest-Performance (0-100)
- `--pull-request, -P`: Pull-Request-Nummer
- `--format, -F`: Ausgabeformat

---

## 👤 User-Kommandos

### Create (Benutzer erstellen)

```bash
# Benutzer erstellen
ultracode user create alice \
  --email alice@yourcompany.com \
  --password secure-password \
  --first-name Alice \
  --last-name Smith \
  --role developer
```

**Optionen:**
- `--email, -e`: E-Mail
- `--password, -p`: Passwort
- `--first-name, -f`: Vorname
- `--last-name, -l`: Nachname
- `--role, -r`: Rolle (super-admin, admin, team-lead, developer, viewer, ai-only)
- `--team, -t`: Team

### List (Benutzer auflisten)

```bash
# Alle Benutzer auflisten
ultracode user list

# Gefiltert nach Rolle
ultracode user list --role developer

# Gefiltert nach Team
ultracode user list --team "Dev Team A"

# Suche
ultracode user list --search "Alice"
```

**Optionen:**
- `--role, -r`: Rolle
- `--team, -t`: Team
- `--search, -s`: Suche
- `--limit, -l`: Limit (Standard: 50)
- `--offset, -o`: Offset
- `--format, -F`: Ausgabeformat

### Show (Benutzer anzeigen)

```bash
# Benutzer anzeigen
ultracode user show alice
ultracode user show alice@yourcompany.com
```

**Optionen:**
- `--json, -j`: JSON-Ausgabe
- `--yaml, -y`: YAML-Ausgabe

### Update (Benutzer aktualisieren)

```bash
# Benutzer aktualisieren
ultracode user update alice \
  --first-name Alice \
  --last-name Smith \
  --role team-lead
```

**Optionen:**
- `--email, -e`: E-Mail
- `--first-name, -f`: Vorname
- `--last-name, -l`: Nachname
- `--role, -r`: Rolle
- `--password, -p`: Passwort

### Delete (Benutzer löschen)

```bash
# Benutzer löschen
ultracode user delete alice --force
```

**Optionen:**
- `--force, -f`: Erzwingen (ohne Bestätigung)

### Import (Benutzer importieren)

```bash
# Aus CSV importieren
ultracode user import users.csv

# Aus JSON importieren
ultracode user import users.json
```

### Export (Benutzer exportieren)

```bash
# Als CSV exportieren
ultracode user export --format csv > users.csv

# Als JSON exportieren
ultracode user export --format json > users.json
```

---

## 👥 Team-Kommandos

### Create (Team erstellen)

```bash
# Team erstellen
ultracode team create "Dev Team A" \
  --description "Backend Development Team" \
  --lead bob@yourcompany.com \
  --members alice@yourcompany.com,charlie@yourcompany.com
```

**Optionen:**
- `--description, -d`: Beschreibung
- `--lead, -l`: Team-Leiter
- `--members, -m`: Mitglieder (kommagetrennt)

### List (Teams auflisten)

```bash
# Alle Teams auflisten
ultracode team list

# Suche
ultracode team list --search "Dev"
```

**Optionen:**
- `--search, -s`: Suche
- `--limit, -l`: Limit
- `--format, -F`: Ausgabeformat

### Show (Team anzeigen)

```bash
# Team anzeigen
ultracode team show "Dev Team A"
ultracode team show "Dev Team A" --members
ultracode team show "Dev Team A" --projects
```

**Optionen:**
- `--members, -m`: Mitglieder anzeigen
- `--projects, -p`: Projekte anzeigen
- `--json, -j`: JSON-Ausgabe

### Update (Team aktualisieren)

```bash
# Team aktualisieren
ultracode team update "Dev Team A" \
  --name "Dev Team Alpha" \
  --lead bob@yourcompany.com
```

**Optionen:**
- `--name, -n`: Name
- `--description, -d`: Beschreibung
- `--lead, -l`: Team-Leiter

### Add (Mitglied hinzufügen)

```bash
# Mitglied hinzufügen
ultracode team add "Dev Team A" alice@yourcompany.com
```

### Remove (Mitglied entfernen)

```bash
# Mitglied entfernen
ultracode team remove "Dev Team A" alice@yourcompany.com
```

### Delete (Team löschen)

```bash
# Team löschen
ultracode team delete "Dev Team A" --force
```

---

## 📁 Project-Kommandos

### Create (Projekt erstellen)

```bash
# Projekt erstellen
ultracode project create "New Product" \
  --description "New product development" \
  --team "Dev Team A" \
  --lead bob@yourcompany.com \
  --visibility private \
  --template react-typescript
```

**Optionen:**
- `--description, -d`: Beschreibung
- `--team, -t`: Team
- `--lead, -l`: Projekt-Leiter
- `--visibility, -v`: Sichtbarkeit (private, team, organization, public)
- `--template, -T`: Vorlage

### List (Projekte auflisten)

```bash
# Alle Projekte auflisten
ultracode project list

# Gefiltert nach Team
ultracode project list --team "Dev Team A"

# Gefiltert nach Benutzer
ultracode project list --user alice@yourcompany.com
```

**Optionen:**
- `--team, -t`: Team
- `--user, -u`: Benutzer
- `--visibility, -v`: Sichtbarkeit
- `--search, -s`: Suche
- `--limit, -l`: Limit
- `--format, -F`: Ausgabeformat

### Show (Projekt anzeigen)

```bash
# Projekt anzeigen
ultracode project show "New Product"
ultracode project show "New Product" --files
ultracode project show "New Product" --members
```

**Optionen:**
- `--files, -f`: Dateien anzeigen
- `--members, -m`: Mitglieder anzeigen
- `--json, -j`: JSON-Ausgabe

### Update (Projekt aktualisieren)

```bash
# Projekt aktualisieren
ultracode project update "New Product" \
  --description "Enhanced product with AI features" \
  --visibility team
```

**Optionen:**
- `--description, -d`: Beschreibung
- `--team, -t`: Team
- `--lead, -l`: Projekt-Leiter
- `--visibility, -v`: Sichtbarkeit

### Add (Mitglied hinzufügen)

```bash
# Mitglied zu Projekt hinzufügen
ultracode project add "New Product" alice@yourcompany.com --role developer
```

**Optionen:**
- `--role, -r`: Rolle (team-lead, developer, viewer)

### Remove (Mitglied entfernen)

```bash
# Mitglied aus Projekt entfernen
ultracode project remove "New Product" alice@yourcompany.com
```

### Delete (Projekt löschen)

```bash
# Projekt löschen
ultracode project delete "New Product" --force
```

---

## 🧠 Knowledge-Kommandos

### Add (Wissen hinzufügen)

```bash
# Wissen hinzufügen
ultracode knowledge add "TypeScript Best Practices" \
  --content "Always use interfaces for type definitions..." \
  --category "Best Practices" \
  --scope global \
  --team "Dev Team A"
```

**Optionen:**
- `--content, -c`: Inhalt
- `--category, -C`: Kategorie
- `--scope, -s`: Bereich (global, team, project, user)
- `--team, -t`: Team
- `--tags, -T`: Tags (kommagetrennt)

### Search (Wissen durchsuchen)

```bash
# Wissen durchsuchen
ultracode knowledge search "TypeScript"
ultracode knowledge search "performance optimization"
```

**Optionen:**
- `--category, -C`: Kategorie
- `--scope, -s`: Bereich
- `--team, -t`: Team
- `--limit, -l`: Limit
- `--format, -F`: Ausgabeformat

### Update (Wissen aktualisieren)

```bash
# Wissen aktualisieren
ultracode knowledge update "TypeScript Best Practices" \
  --content "Updated content..."
```

**Optionen:**
- `--content, -c`: Inhalt
- `--category, -C`: Kategorie
- `--tags, -T`: Tags

### Delete (Wissen löschen)

```bash
# Wissen löschen
ultracode knowledge delete "TypeScript Best Practices"
```

### Export (Wissen exportieren)

```bash
# Wissen exportieren
ultracode knowledge export --format markdown > knowledge-base.md
ultracode knowledge export --format json > knowledge-base.json
```

**Optionen:**
- `--format, -F`: Format (markdown, json, yaml)
- `--category, -C`: Kategorie
- `--scope, -s`: Bereich

### Import (Wissen importieren)

```bash
# Wissen importieren
ultracode knowledge import knowledge-base.md
ultracode knowledge import knowledge-base.json
```

---

## 💬 Session-Kommandos

### Start (Session starten)

```bash
# Session starten
ultracode session start --type pair --project "New Product"

# Shared Session
ultracode session start --type shared --users alice,bob,charlie

# Mit Aufzeichnung
ultracode session start --type shared --record
```

**Optionen:**
- `--type, -t`: Typ (pair, shared, review)
- `--project, -p`: Projekt
- `--users, -u`: Benutzer (kommagetrennt)
- `--record, -r`: Aufzeichnen

### Join (Session beitreten)

```bash
# Session beitreten
ultracode session join session_123
```

### Leave (Session verlassen)

```bash
# Session verlassen
ultracode session leave session_123
```

### End (Session beenden)

```bash
# Session beenden
ultracode session end session_123
```

### List (Sessions auflisten)

```bash
# Aktive Sessions anzeigen
ultracode session list
ultracode session list --active
ultracode session list --recorded
```

### Play (Aufzeichnung abspielen)

```bash
# Session-Aufzeichnung abspielen
ultracode session play session_123
```

---

## 📊 Analytics-Kommandos

### Team Analytics

```bash
# Team-Statistiken
ultracode analytics team "Dev Team A"

# Team-Produktivität
ultracode analytics team "Dev Team A" --productivity

# Team-Code-Qualität
ultracode analytics team "Dev Team A" --quality
```

**Optionen:**
- `--productivity, -p`: Produktivität
- `--quality, -q`: Qualität
- `--period, -P`: Zeitraum (day, week, month, quarter, year)
- `--format, -F`: Ausgabeformat
- `--output, -o`: Ausgabedatei

### Project Analytics

```bash
# Projekt-Statistiken
ultracode analytics project "New Product"

# Projekt-Fortschritt
ultracode analytics project "New Product" --progress

# Projekt-Qualität
ultracode analytics project "New Product" --quality
```

**Optionen:**
- `--progress, -p`: Fortschritt
- `--quality, -q`: Qualität
- `--period, -P`: Zeitraum
- `--format, -F`: Ausgabeformat

### User Analytics

```bash
# Benutzer-Statistiken
ultracode analytics user alice@yourcompany.com

# Benutzer-Produktivität
ultracode analytics user alice@yourcompany.com --productivity
```

---

## 🔔 Notification-Kommandos

### List (Benachrichtigungen auflisten)

```bash
# Alle Benachrichtigungen
ultracode notification list

# Ungelesene Benachrichtigungen
ultracode notification list --unread

# Nach Typ gefiltert
ultracode notification list --type review
```

**Optionen:**
- `--unread, -u`: Nur ungelesene
- `--type, -t`: Typ (review, mention, system, security)
- `--limit, -l`: Limit
- `--format, -F`: Ausgabeformat

### Show (Benachrichtigung anzeigen)

```bash
# Benachrichtigung anzeigen
ultracode notification show 123
```

### Mark (Benachrichtigung markieren)

```bash
# Als gelesen markieren
ultracode notification mark 123 --read

# Alle als gelesen markieren
ultracode notification mark all --read
```

**Optionen:**
- `--read, -r`: Als gelesen markieren
- `--unread, -u`: Als ungelesen markieren

### Settings (Benachrichtigungs-Einstellungen)

```bash
# Einstellungen anzeigen
ultracode notification settings

# Einstellungen aktualisieren
ultracode notification settings --email false --slack true
```

---

## ⚙️ Config-Kommandos

### Get (Konfiguration anzeigen)

```bash
# Alle Konfigurationen anzeigen
ultracode config get

# Spezifische Konfiguration
ultracode config get ai.model
ultracode config get editor.theme
```

### Set (Konfiguration setzen)

```bash
# Konfiguration setzen
ultracode config set ai.model gpt-4
ultracode config set editor.theme dark

# Mehrere Konfigurationen
ultracode config set ai.model gpt-4 ai.temperature 0.7
```

### List (Konfigurationen auflisten)

```bash
# Alle verfügbaren Konfigurationen
ultracode config list

# Nach Kategorie gefiltert
ultracode config list --category ai
```

**Optionen:**
- `--category, -c`: Kategorie
- `--show-values, -v`: Werte anzeigen

### Reset (Konfiguration zurücksetzen)

```bash
# Einzelne Konfiguration zurücksetzen
ultracode config reset ai.model

# Alle Konfigurationen zurücksetzen
ultracode config reset all
```

---

## 🔧 System-Kommandos

### Health (Health Check)

```bash
# System-Status prüfen
ultracode system health
```

### Status (System-Status)

```bash
# Detaillierten Status anzeigen
ultracode system status
```

### Logs (Logs anzeigen)

```bash
# Logs anzeigen
ultracode system logs

# Gefilterte Logs
ultracode system logs --level error
ultracode system logs --service ai
```

**Optionen:**
- `--level, -l`: Log-Level (debug, info, warn, error)
- `--service, -s`: Service
- `--follow, -f`: Folge Logs (tail -f)
- `--limit, -L`: Anzahl Zeilen

### Restart (Neustart)

```bash
# Services neustarten
ultracode system restart

# Spezifischen Service neustarten
ultracode system restart ai
```

---

## 🔄 Update-Kommandos

### Check (Update prüfen)

```bash
# Auf Updates prüfen
ultracode update check
```

### Apply (Update anwenden)

```bash
# Update anwenden
ultracode update apply

# Auf spezifische Version
ultracode update apply 1.1.0
```

---

## 📝 Kurzreferenz

### Häufige Kommandos

| **Aktion** | **Kommando** |
|------------|--------------|
| Hilfe | `ultracode --help` |
| Version | `ultracode version` |
| Login | `ultracode login` |
| Logout | `ultracode logout` |
| Wer bin ich? | `ultracode whoami` |
| Frage stellen | `ultracode ask "Frage"` |
| Code generieren | `ultracode generate --type function --language ts --name "MyFunc"` |
| Code analysieren | `ultracode analyze --file app.ts` |
| Version vorschlagen | `ultracode version suggest` |
| Release planen | `ultracode release plan` |
| Benutzer auflisten | `ultracode user list` |
| Teams auflisten | `ultracode team list` |
| Projekte auflisten | `ultracode project list` |
| Wissen durchsuchen | `ultracode knowledge search "TypeScript"` |

---

## 📞 Support

- **CLI-Fragen**: cli@ultracode.ai
- **Allgemeiner Support**: support@ultracode.ai

© 2026 UltraCode Team
