# Slash Commands

> **Komplette Referenz aller UltraCode Slash Commands - Intelligente Code-Bearbeitung**

---

## 🚀 Übersicht

Slash Commands sind der schnellste Weg, UltraCode direkt in Ihrem Editor zu nutzen. Mit einem `/` öffnen Sie die magische Welt der AI-gestützten Entwicklung.

---

## 📋 Grundlagen

### Prefix
- **Standard**: `/`
- **Alternativ**: Konfigurierbar in den Einstellungen

### Autovervollständigung
- Alle Slash Commands unterstützen Autovervollständigung
- Kontextabhängige Vorschläge
- Intelligente Parameter-Vervollständigung

### Syntax
```
/ <command> [parameter1] [parameter2] ... [options]
```

---

## 🤖 AI Commands

### /ask - Frage stellen

**Beschreibung**: Stelle eine Frage an die AI

**Syntax**:
```
/ask <frage>
```

**Beispiele**:
```
/ask Wie schreibe ich eine TypeScript-Funktion für User Authentication?
/ask Was ist der beste Weg, um eine REST API in Node.js zu implementieren?
/ask Wie optimiere ich diese Datenbankabfrage?
```

**Optionen**:
- `--context, -c`: Zusätzlicher Kontext hinzufügen
- `--model, -m`: AI-Modell auswählen (gpt-4, claude-3-sonnet, mistral-large)
- `--temperature, -t`: Kreativität einstellen (0-2)
- `--max-tokens, -T`: Maximale Tokens festlegen

**Aliase**: `/question`, `/query`, `/q`

---

### /explain - Code erklären

**Beschreibung**: Code oder Konzepte erklären lassen

**Syntax**:
```
/explain <code oder konzept>
```

**Beispiele**:
```
/explain function calculateSum(a, b) { return a + b; }
/explain React Hooks
/explain Wie funktioniert ein Promise in JavaScript?
```

**Optionen**:
- `--file, -f`: Datei angeben
- `--line, -l`: Zeilennummer
- `--function, -F`: Funktionsname
- `--depth, -d`: Erklärungstiefe (1-5)
- `--language, -L`: Programmiersprache

**Aliase**: `/what`, `/describe`, `/clarify`

---

### /optimize - Code optimieren

**Beschreibung**: Code für Performance, Lesbarkeit oder Speichernutzung optimieren

**Syntax**:
```
/optimize <code>
```

**Beispiele**:
```
/optimize function calculateFibonacci(n) { if (n <= 1) return n; return calculateFibonacci(n-1) + calculateFibonacci(n-2); }
/optimize for (let i = 0; i < array.length; i++) { console.log(array[i]); }
```

**Optionen**:
- `--focus, -F`: Optimierungsfokus (performance, memory, readability, security)
- `--aggressive, -a`: Aggressive Optimierung
- `--file, -f`: Dateipfad
- `--selection, -s`: Aktuelle Auswahl verwenden

**Aliase**: `/improve`, `/enhance`

---

### /refactor - Code refaktorieren

**Beschreibung**: Code-Struktur verbessern

**Syntax**:
```
/refactor <code>
```

**Beispiele**:
```
/refactor Diese Funktion ist zu lang, bitte aufteilen
/refactor Extrahiere die Validierungslogik in eine separate Funktion
```

**Optionen**:
- `--extract, -e`: Extrahiere (function, class, interface)
- `--file, -f`: Dateipfad
- `--selection, -s`: Aktuelle Auswahl verwenden
- `--dry-run, -n`: Nur Vorschau

**Aliase**: `/restructure`, `/cleanup`

---

### /document - Dokumentation generieren

**Beschreibung**: Automatisch Dokumentation generieren

**Syntax**:
```
/document <code oder funktion>
```

**Beispiele**:
```
/document function calculateSum(a, b) { return a + b; }
/document UserService Class
```

**Optionen**:
- `--type, -t`: Dokumentationstyp (jsdoc, typescript, markdown, html)
- `--file, -f`: Dateipfad
- `--function, -F`: Funktionsname
- `--class, -c`: Klassenname
- `--output, -o`: Ausgabedatei

**Aliase**: `/doc`, `/generate-docs`

---

### /debug - Code debuggen

**Beschreibung**: Hilfe beim Debuggen von Code

**Syntax**:
```
/debug <code oder beschreibung>
```

