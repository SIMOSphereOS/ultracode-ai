# UltraCode Installation

> **Installationsanleitung für alle Plattformen**

---

## 📋 Systemvoraussetzungen

| **Komponente** | **Anforderung** | **Prüfen** |
|---------------|----------------|------------|
| **Betriebssystem** | Windows 10+, macOS 12+, Linux (x64/ARM64) | `uname -a` |
| **Node.js** | 22.13+ (LTS empfohlen) | `node --version` |
| **npm/pnpm/yarn** | 8.0+ | `npm --version` |
| **Python** | 3.12+ (optional, für Python-Integration) | `python --version` |
| **Git** | 2.30+ | `git --version` |
| **Terminal** | Modern (WezTerm, Kitty, iTerm2 empfohlen) | - |
| **Speicherplatz** | 500MB+ | `df -h` |

---

## 📥 Installationsmethoden

### ⭐ Empfohlen: npm (Node Package Manager)

```bash
# Globale Installation (empfohlen)
npm install -g ultracode

# Lokale Installation (für Projekt)
npm install ultracode --save-dev
npx ultracode

# Verifizieren
ultracode --version
```

**Vorteile:**
- Einfache Installation und Updates
- Automatische Abhängigkeitsverwaltung
- Cross-Plattform

---

### 🍺 Homebrew (macOS & Linux)

```bash
# Offizielles Formula
brew install ultracode

# Oder vom Tap (immer aktuell)
brew tap ultracode-ai/tap
brew install ultracode

# Verifizieren
ultracode --version
```

---

### 🪟 Scoop (Windows)

```powershell
# Bucket hinzufügen
scoop bucket add ultracode https://github.com/ultracode-ai/scoop-ultracode.git

# Installieren
scoop install ultracode

# Verifizieren
ultracode --version
```

---

### 📦 Chocolatey (Windows)

```powershell
# Installieren
choco install ultracode

# Verifizieren
ultracode --version
```

---

### 🐳 Docker

```bash
# Image pullen
docker pull ghcr.io/ultracode-ai/ultracode:latest

# Als Container ausführen
docker run -it --rm \
  -v "$(pwd):/workspace" \
  -v "$HOME/.ultracode:/root/.ultracode" \
  ghcr.io/ultracode-ai/ultracode:latest

# Mit speziellem Modell
docker run -it --rm \
  -e MISTRAL_API_KEY=your_key \
  -v "$(pwd):/workspace" \
  ghcr.io/ultracode-ai/ultracode:latest --model mistral-large
```

**Hinweis:** Für volle Funktionalität (IDE-Integration) wird die native Installation empfohlen.

---

### 💾 Manuelle Installation (Standalone)

#### Linux/macOS

```bash
# Herunterladen
curl -fsSL https://ultracode.ai/install | bash

# Oder spezifische Version
curl -fsSL https://ultracode.ai/install | bash -s -- --version 1.0.0

# Installationsverzeichnis
# Standard: ~/.ultracode/bin
```

#### Windows

```powershell
# Herunterladen
irm https://ultracode.ai/install.ps1 | iex

# Oder mit PowerShell 5+
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://ultracode.ai/install.ps1 | iex
```

---

### 🔧 Von Quellcode (Development)

```bash
# Repository klonen
git clone https://github.com/ultracode-ai/ultracode.git
cd ultracode

# Abhängigkeiten installieren
pnpm install

# Builden
pnpm run build

# Linken (für Entwicklung)
pnpm run link

# Ausführen
ultracode
```

---

## 🎯 Plattformspezifische Hinweise

### Windows

| **Methode** | **Hinweis** |
|-------------|-------------|
| npm | Funktioniert, aber langsamere Startzeit |
| Scoop | Empfohlen – beste Integration |
| Chocolatey | Gut für Enterprise-Umgebungen |
| Manuell | Erfordert PowerShell 5+ |

**Wichtig:**
- Füge das Installationsverzeichnis zu deiner `PATH` hinzu
- Für WSL: Installiere in Linux-Umgebung, nicht Windows

```powershell
# PATH prüfen
$env:PATH -split ';' | Select-String ultracode

# Falls nötig hinzufügen
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\\pfad\\zu\\ultracode", "User")
```

---

### macOS

| **Methode** | **Hinweis** |
|-------------|-------------|
| Homebrew | **Empfohlen** – einfachste Methode |
| npm | Funktioniert gut |
| Manuell | Für Entwickler |

