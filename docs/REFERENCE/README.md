# Referenzdokumentation

> **Komplette technische Referenz für UltraCode - API, CLI, Slash Commands & Konfiguration**

---

## 📚 Übersicht

Die Referenzdokumentation bietet detaillierte Informationen zu allen technischen Aspekten von UltraCode. Hier finden Sie die vollständige API-Dokumentation, CLI-Kommandos, Slash-Commands und Konfigurationsoptionen.

---

## 📖 In diesem Abschnitt

| **Dokument** | **Beschreibung** | **Zielgruppe** |
|--------------|------------------|----------------|
| [api.md](./api.md) | REST & WebSocket API Dokumentation | Entwickler, Integratoren |
| [cli-commands.md](./cli-commands.md) | Komplette CLI-Kommandoreferenz | Entwickler, DevOps |
| [slash-commands.md](./slash-commands.md) | Alle Slash-Commands im Editor | Entwickler |
| [configuration-options.md](./configuration-options.md) | Sämtliche Konfigurationsoptionen | Administratoren |

---

## 🎯 Schnellzugriff

### API *(Vision / noch nicht implementiert)*
> ⚠️ Die REST/WebSocket/JWT-API existiert im aktuellen Code **nicht** (`api.ultracode.ai` ist kein realer Endpoint). Siehe [api.md](./api.md) für den geplanten Stand. Verbindlich ist die CLI.
- **Base URL** *(geplant)*: `https://api.ultracode.ai/v1`
- **Authentication** *(geplant)*: Bearer Token (JWT)
- **Format**: JSON
- **Dokumentation**: OpenAPI 3.0 / Swagger

### CLI
- **Installation**: aus dem Quellcode (`pnpm install && pnpm build`); `npm install -g ultracode` ab 1.3.0 (siehe [Installation](../GETTING-STARTED/installation.md))
- **Hilfe**: `ultracode --help`
- **Version**: `ultracode --version`

### Slash Commands
- **Prefix**: `/` (Standard)
- **Autovervollständigung**: Verfügbar
- **Kontextabhängig**: Intelligente Vorschläge

---

## 📊 API-Übersicht

### Endpunkte

| **Kategorie** | **Endpunkte** | **Beschreibung** |
|---------------|---------------|------------------|
| **Authentication** | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh` | Authentifizierung |
| **Users** | `GET /users`, `POST /users`, `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}` | Benutzerverwaltung |
| **Teams** | `GET /teams`, `POST /teams`, `GET /teams/{id}`, `PUT /teams/{id}`, `DELETE /teams/{id}` | Team-Verwaltung |
| **Projects** | `GET /projects`, `POST /projects`, `GET /projects/{id}`, `PUT /projects/{id}`, `DELETE /projects/{id}` | Projekt-Verwaltung |
| **AI** | `POST /ai/complete`, `POST /ai/chat`, `POST /ai/analyze`, `POST /ai/review` | AI-Funktionen |
| **Code** | `POST /code/generate`, `POST /code/analyze`, `POST /code/optimize`, `POST /code/explain` | Code-Operationen |
| **Versioning** | `POST /version/analyze`, `POST /version/suggest`, `POST /version/release`, `POST /version/quality-gate` | AI-Versionierung |
| **Knowledge** | `GET /knowledge`, `POST /knowledge`, `GET /knowledge/{id}`, `PUT /knowledge/{id}`, `DELETE /knowledge/{id}` | Wissensdatenbank |
| **System** | `GET /health`, `GET /status`, `GET /metrics`, `GET /config` | System-Informationen |

### HTTP-Methoden

| **Methode** | **Beschreibung** | **Idempotent** | **Sicher** |
|-------------|------------------|----------------|------------|
| `GET` | Daten abrufen | ✅ | ✅ |
| `POST` | Daten erstellen | ❌ | ❌ |
| `PUT` | Daten ersetzen | ✅ | ❌ |
| `PATCH` | Daten aktualisieren | ❌ | ❌ |
| `DELETE` | Daten löschen | ✅ | ❌ |

---

## 💻 CLI-Übersicht

### Hauptkommandos

```bash
# Allgemein
ultracode --help
ultracode version
ultracode update

# Authentication
ultracode login
ultracode logout
ultracode whoami

# AI
ultracode ask "Wie schreibe ich eine TypeScript-Funktion?"
ultracode chat
ultracode complete --file app.ts --line 42

# Code
ultracode generate --type function --language typescript --name "UserService"
ultracode analyze --file app.ts
ultracode review --pull-request 123

# Versioning
ultracode version analyze
ultracode version suggest
ultracode release plan