**Beispiele**:
```
/debug Warum gibt diese Funktion undefined zurück?
/debug function findUser(id) { return users.find(u => u.id === id); }
/debug Diese API gibt immer 404 zurück
```

**Optionen**:
- `--file, -f`: Dateipfad
- `--line, -l`: Zeilennummer
- `--error, -e`: Fehlermeldung

**Aliase**: `/fix`, `/troubleshoot`

---

## 💻 Code Commands

### /generate - Code generieren

**Beschreibung**: Code basierend auf Anforderungen generieren

**Syntax**:
```
/generate <beschreibung>
```

**Beispiele**:
```
/generate TypeScript Interface für User mit id, name, email, age
/generate Python Klasse für Datenbankverbindung
/generate React Komponente für User-List
```

**Optionen**:
- `--type, -t`: Typ (function, class, file, project, test, documentation)
- `--language, -l`: Programmiersprache
- `--name, -n`: Name
- `--template, -T`: Vorlage
- `--output, -o`: Ausgabedatei

**Aliase**: `/create`, `/make`, `/build`

---

### /insert - Code einfügen

**Beschreibung**: Code an aktueller Position einfügen

**Syntax**:
```
/insert <code oder beschreibung>
```

**Beispiele**:
```
/insert TypeScript Interface für User
/insert JSDoc Kommentar für diese Funktion
/insert Try-Catch Block für diese Funktion
```

**Optionen**:
- `--before, -b`: Vor der aktuellen Zeile einfügen
- `--after, -a`: Nach der aktuellen Zeile einfügen
- `--replace, -r`: Aktuelle Zeile ersetzen
- `--language, -l`: Programmiersprache

**Aliase**: `/add`, `/paste`

---

### /replace - Code ersetzen

**Beschreibung**: Ausgewählten Code ersetzen

**Syntax**:
```
/replace <neuer code>
```

**Beispiele**:
```
/replace Verwende map statt forEach
/replace if (x > 10) return true;
```

**Optionen**:
- `--selection, -s`: Aktuelle Auswahl verwenden
- `--file, -f`: Dateipfad
- `--line, -l`: Zeilennummer
- `--all, -a`: Alle Vorkommen ersetzen

**Aliase**: `/substitute`, `/swap`

---

### /new - Neue Datei erstellen

**Beschreibung**: Neue Datei mit Inhalt erstellen

**Syntax**:
```
/new <dateiname>
```

**Beispiele**:
```
/new UserService.ts
/new utils.js
/new components/UserList.tsx
```

**Optionen**:
- `--template, -t`: Vorlage verwenden
- `--type, -T`: Typ (class, function, component, module)
- `--language, -l`: Programmiersprache

**Aliase**: `/create-file`, `/touch`

---

### /edit - Code bearbeiten

**Beschreibung**: Code bearbeiten mit AI-Unterstützung

**Syntax**:
```
/edit <änderungsbeschreibung>
```

**Beispiele**:
```
/edit Füge TypeScript-Typen hinzu
/edit Korrigiere die Sicherheitslücke
/edit Verbessere die Performance
```

**Optionen**:
- `--file, -f`: Dateipfad
- `--selection, -s`: Aktuelle Auswahl verwenden
- `--line, -l`: Zeilennummer
- `--function, -F`: Funktionsname

**Aliase**: `/modify`, `/change`, `/update`

---

### /test - Tests generieren

**Beschreibung**: Automatisch Tests generieren

**Syntax**:
```
/test <code oder funktion>
```

**Beispiele**:
```
/test function calculateSum(a, b) { return a + b; }
/test UserService Class
/test Generate unit tests for this file
```

**Optionen**:
- `--type, -t`: Test-Typ (unit, integration, e2e)
- `--framework, -f`: Test-Framework (jest, mocha, vitest, pytest)
- `--coverage, -c`: Code Coverage Ziel
- `--file, -F`: Dateipfad

**Aliase**: `/generate-test`, `/unit-test`

---

## 🔍 Navigation & Search Commands

### /go - Zu Datei navigieren

**Beschreibung**: Schnell zu einer Datei navigieren

**Syntax**:
```
/go <datei oder pfad>
```

**Beispiele**:
```
/go src/services/UserService.ts
/go UserService
/go components/
```

