# UltraCode AI-Versionierungssystem

> **Einzigartiges KI-gesteuertes Versionierungs- und Release-Planungssystem**

---

## 🎯 Übersicht

Das **AI-Versionierungssystem** ist das **USP von UltraCode** und bietet:

```
┌─────────────────────────────────────────────────────────────┐
│              AI VERSIONING SYSTEM                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  CHANGE         │  │  VERSION        │  │  RELEASE    │  │
│  │  ANALYSIS       │  │  RECOMMENDER    │  │  PLANNER    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
│        │                │               │                  │
│        ▼                ▼               ▼                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    QUALITY GATES                             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 AUTOMATED WORKFLOWS                         │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Komponenten

### 1. Change Analysis Engine

**Verantwortlich für:** Analyse von Code-Änderungen

| **Funktion** | **Beschreibung** | **Ausgabe** |
|---------------|------------------|-------------|
| **Semantic Diff** | Analyse von Code-Struktur-Änderungen | Geänderte Funktionen, Klassen, Module |
| **Breaking Changes** | Erkennung von nicht-rückwärtskompatiblen Änderungen | Liste der Breaking Changes |
| **API Compatibility** | Prüft API-Kompatibilität | Kompatibilitäts-Bericht |
| **Dependency Impact** | Analyse von Abhängigkeits-Auswirkungen | Betroffene Pakete/Module |
| **Security Scan** | Scan nach Sicherheitslücken | Gefundene Vulnerabilities |
| **Performance Impact** | Schätzt Performance-Auswirkungen | Performance-Bericht |

**Beispiel-Abfrage:**
```bash
ultracode version analyze --since v1.0.0
ultracode version analyze --commit HEAD~5..HEAD
```

---

### 2. Version Recommender

**Verantwortlich für:** Intelligente Versionsvorschläge

| **Funktion** | **Beschreibung** | **Beispiel** |
|---------------|------------------|-------------|
| **SemVer Analysis** | Analyse basierend auf SemVer 2.0 | v1.2.0 (minor bump) |
| **AI-Powered Suggestions** | KI-gestützte Versionsvorschläge | "Basierend auf Änderungen: v2.0.0" |
| **Auto Bump** | Automatische Versionserhöhung | major/minor/patch |
| **Pre-release Versioning** | Unterstützung für alpha/beta/rc | v1.0.0-alpha.1 |
| **Channel Management** | Verwaltung von Release-Kanälen | stable, lts, experimental |

**Beispiel-Abfrage:**
```bash
ultracode version suggest
ultracode version bump --type minor
ultracode version bump --type pre --identifier alpha
```

**Versionierungsstrategien:**
- **semantic:** SemVer 2.0 kompatibel
- **date:** Datumsbasiert (YYYY.MM.DD)
- **custom:** Benutzerdefiniert

---

### 3. Release Planning Engine

**Verantwortlich für:** Planung von Releases

| **Funktion** | **Beschreibung** | **Ausgabe** |
|---------------|------------------|-------------|
| **Timeline Generation** | Erstellt Release-Zeitpläne | Zeitplan mit Meilensteinen |
| **Milestone Creation** | Erstellt Meilensteine | GitHub/GitLab Milestones |
| **Feature Prioritization** | Priorisiert Features | Sortierte Feature-Liste |
| **Risk Assessment** | Bewertet Release-Risiken | Risiko-Analyse |
| **Resource Allocation** | Schätzt Ressourcenbedarf | Zeit- und Personalplan |
| **Dependency Coordination** | Koordiniert Abhängigkeiten | Release-Reihenfolge |

**Beispiel-Abfrage:**
```bash
ultracode release plan --target-date 2026-12-01
ultracode release plan --features feat/*
```

---

### 4. Quality Gate System

**Verantwortlich für:** Qualitätssicherung vor Releases

| **Gate** | **Beschreibung** | **Kriterien** | **Tools** |
|----------|------------------|--------------|----------|
| **Code Review** | Automatisierter Code Review | Keine kritischen Issues | AI Code Review |
| **Test Coverage** | Testabdeckungs-Analyse | >80% Abdeckung | Test Runner |
| **Security Scan** | Sicherheitsprüfung | Keine kritischen Vulnerabilities | SAST/DAST |
| **Performance** | Performance-Tests | Keine Regressionen | Benchmarking |
| **Documentation** | Dokumentationsprüfung | Vollständige Docs | Doc Checker |
| **License** | Lizenz-Compliance | Alle Lizenzen OK | License Scanner |
| **Custom** | Benutzerdefiniert | Individuell | Benutzer-Tools |

**Beispiel-Abfrage:**
```bash
ultracode quality check --strict
ultracode quality check --gates code-review,test-coverage
ultracode quality gate --enable security
```

**Quality Gate Konfiguration:**
```toml
[versioning.quality]
min_coverage = 80
require_review = true
block_on_critical = true

[versioning.quality.gates]
code_review = { enabled = true, critical_only = false }
test_coverage = { enabled = true, threshold = 80 }
security = { enabled = true, level = "high" }
```

---

### 5. Automated Workflows

**Verantwortlich für:** Automatisierung von Release-Prozessen

| **Workflow** | **Beschreibung** | **Tools/Integrationen** |
|--------------|------------------|------------------------|
| **CI/CD Integration** | Integration mit CI/CD-Pipelines | GitHub Actions, GitLab CI, Jenkins |
| **Changelog Generation** | Automatische Changelog-Erstellung | Conventional Commits |
| **Release Notes** | Generierung von Release Notes | AI-gestützt |
| **Tag Creation** | Automatisches Taggen | Git Tags |
| **Package Publishing** | Veröffentlichen von Paketen | npm, pypi, docker |
| **Notification** | Benachrichtigungen | Slack, Email, Teams |

**Beispiel-Abfrage:**
```bash
ultracode release publish --version 1.2.0 --channel stable
ultracode release publish --auto
ultracode release notify --channels slack,email
```

**Workflow-Konfiguration:**
```toml
[versioning.workflows]
ci_cd = { enabled = true, platform = "github" }
changelog = { enabled = true, file = "CHANGELOG.md" }
notifications = { enabled = true, channels = ["slack", "email"] }
```

---

### 6. Dashboard & Analytics

**Verantwortlich für:** Visualisierung und Analyse

| **Dashboard** | **Beschreibung** | **Daten** |
|---------------|------------------|----------|
| **Release Metrics** | Release-Statistiken | Versionsgeschichte, Release-Zeiten |
| **Version History** | Versionsverlauf | Alle veröffentlichen Versionen |
| **Quality Gate Results** | Qualitätssicherungsergebnisse | Alle Gate-Ergebnisse |
| **Team Contribution** | Team-Beiträge | Commits pro Entwickler |
| **Predictive Planning** | Vorhersagen | Geschätzte Release-Daten |

**Beispiel-Abfrage:**
```bash
ultracode dashboard
ultracode dashboard --metric release-frequency
ultracode analytics --export report.json
```

---

## 📈 Workflow-Beispiele

### Beispiel 1: Vollständiger Release-Zyklus

```bash
# 1. Änderungen analysieren
ultracode version analyze --since v1.0.0

# 2. Version vorschlagen
ultracode version suggest
# → "Basierend auf 15 Commits: v1.1.0 (minor bump)"

# 3. Release-Plan erstellen
ultracode release plan --version 1.1.0 --target-date 2026-06-15

# 4. Quality Gates durchführen
ultracode quality check --strict

# 5. Release vorbereiten
ultracode release prepare --version 1.1.0

# 6. Release veröffentlichen
ultracode release publish --version 1.1.0 --channel stable
```

---

### Beispiel 2: Automatischer Release (CI/CD)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup UltraCode
        run: npm install -g ultracode
      
      - name: Analyze Changes
        run: ultracode version analyze --since last-release
      
      - name: Suggest Version
        id: suggest
        run: |
          VERSION=$(ultracode version suggest --format json | jq -r '.version')
          echo "version=$VERSION" >> $GITHUB_OUTPUT
      
      - name: Run Quality Gates
        run: ultracode quality check --strict
      
      - name: Create Release
        if: steps.suggest.outputs.version
        run: |
          ultracode release publish \
            --version ${{ steps.suggest.outputs.version }} \
            --auto \
            --github-token ${{ secrets.GITHUB_TOKEN }}
```

---

### Beispiel 3: Interaktive Session

```
> "Analysiere die Änderungen seit dem letzten Release"
> version_analyze(since="v1.0.0")

> "Welche Version schlägt UltraCode vor?"
> version_suggest()
# → Basierend auf den Änderungen schlage ich v1.1.0 vor (minor bump - neue Features, rückwärtskompatibel)

> "Erstelle einen detaillierten Release-Plan"
> release_plan(version="1.1.0", target_date="2026-06-15")

> "Führe alle Quality Gates aus"
> quality_check(strict=true)

> "Veröffentliche das Release"
> release_publish(version="1.1.0", channel="stable")
```

---

## 🔧 Integration mit UltraCode

### Slash-Kommandos

| **Kommando** | **Beschreibung** | **Beispiel** |
|--------------|------------------|-------------|
| `/version` | Version analysieren | `/version analyze` |
| `/version` | Version vorschlagen | `/version suggest` |
| `/release` | Release-Plan erstellen | `/release plan` |
| `/quality` | Quality Gates ausführen | `/quality check` |
| `/publish` | Release veröffentlichen | `/publish 1.2.0` |

### Tools

| **Tool** | **Beschreibung** | **Parameter** |
|----------|------------------|--------------|
| `version_analyze` | Analysiert Code-Änderungen | `since`, `commit`, `branch` |
| `version_suggest` | Schlägt Version vor | `strategy`, `prefix` |
| `version_bump` | Erhöht Version | `type`, `identifier` |
| `release_plan` | Erstellt Release-Plan | `version`, `target_date`, `features` |
| `quality_check` | Führt Quality Gates aus | `strict`, `gates`, `config` |
| `quality_gate` | Konfiguriert Quality Gates | `enable`, `disable`, `set` |
| `release_prepare` | Bereitet Release vor | `version`, `dry_run` |
| `release_publish` | Veröffentlicht Release | `version`, `channel`, `auto` |

---

## 📦 Dateistruktur

```
packages/core/src/versioning/
├── VersioningManager.ts        # Haupt-Verwalter
├── ChangeAnalysisEngine.ts    # Änderungen-Analyse
├── VersionRecommender.ts      # Versions-Vorschläge
├── ReleasePlanner.ts          # Release-Planung
├── QualityGateManager.ts      # Quality Gates
├── WorkflowEngine.ts          # Automatisierte Workflows
├── DashboardManager.ts        # Dashboard & Analytics
└── types/
    ├── VersionTypes.ts
    ├── ReleaseTypes.ts
    └── QualityTypes.ts
```

---

## 🛠️ Erweiterbarkeit

### Benutzerdefinierte Quality Gates

```typescript
// packages/core/src/versioning/quality/CustomGate.ts

import { BaseQualityGate } from './BaseQualityGate';

export class MyCustomGate extends BaseQualityGate {
  id = 'my-custom-gate';
  name = 'My Custom Quality Gate';
  description = 'Prüft meine benutzerdefinierten Kriterien';
  
  async check(context: QualityCheckContext): Promise<QualityGateResult> {
    // Implementiere deine Prüfung
    const passed = this.checkMyCriteria(context);
    
    return {
      passed,
      gate: this.id,
      message: passed ? 'OK' : 'Meine Kriterien nicht erfüllt',
      details: this.getDetails(),
      severity: passed ? 'info' : 'error',
    };
  }
}
```

**Registrierung:**
```typescript
// In deinem Plugin oder Initialisierung
qualityGateManager.register(new MyCustomGate());
```

---

### Benutzerdefinierte Versionierungsstrategien

```typescript
// packages/core/src/versioning/strategies/CustomStrategy.ts

import { BaseVersionStrategy } from './BaseVersionStrategy';

export class MyVersionStrategy extends BaseVersionStrategy {
  id = 'my-custom';
  name = 'My Custom Strategy';
  
  async suggestVersion(analysis: ChangeAnalysisResult): Promise<VersionSuggestion> {
    // Implementiere deine Logik
    const version = this.calculateCustomVersion(analysis);
    
    return {
      version,
      type: 'custom',
      reasoning: `Meine benutzerdefinierte Logik: ${version}`,
      confidence: 0.95,
    };
  }
}
```

---

## 📊 Nächste Schritte

- [Tools-Referenz →](./tools-reference.md) – Alle Tools im Detail
- [Agenten-Referenz →](./agents-reference.md) – Agenten verstehen
- [Architektur →](./architecture.md) – Systemdesign
- [Konfiguration →](../GETTING-STARTED/configuration.md) – AI-Versionierung konfigurieren
