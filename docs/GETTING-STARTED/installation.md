# UltraCode AI — Installation (Deutsch)

> 🇬🇧 English version: [`installation.en.md`](./installation.en.md)

UltraCode AI ist ein agentischer KI-Coding-Assistent fürs Terminal mit KI-gestützter
Versionierung. Diese Anleitung deckt **Installation per npm** (empfohlen) und **aus dem
Quellcode** ab, inklusive Konfiguration, Verifikation und erstem Lauf.

---

## 1. Systemvoraussetzungen

| Komponente | Anforderung | Prüfen |
|---|---|---|
| **Node.js** | **≥ 22.13** (alle Pakete deklarieren `engines.node` `>=22.13.0`; `node:sqlite` braucht 22.5+) | `node --version` |
| **npm** | bei globaler Installation (Bestandteil von Node) | `npm --version` |
| **pnpm** | nur für die Quellcode-Installation: `pnpm@11.5.2` | `pnpm --version` |
| **Git** | 2.30+ für die AI-Versioning-Features (sonst optional) | `git --version` |
| **Betriebssystem** | Linux, macOS 12+, Windows 10+ (x64/ARM64) | — |

UltraCode AI ist ein reines TypeScript-ESM-Projekt ohne native Abhängigkeiten und läuft
plattformneutral. CI verifiziert Linux, macOS und Windows auf Node 22 und 24.

---

## 2. Installation per npm (empfohlen)

```bash
# Global installieren — stellt den Befehl `ultracode-ai` bereit
npm install -g ultracode-ai

# Ohne globale Installation direkt ausführen
npx ultracode-ai --help
```

Die Pakete liegen öffentlich auf npm:

| Paket | Zweck |
|---|---|
| [`ultracode-ai`](https://www.npmjs.com/package/ultracode-ai) | CLI (installiert den Befehl `ultracode-ai`) |
| [`ultracode-core`](https://www.npmjs.com/package/ultracode-core) | Kern-Bibliothek (Agenten, Tools, Versioning) |
| [`ultracode-shared`](https://www.npmjs.com/package/ultracode-shared) | Geteilte Typen & Kontrakte |

`ultracode-core` und `ultracode-shared` werden als Abhängigkeiten automatisch mitinstalliert.

---

## 3. Installation aus dem Quellcode

Für Mitentwicklung oder den neuesten `main`-Stand:

```bash
# Repository klonen (Klon-Verzeichnis heißt ultracode-ai)
git clone https://github.com/AndreasSchwan-SIMO/ultracode-ai.git
cd ultracode-ai

# Abhängigkeiten installieren
pnpm install

# Alle drei Pakete bauen (tsc -b: shared → core → cli)
pnpm build
```

Anschließend die CLI über das gebaute Bundle aufrufen:

```bash
node packages/cli/dist/index.js --help
```

Nach `pnpm install` ist im Workspace auch der Bin-Name `ultracode-ai` verlinkt. In der
Dokumentation steht `ultracode-ai` stellvertretend für `node packages/cli/dist/index.js`.

---

## 4. Konfiguration

### 4a. Einrichtungsassistent (am einfachsten)

```bash
ultracode-ai setup
```

Der Assistent fragt Provider, API-Key (maskierte Eingabe) und Standard-Agent ab und
schreibt den Key nach `~/.ultracode/.env` (Datei mit Berechtigung `0600`; Keys gehören
**nie** in die `config.toml`).

### 4b. Manuell per Umgebungsvariablen

Lege den passenden API-Key deines Providers an:

```bash
export OPENAI_API_KEY="sk-..."                   # OpenAI
export ANTHROPIC_API_KEY="sk-ant-..."            # Anthropic
export MISTRAL_API_KEY="..."                     # Mistral
export OLLAMA_BASE_URL="http://localhost:11434"  # Ollama (lokal, kein Key)
```

Optionale Overrides (Auszug): `ULTRACODE_MODEL`, `ULTRACODE_CORE__MAX_TOKENS`,
`ULTRACODE_CORE__TEMPERATURE`, `ULTRACODE_DEBUG=1`. Persistente Einstellungen liegen in
`~/.ultracode/config.toml` — Details in [`configuration.md`](./configuration.md).

---

## 5. Installation verifizieren

```bash
ultracode-ai --version     # zeigt die installierte Version (z. B. 1.3.1)
ultracode-ai doctor        # prüft Node-Version, Config, Provider-Erreichbarkeit
```

`doctor` erzwingt Node ≥ 22.13 und meldet fehlende API-Keys oder Konfigurationsprobleme
mit Exit-Code ≠ 0.

---

## 6. Erster Lauf

```bash
# Interaktiv (TTY): startet die Terminal-UI
ultracode-ai

# Nicht-interaktiv: ein einzelner Prompt, Ergebnis wird gestreamt
ultracode-ai run -p "Erkläre die Architektur dieses Repos"

# Maschinenlesbar: vollständiges Ergebnis als JSON
ultracode-ai run -p "..." --json

# KI-gestützte Versions-Empfehlung aus den Git-Commits
ultracode-ai version analyze "v1.3.0..HEAD"
```

Weitere Befehle: `config`, `tools`, `agents`, `release`, `quality`, `budget`, `skills`,
`learn`. Mit `ultracode-ai <befehl> --help` siehst du die jeweiligen Optionen.

---

## 7. Aktualisieren & Deinstallieren

```bash
# Aktualisieren
npm update -g ultracode-ai

# Deinstallieren
npm uninstall -g ultracode-ai
# Optional die lokale Konfiguration entfernen
rm -rf ~/.ultracode
```

---

## 8. Fehlerbehebung

| Problem | Lösung |
|---|---|
| `Unsupported engine` / Node zu alt | Node auf **≥ 22.13** aktualisieren (`node --version`). |
| `command not found: ultracode-ai` | Globalen npm-Bin-Pfad prüfen (`npm bin -g`) bzw. `npx ultracode-ai` nutzen. |
| Kein Output / „kein API-Key" | `ultracode-ai setup` ausführen oder `*_API_KEY` exportieren; mit `ultracode-ai doctor` prüfen. |
| `SQLITE`-Hinweis beim Start | Informativ — `node:sqlite` ist experimentell; die Warnung wird intern unterdrückt. |
| Build aus Quellcode schlägt fehl | `pnpm --version` (`11.5.2`?) und Node-Version prüfen, dann `pnpm install && pnpm build`. |

Bei Bugs: [Issues](https://github.com/AndreasSchwan-SIMO/ultracode-ai/issues).

---

**Nächste Schritte:** [Schnellstart](./quick-start.md) · [Konfiguration](./configuration.md)