**Optionen**:
- `--line, -l`: Zu spezifischer Zeile
- `--function, -F`: Zu Funktion
- `--class, -c`: Zu Klasse

**Aliase**: `/open`, `/navigate`, `/jump`

---

### /search - Suche

**Beschreibung**: In Code suchen

**Syntax**:
```
/search <suchbegriff>
```

**Beispiele**:
```
/search UserService
/search function calculate*
/search /users\d+/
```

**Optionen**:
- `--regex, -r`: Regulärer Ausdruck
- `--case-sensitive, -c`: Groß-/Kleinschreibung beachten
- `--files, -f`: Nur Dateinamen
- `--dir, -d`: Verzeichnis angeben
- `--exclude, -e`: Ausschließen

**Aliase**: `/find`, `/grep`, `/query`

---

### /find - Suche in aktueller Datei

**Beschreibung**: In aktueller Datei suchen

**Syntax**:
```
/find <suchbegriff>
```

**Beispiele**:
```
/find UserService
/find calculate
/find TODO
```

**Optionen**:
- `--next, -n`: Nächstes Ergebnis
- `--previous, -p`: Vorheriges Ergebnis
- `--all, -a`: Alle Ergebnisse

**Aliase**: `/search-file`, `/locate`

---

### /peek - Vorschau

**Beschreibung**: Dateivorschau ohne Navigation

**Syntax**:
```
/peek <datei>
```

**Beispiele**:
```
/peek UserService.ts
/peek src/utils.js
```

**Optionen**:
- `--lines, -l`: Anzahl Zeilen
- `--around, -a`: Zeilen um Cursor

---

## 🔢 Versioning Commands

### /version - Version analysieren

**Beschreibung**: Änderungen analysieren und Version vorschlagen

**Syntax**:
```
/version <änderungsbeschreibung>
```

**Beispiele**:
```
/version Added user authentication feature
/version Fixed login bug and added password reset
/version Breaking change: Changed API response format
```

**Optionen**:
- `--current, -c`: Aktuelle Version
- `--strategy, -s`: Versionsstrategie (semver, date, calver)
- `--changes, -C`: Mehrere Änderungen
- `--project, -p`: Projekt-Name

**Aliase**: `/bump`, `/release`, `/semver`

---

### /release - Release planen

**Beschreibung**: Release-Plan generieren

**Syntax**:
```
/release <version oder beschreibung>
```

**Beispiele**:
```
/release 2.0.0
/release Plan release for new features
/release Generate changelog
```

**Optionen**:
- `--version, -v`: Spezifische Version
- `--project, -p`: Projekt-Name
- `--checklist, -c`: Checkliste generieren
- `--changelog, -C`: Changelog generieren
- `--full, -f`: Vollständiger Plan

**Aliase**: `/deploy`, `/publish`

---

### /quality-gate - Qualitätscheck

**Beschreibung**: Qualitätsgate-Check durchführen

**Syntax**:
```
/quality-gate <code oder datei>
```

**Beispiele**:
```
/quality-gate UserService.ts
/quality-gate Check this code before merge
```

**Optionen**:
- `--file, -f`: Dateipfad
- `--min-quality, -q`: Mindest-Qualität (0-100)
- `--min-security, -s`: Mindest-Sicherheit (0-100)
- `--min-performance, -p`: Mindest-Performance (0-100)

**Aliase**: `/check-quality`, `/validate`

---

### /changelog - Changelog generieren

**Beschreibung**: Changelog generieren

**Syntax**:
```
/changelog <version oder bereich>
```

**Beispiele**:
```
/changelog 2.0.0
/changelog HEAD~1..HEAD
/changelog Generate from git commits
```

**Optionen**:
- `--version, -v`: Version
- `--range, -r`: Git-Bereich
- `--format, -f`: Format (markdown, json, html)
- `--file, -F`: Ausgabedatei

**Aliase**: `/changes`, `/history`

---

## 🔍 Review Commands

### /review - Code Review

**Beschreibung**: Code-Review durchführen

**Syntax**:
```
/review <code oder datei>
```

**Beispiele**:
```
/review UserService.ts
/review Pull request #123
/review Check this code for issues
```

**Optionen**:
- `--file, -f`: Dateipfad
- `--pull-request, -p`: Pull-Request-Nummer
- `--check, -c`: Checks (quality, security, performance, consistency)
- `--severity, -s`: Mindest-Severität