**Wichtig:**
- Für M1/M2: Native ARM64-Binaries verfügbar
- Terminal: WezTerm oder Kitty empfohlen

```bash
# ARM64 prüfen
uname -m  # sollte 'arm64' zurückgeben
```

---

### Linux

| **Distribution** | **Empfohlene Methode** |
|------------------|------------------------|
| Ubuntu/Debian | npm oder Docker |
| Fedora/RHEL | npm oder Docker |
| Arch Linux | AUR (`paru -S ultracode`) |
| OpenSUSE | npm oder Docker |

**Wichtig:**
- Für AppImage: Ausführbar machen
- Für Snap: Noch nicht verfügbar

```bash
# AppImage ausführbar machen
chmod +x ultracode-*.AppImage
./ultracode-*.AppImage
```

---

## ✅ Installation verifizieren

```bash
# Version prüfen
ultracode --version
# → ultraCode/1.0.0

# Hilfe anzeigen
ultracode --help

# Diagnose
ultracode doctor
```

**Erwartete Ausgabe:**
```
✅ Node.js: 22.13.0
✅ npm: 10.5.0
✅ Git: 2.45.0
✅ Terminal: wezterm (kompatibel)
✅ UltraCode: 1.0.0
```

---

## 🔄 Deinstallation

### npm

```bash
npm uninstall -g ultracode
npm cache clean --force
```

### Homebrew

```bash
brew uninstall ultracode
```

### Scoop

```powershell
scoop uninstall ultracode
```

### Chocolatey

```powershell
choco uninstall ultracode
```

### Manuell

```bash
# Linux/macOS
rm -rf ~/.ultracode
rm -f /usr/local/bin/ultracode

# Windows
rmdir /s /q %LOCALAPPDATA%\ultracode
```

---

## 📊 Installationsstatistiken

| **Methode** | **Download-Größe** | **Installationsdauer** | **Updates** |
|-------------|-------------------|----------------------|-------------|
| npm | ~50MB | 1-2 Min | Automatisch |
| Homebrew | ~45MB | 30 Sek | `brew upgrade` |
| Scoop | ~45MB | 30 Sek | `scoop update ultracode` |
| Docker | ~200MB | 5-10 Min | `docker pull` |
| Manuell | ~40MB | 1 Min | Manuell |

---

## 🔧 Problembehandlung

### Häufige Probleme

#### ❌ "Command not found: ultracode"

**Ursache:** `PATH` nicht aktualisiert

**Lösungen:**
```bash
# npm global bin prüfen
npm bin -g

# PATH hinzufügen (Linux/macOS)
echo 'export PATH="$PATH:$(npm bin -g)"' >> ~/.bashrc
source ~/.bashrc

# Windows
npm config get prefix
# Füge den Pfad zu deiner PATH hinzu
```

---

#### ❌ "Error: Cannot find module '@ultracode/core'"

**Ursache:** Abhängigkeiten nicht installiert

**Lösung:**
```bash
npm install -g ultracode --force
```

---

#### ❌ "Terminal not supported"

**Ursache:** Veraltetes Terminal

**Lösung:**
- Installiere [WezTerm](https://wezfurlong.org/wezterm/)
- Oder verwende Kitty, iTerm2, Alacritty

---

#### ❌ "API key not found"

**Ursache:** Kein API-Key konfiguriert

**Lösung:**
```bash
# Erstanlauf - interaktiv
ultracode

# Oder manuell
ultracode --setup
```

---

#### ❌ "Permission denied"

**Ursache:** Keine Berechtigung für globale Installation

**Lösung:**
```bash
# Mit sudo (Linux/macOS)
sudo npm install -g ultracode

# Oder ohne sudo
npm config set prefix ~/.npm-global
npm install -g ultracode
```

---

## 📚 Nächste Schritte

- [Quick Start →](./quick-start.md) – Erste Schritte mit UltraCode
- [Konfiguration →](./configuration.md) – UltraCode einrichten
- [Architektur →](../DEVELOPMENT/architecture.md) – Systemdesign verstehen

---

## 🔗 Externe Ressourcen

- [Node.js Installation](https://nodejs.org/en/download/)
- [pnpm Installation](https://pnpm.io/installation)
- [WezTerm Terminal](https://wezfurlong.org/wezterm/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