# Verwaltung
ultracode user list
ultracode team list
ultracode project list
```

### CLI-Struktur

```
ultracode
├── auth
│   ├── login
│   ├── logout
│   └── whoami
├── ai
│   ├── ask
│   ├── chat
│   ├── complete
│   └── analyze
├── code
│   ├── generate
│   ├── analyze
│   ├── optimize
│   ├── explain
│   └── review
├── version
│   ├── analyze
│   ├── suggest
│   ├── release
│   └── quality-gate
├── user
│   ├── create
│   ├── list
│   ├── show
│   ├── update
│   ├── delete
│   ├── import
│   └── export
├── team
│   ├── create
│   ├── list
│   ├── show
│   ├── update
│   ├── add
│   ├── remove
│   └── delete
├── project
│   ├── create
│   ├── list
│   ├── show
│   ├── update
│   ├── add
│   ├── remove
│   └── delete
├── knowledge
│   ├── add
│   ├── search
│   ├── update
│   ├── delete
│   ├── import
│   └── export
├── session
│   ├── start
│   ├── join
│   ├── leave
│   ├── end
│   ├── list
│   └── play
├── analytics
│   ├── team
│   ├── project
│   └── user
├── notification
│   ├── list
│   ├── show
│   ├── mark
│   └── settings
├── review
│   ├── request
│   ├── run
│   ├── show
│   ├── comment
│   ├── approve
│   └── reject
├── config
│   ├── get
│   ├── set
│   ├── list
│   └── reset
├── system
│   ├── health
│   ├── status
│   ├── logs
│   └── restart
└── update
    ├── check
    └── apply
```

---

## ⌨️ Slash Commands Übersicht

### Kategorien

| **Kategorie** | **Commands** | **Beschreibung** |
|---------------|--------------|------------------|
| **AI** | `/ask`, `/explain`, `/optimize`, `/refactor`, `/document` | AI-gestützte Code-Hilfe |
| **Code** | `/generate`, `/insert`, `/replace`, `/new`, `/edit` | Code-Generierung und -Bearbeitung |
| **Navigation** | `/go`, `/open`, `/search`, `/find` | Navigation und Suche |
| **Versioning** | `/version`, `/release`, `/quality-gate`, `/changelog` | AI-Versionierung |
| **Review** | `/review`, `/comment`, `/approve`, `/reject` | Code-Reviews |
| **Team** | `/team`, `/mention`, `/assign`, `/share` | Team-Kollaboration |
| **Settings** | `/config`, `/theme`, `/model`, `/preferences` | Einstellungen |
| **Help** | `/help`, `/docs`, `/tutorial`, `/examples` | Hilfe und Dokumentation |

---

## ⚙️ Konfiguration Übersicht

### Konfigurationsdateien

```
config/
├── ultracode.yml          # Hauptkonfiguration
├── auth.yml              # Authentifizierung
├── security.yml           # Sicherheit
├── ai.yml                 # AI-Einstellungen
├── database.yml           # Datenbank
├── cache.yml              # Cache
├── notifications.yml      # Benachrichtigungen
├── review.yml             # Code-Reviews
├── knowledge.yml          # Wissensdatenbank
└── features.yml           # Feature-Flags
```

### Konfigurationshierarchie

```
Priorität (höchste zu niedrigste):
1. Command-Line Arguments
2. Environment Variables
3. User Configuration (~/.ultracode/config.yml)
4. Project Configuration (./.ultracode/config.yml)
5. Team Configuration
6. Organization Configuration
7. Default Configuration (UltraCode Defaults)
```

---

## 🔍 Suche in der Dokumentation

### API suchen
```bash
# Alle API-Endpunkte anzeigen
rg "^### " docs/REFERENCE/api.md

# Spezifischen Endpunkt finden
rg "POST /ai/complete" docs/REFERENCE/api.md -A 10
```

### CLI suchen
```bash
# Alle CLI-Kommandos anzeigen
rg "^### " docs/REFERENCE/cli-commands.md

# Spezifisches Kommando finden
rg "ultracode code" docs/REFERENCE/cli-commands.md -A 5
```

### Slash Commands suchen
```bash
# Alle Slash Commands anzeigen
rg "^/" docs/REFERENCE/slash-commands.md

# Spezifischen Slash Command finden
rg "/generate" docs/REFERENCE/slash-commands.md -A 10
```

---

## 📞 Support & Feedback

- **API-Fragen**: api@ultracode.ai
- **CLI-Fragen**: cli@ultracode.ai
- **Allgemeiner Support**: support@ultracode.ai
- **GitHub Discussions**: [https://github.com/AndreasSchwan-SIMO/UltraCode/discussions](https://github.com/AndreasSchwan-SIMO/UltraCode/discussions)

---

## 📜 Lizenz

Die UltraCode Referenzdokumentation steht unter der [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).

© 2026 UltraCode Team