**Aliase**: `/code-review`, `/inspect`

---

### /comment - Kommentar hinzufügen

**Beschreibung**: Code-Review-Kommentar hinzufügen

**Syntax**:
```
/comment <kommentar>
```

**Beispiele**:
```
/comment Consider using TypeScript interface here
/comment This could be a security issue
/comment Please add error handling
```

**Optionen**:
- `--line, -l`: Zeilennummer
- `--file, -f`: Dateipfad
- `--severity, -s`: Severität (info, warning, error)

**Aliase**: `/note`, `/feedback`

---

### /approve - Genehmigen

**Beschreibung**: Code genehmigen

**Syntax**:
```
/approve <nachricht>
```

**Beispiele**:
```
/approve Looks good!
/approve LGTM
/approve Ready to merge
```

**Optionen**:
- `--message, -m`: Genehmigungsnachricht
- `--pull-request, -p`: Pull-Request-Nummer

**Aliase**: `/lgtm`, `/accept`

---

### /reject - Ablehnen

**Beschreibung**: Code ablehnen

**Syntax**:
```
/reject <grund>
```

**Beispiele**:
```
/reject Please fix the security issues
/reject Need better error handling
/reject Doesn't meet quality standards
```

**Optionen**:
- `--message, -m`: Ablehnungsgrund
- `--pull-request, -p`: Pull-Request-Nummer
- `--suggestions, -s`: Vorschläge für Verbesserungen

**Aliase**: `/request-changes`, `/needs-work`

---

## 👥 Team Commands

### /team - Team-Operationen

**Beschreibung**: Team-spezifische Operationen

**Syntax**:
```
/team <aktion> <parameter>
```

**Beispiele**:
```
/team assign @alice
/team mention @bob Check this out
/team status Dev Team A
```

**Aktionen**:
- `assign`: Aufgabe zuweisen
- `mention`: Team-Mitglied erwähnen
- `status`: Team-Status
- `message`: Nachricht an Team

**Aliase**: `/collaborate`, `/group`

---

### /mention - Benutzer erwähnen

**Beschreibung**: Team-Mitglied in Kommentar erwähnen

**Syntax**:
```
/mention <@benutzer> <nachricht>
```

**Beispiele**:
```
/mention @alice Can you review this?
/mention @bob What do you think about this approach?
/mention @charlie Please check the security
```

**Optionen**:
- `--message, -m`: Nachricht
- `--file, -f`: Datei
- `--line, -l`: Zeile

**Aliase**: `/tag`, `/notify`

---

### /assign - Aufgabe zuweisen

**Beschreibung**: Aufgabe einem Team-Mitglied zuweisen

**Syntax**:
```
/assign <@benutzer> <aufgabe>
```

**Beispiele**:
```
/assign @alice Fix this bug
/assign @bob Review this PR
/assign @charlie Write tests
```

**Optionen**:
- `--due, -d`: Fälligkeitsdatum
- `--priority, -p`: Priorität (low, medium, high, critical)

**Aliase**: `/todo`, `/task`

---

### /share - Code teilen

**Beschreibung**: Code mit Team-Mitgliedern teilen

**Syntax**:
```
/share <@benutzer1> <@benutzer2> ...
```

**Beispiele**:
```
/share @alice @bob
/share @team-dev
/share Check out this code
```

**Optionen**:
- `--message, -m`: Nachricht
- `--file, -f`: Datei
- `--selection, -s`: Aktuelle Auswahl

**Aliase**: `/send`, `/show`

---

## ⚙️ Settings Commands

### /config - Konfiguration

**Beschreibung**: UltraCode-Einstellungen verwalten

**Syntax**:
```
/config <aktion> <parameter>
```

**Beispiele**:
```
/config set ai.model gpt-4
/config get editor.theme
/config list
/config reset ai.model
```

**Aktionen**:
- `set`: Konfiguration setzen
- `get`: Konfiguration abrufen
- `list`: Alle Konfigurationen auflisten
- `reset`: Zurücksetzen

**Optionen**:
- `--global, -g`: Globale Einstellungen
- `--project, -p`: Projekt-Einstellungen

---

### /theme - Theme ändern

**Beschreibung**: Editor-Theme ändern

**Syntax**:
```
/theme <theme>
```

**Beispiele**:
```
/theme dark
/theme light
/theme solarized
```

