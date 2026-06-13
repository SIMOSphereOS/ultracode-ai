# UltraCode Installation

> **Installation aus dem Quellcode (heute) und per npm (ab 1.3.0).**

---

## Systemvoraussetzungen

| Komponente | Anforderung | Prüfen |
|---|---|---|
| **Betriebssystem** | Linux, macOS 12+, Windows 10+ (x64/ARM64) | `uname -a` |
| **Node.js** | **>= 22.13** (alle Pakete deklarieren `engines.node` `>=22.13.0`; `node:sqlite` braucht 22.5+) | `node --version` |
| **pnpm** | `pnpm@11.5.2` (Projekt-Standard) | `pnpm --version` |
| **Git** | 2.30+ (für die AI-Versioning-Features; sonst optional) | `git --version` |

UltraCode ist ein reines TypeScript-ESM-Monorepo ohne native Abhängigkeiten und läuft
plattformneutral auf Linux, macOS und Windows.

---

## Installation aus dem Quellcode (empfohlen, funktioniert heute)

Das ist der Weg, den auch das [Haupt-README](../../README.md) dokumentiert und den CI auf
Linux, macOS und Windows verifiziert.

```bash
# Repository klonen
git clone https://github.com/AndreasSchwan-SIMO/UltraCode.git
cd UltraCode

# Abhängigkeiten installieren
pnpm install

# Alle drei Pakete bauen (tsc -b shared → core → cli)
pnpm build
```

Die CLI lässt sich anschließend direkt über das gebaute Bundle aufrufen:

```bash
node packages/cli/dist/index.js --help
```

Nach `pnpm install` ist im Workspace auch der Bin-Name `ultracode` verfügbar (von pnpm
verlinkt). In der übrigen Dokumentation steht `ultracode` stellvertretend für
`node packages/cli/dist/index.js`.

---

## Installation per npm (ab 1.3.0 verfügbar)

> **Hinweis:** Die npm-Veröffentlichung wird mit dem 1.3.0-Release ausgeliefert. Vor 1.3.0
> bitte den Quellcode-Weg oben verwenden.

```bash
# Globale Installation
npm install -g ultracode

# Oder ohne globale Installation direkt ausführen
npx ultracode --help

# Verifizieren
ultracode --version
```

`pnpm` und `yarn` funktionieren analog (`pnpm add -g ultracode`, `yarn global add ultracode`).

---

> Homebrew, Scoop, Chocolatey, Docker-Images und ein `curl | bash`-Installer sind **nicht**
> verfügbar und derzeit auch nicht geplant — frühere Versionen dieser Seite haben sie
> fälschlich aufgeführt.

---

## Installation verifizieren

```bash
# Version prüfen
ultracode --version

# Hilfe anzeigen
ultracode --help

# Offline-Umgebungsdiagnose (Node-Version, Git, Config-Verzeichnis, API-Keys maskiert)
ultracode doctor
```

`ultracode doctor` meldet eine `✓`/`✗`-Checkliste; bei kritischen Problemen (zu alte
Node-Version, nicht beschreibbares Config-Verzeichnis, ungültige Config) endet es mit
Exit-Code `1`. Details: [CLI-Referenz → `doctor`](../REFERENCE/cli-commands.md#ultracode-doctor).

---

## Nächste Schritte

- [Quick Start](./quick-start.md) — erste Schritte mit UltraCode
- [Konfiguration](./configuration.md) — UltraCode einrichten
- [Architektur](../DEVELOPMENT/architecture.md) — Systemdesign verstehen

---

## Externe Ressourcen

- [Node.js Installation](https://nodejs.org/en/download/)
- [pnpm Installation](https://pnpm.io/installation)