**Verfügbare Themes**:
- `dark` (Standard)
- `light`
- `solarized`
- `dracula`
- `monokai`
- `nord`
- `custom`

**Aliase**: `/color-scheme`, `/appearance`

---

### /model - AI-Modell ändern

**Beschreibung**: AI-Modell für aktuelle Session ändern

**Syntax**:
```
/model <modell>
```

**Beispiele**:
```
/model gpt-4
/model claude-3-sonnet
/model mistral-large
```

**Verfügbare Modelle**:
- `gpt-4` (Standard)
- `gpt-3.5-turbo`
- `claude-3-sonnet`
- `claude-3-haiku`
- `mistral-large`
- `mistral-medium`

**Aliase**: `/ai-model`, `/llm`

---

### /preferences - Einstellungen verwalten

**Beschreibung**: Alle Einstellungen verwalten

**Syntax**:
```
/preferences <aktion>
```

**Beispiele**:
```
/preferences open
/preferences editor
/preferences ai
/preferences notifications
```

**Aktionen**:
- `open`: Einstellungen-UI öffnen
- `editor`: Editor-Einstellungen
- `ai`: AI-Einstellungen
- `notifications`: Benachrichtigungseinstellungen

**Aliase**: `/settings`, `/options`

---

## 🆘 Help Commands

### /help - Hilfe

**Beschreibung**: Hilfe und Dokumentation

**Syntax**:
```
/help <thema>
```

**Beispiele**:
```
/help
/help ai
/help versioning
/help commands
```

**Themen**:
- Ohne Parameter: Allgemeine Hilfe
- `ai`: AI-Funktionen
- `versioning`: Versionierung
- `code`: Code-Operationen
- `commands`: Alle Kommandos

**Aliase**: `/h`, `/?`

---

### /docs - Dokumentation

**Beschreibung**: Offizielle Dokumentation öffnen

**Syntax**:
```
/docs <thema>
```

**Beispiele**:
```
/docs
/docs getting-started
/docs api
/docs enterprise
```

**Aliase**: `/documentation`, `/manual`

---

### /tutorial - Tutorial

**Beschreibung**: Interaktives Tutorial starten

**Syntax**:
```
/tutorial <thema>
```

**Beispiele**:
```
/tutorial
/tutorial getting-started
/tutorial ai-versioning
/tutorial team-collaboration
```

**Aliase**: `/learn`, `/guide`, `/walkthrough`

---

### /examples - Beispiele

**Beschreibung**: Code-Beispiele anzeigen

**Syntax**:
```
/examples <thema>
```

**Beispiele**:
```
/examples typescript
/examples python
/examples react
```

**Aliase**: `/samples`, `/demos`

---

## 📝 Schnellreferenz

### Häufigste Commands

| **Aktion** | **Command** |
|------------|-------------|
| Frage stellen | `/ask <frage>` |
| Code erklären | `/explain <code>` |
| Code generieren | `/generate <beschreibung>` |
| Code optimieren | `/optimize <code>` |
| Code refaktorieren | `/refactor <code>` |
| Dokumentation | `/document <code>` |
| Code einfügen | `/insert <code>` |
| Code ersetzen | `/replace <code>` |
| Datei suchen | `/go <datei>` |
| Suche | `/search <begriff>` |
| Version vorschlagen | `/version <änderungen>` |
| Release planen | `/release <version>` |
| Code reviewen | `/review <code>` |
| Benutzer erwähnen | `/mention @benutzer <nachricht>` |
| Aufgabe zuweisen | `/assign @benutzer <aufgabe>` |
| Hilfe | `/help` |

---

## 🎯 Best Practices

### 1. Sei spezifisch
❌ `/generate function`
✅ `/generate TypeScript function for user authentication with JWT`

### 2. Nutze Kontext
❌ `/ask How to fix?`
✅ `/ask How to fix this SQL query? --context "The query is slow for large datasets"`

### 3. Nutze Aliase
❌ `/explain`
✅ `/explain` oder `/what` oder `/describe`

### 4. Kombiniere Commands
```
# Code generieren und einfügen
/generate TypeScript interface for User
/insert
```

---

## 📞 Support

- **Slash Commands-Fragen**: slash@ultracode.ai
- **Allgemeiner Support**: support@ultracode.ai

© 2026 UltraCode Team
