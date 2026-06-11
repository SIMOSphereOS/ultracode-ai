# UltraCode Quality Gates

> **Automatische Qualitätssicherung mit KI-Unterstützung**

---

## 🎯 Übersicht

UltraCodes **Quality Gate System** ist ein **umfassendes Qualitätssicherungssystem**, das **automatisch** und **intelligent** Code, Tests, Sicherheit und Dokumentation prüft – **bevor** Code in die Production geht.

```
┌─────────────────────────────────────────────────────────────┐
│                   QUALITY GATE SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  CODE REVIEW    │  │  TEST COVERAGE  │  │ SECURITY    │  │
│  │  (AI-Powered)    │  │  ANALYSIS       │  │ SCANNING    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
│        │                │               │                  │
│        ▼                ▼               ▼                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    ADDITIONAL GATES                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐││
│  │  │ PERFORMANCE     │  │ DOCUMENTATION  │  │ LICENSE     │││
│  │  │ BENCHMARKING    │  │ COMPLETENESS   │  │ COMPLIANCE  │││
│  │  └─────────────────┘  └─────────────────┘  └─────────────┘││
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    RESULTS & REPORTS                        │  │
│  │  • Pass/Fail Status                                            │  │
│  │  • Detaillierte Berichte                                       │  │
│  │  • Schweregrade (Critical, High, Medium, Low)               │  │
│  │  • Empfehlungen für Verbesserungen                            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Standard Quality Gates

UltraCode bietet **7 Standard Quality Gates**:

---

### 1. 🤖 Code Review (AI-Powered)

**Zweck:** Automatisierter Code Review mit KI

| **Prüfung** | **Beschreibung** | **Schweregrad** | **Tools** |
|-------------|------------------|----------------|----------|
| Code Style | Einhaltung von Style Guides | Niedrig | ESLint, Prettier |
| Best Practices | Einhaltung von Best Practices | Mittel | Custom Rules |
| Anti-Patterns | Erkennung von Anti-Patterns | Hoch | AI Analysis |
| Code Duplication | Erkennung von Duplizierungen | Mittel | Similarity Analysis |
| Complexity | Code-Komplexität prüfen | Hoch | Complexity Analysis |
| Maintainability | Wartbarkeit bewerten | Mittel | Maintainability Index |

**Konfiguration:**
```toml
[versioning.quality.gates.code_review]
enabled = true
strict = false  # True = Blockieren bei Warnungen
critical_only = false  # Nur kritische Issues blockieren
min_score = 80  # Mindest-Score (0-100)
```

**Beispiel:**
```bash
# Code Review für spezifische Dateien
ultracode quality check --gates code_review --path src/

# Code Review mit AI
> ai_review(path="src/api.ts", focus="security,performance")
```

**Ausgabe:**
```
Code Review Report
==================

✅ PASSED: Code Style (Score: 95/100)
✅ PASSED: Best Practices (Score: 88/100)
⚠️  WARNING: Anti-Patterns (Score: 75/100)
  - Funktion 'processData' ist zu lang (50+ Zeilen)
  - Zu viele Parameter in 'handleRequest' (7+)
  
✅ PASSED: Code Duplication (Score: 100/100)
✅ PASSED: Complexity (Score: 85/100)
⚠️  WARNING: Maintainability (Score: 78/100)
  - Zyklomatische Komplexität zu hoch in 'calculate'

Overall Score: 86.8/100
Status: PASSED (Warnungen vorhanden)
```

---

### 2. 🧪 Test Coverage Analysis

**Zweck:** Prüfung der Testabdeckung

| **Metrik** | **Beschreibung** | **Standard** | **Konfigurierbar** |
|------------|------------------|--------------|-------------------|
| Line Coverage | Zeilenabdeckung | ≥ 80% | ✅ |
| Branch Coverage | Verzweigungsabdeckung | ≥ 75% | ✅ |
| Function Coverage | Funktionsabdeckung | ≥ 90% | ✅ |
| Statement Coverage | Anweisungsabdeckung | ≥ 80% | ✅ |

**Konfiguration:**
```toml
[versioning.quality.gates.test_coverage]
enabled = true
min_line_coverage = 80
min_branch_coverage = 75
min_function_coverage = 90
min_statement_coverage = 80
```

**Beispiel:**
```bash
# Testabdeckung prüfen
ultracode quality check --gates test_coverage

# Detaillierten Bericht erhalten
ultracode quality check --gates test_coverage --detailed
```

**Ausgabe:**
```
Test Coverage Report
====================

Overall Coverage: 87.5%

┌─────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Datei           │ Lines    │ Branches │ Functions│ Statements│
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ src/api.ts      │ 92.3%    │ 85.7%    │ 100%     │ 92.3%    │
│ src/utils.ts    │ 75.0%    │ 66.7%    │ 80.0%    │ 75.0%    │ ⚠️
│ src/index.ts    │ 100%     │ 100%     │ 100%     │ 100%     │ ✅
└─────────────────┴──────────┴──────────┴──────────┴──────────┘

✅ PASSED: Line Coverage (87.5% ≥ 80%)
✅ PASSED: Function Coverage (92% ≥ 90%)
⚠️  WARNING: Branch Coverage (81.25% ≥ 75%, aber < 85%)
⚠️  WARNING: src/utils.ts (75.0% < 80%)

Status: PASSED (Warnungen vorhanden)
```

---

### 3. 🔒 Security Scanning (SAST/DAST)

**Zweck:** Prüfung auf Sicherheitslücken

| **Prüfung** | **Beschreibung** | **Schweregrad** | **Tools** |
|-------------|------------------|----------------|----------|
| SQL Injection | SQL-Injection-Schwachstellen | Kritisch | Static Analysis |
| XSS | Cross-Site-Scripting | Kritisch | Static Analysis |
| Hardcoded Secrets | Hardcodierte Secrets | Kritisch | Secret Scanning |
| Insecure Dependencies | Unsichere Abhängigkeiten | Hoch | Dependency Scanning |
| Authentication Issues | Authentifizierungsprobleme | Hoch | Static Analysis |
| Input Validation | Eingabevalidierung | Mittel | Static Analysis |
| Error Handling | Fehlerbehandlung | Mittel | Static Analysis |

**Konfiguration:**
```toml
[versioning.quality.gates.security]
enabled = true
severity_level = "high"  # high, medium, low, all
scan_type = "full"  # full, quick, custom

# Ignorieren von bestimmten Prüfungen
[versioning.quality.gates.security.ignore]
paths = ["test/*", "mock/*"]
vulnerabilities = ["CVE-2020-1234"]
```

**Beispiel:**
```bash
# Sicherheitsprüfung durchführen
ultracode quality check --gates security

# Nur kritische Sicherheitslücken
ultracode quality check --gates security --severity critical
```

**Ausgabe:**
```
Security Scan Report
====================

✅ PASSED: No Critical Vulnerabilities
✅ PASSED: No High Severity Vulnerabilities
⚠️  WARNING: Medium Severity (2 Issues)
  1. [CWE-89] Potential SQL Injection in src/db/query.ts:42
     → Use parameterized queries instead of string concatenation
  2. [CWE-20] Improper Input Validation in src/api/user.ts:15
     → Validate user input before processing

✅ PASSED: No Hardcoded Secrets
✅ PASSED: No Insecure Dependencies

Overall: 2 Medium Severity Issues
Status: PASSED (nur Warnungen)
```

---

### 4. ⚡ Performance Benchmarking

**Zweck:** Prüfung der Performance

| **Metrik** | **Beschreibung** | **Standard** | **Konfigurierbar** |
|------------|------------------|--------------|-------------------|
| Execution Time | Ausführungszeit | Kein Limit | ✅ |
| Memory Usage | Speicherverbrauch | Kein Limit | ✅ |
| CPU Usage | CPU-Auslastung | Kein Limit | ✅ |
| Throughput | Durchsatz | Kein Limit | ✅ |
| Latency | Latenz | < 100ms | ✅ |

**Konfiguration:**
```toml
[versioning.quality.gates.performance]
enabled = true

# Performance-Schwellenwerte
[versioning.quality.gates.performance.thresholds]
max_execution_time = 1000  # ms
max_memory_usage = 512  # MB
max_cpu_usage = 80  # %
max_latency = 100  # ms
min_throughput = 1000  # requests/sec

# Benchmark-Tests
[versioning.quality.gates.performance.benchmarks]
run_before = true
run_after = true
compare = true
regression_threshold = 5  # % Regression ist OK
```

**Beispiel:**
```bash
# Performance prüfen
ultracode quality check --gates performance

# Benchmark ausführen
ultracode quality check --gates performance --benchmark
```

**Ausgabe:**
```
Performance Benchmark Report
===========================

┌─────────────────┬──────────────┬──────────────┬──────────┐
│ Metrik          │ Aktueller Wert│ Schwellenwert│ Status   │
├─────────────────┼──────────────┼──────────────┼──────────┤
│ Execution Time  │ 45ms          │ 1000ms       │ ✅ PASS  │
│ Memory Usage    │ 128MB         │ 512MB        │ ✅ PASS  │
│ CPU Usage       │ 45%           │ 80%          │ ✅ PASS  │
│ Latency         │ 35ms          │ 100ms        │ ✅ PASS  │
│ Throughput      │ 1200 req/s    │ 1000 req/s   │ ✅ PASS  │
└─────────────────┴──────────────┴──────────────┴──────────┘

✅ PASSED: All Performance Metrics

Benchmark Comparison:
- Execution Time: +2ms (4.6% Regression) ✅
- Memory Usage: -5MB (3.8% Improvement) ✅

Status: PASSED
```

---

### 5. 📚 Documentation Completeness Check

**Zweck:** Prüfung der Dokumentationsvollständigkeit

| **Prüfung** | **Beschreibung** | **Standard** | **Konfigurierbar** |
|-------------|------------------|--------------|-------------------|
| Code Comments | Kommentare im Code | ≥ 20% | ✅ |
| Function Docs | Dokumentation von Funktionen | ≥ 80% | ✅ |
| API Documentation | API-Dokumentation | 100% | ✅ |
| README Files | README-Dateien | 100% | ✅ |
| CHANGELOG | Changelog | 100% | ✅ |
| Examples | Code-Beispiele | ≥ 50% | ✅ |

**Konfiguration:**
```toml
[versioning.quality.gates.documentation]
enabled = true
min_comment_ratio = 20  # % der Codezeilen mit Kommentaren
min_function_docs = 80  # % der Funktionen mit Dokumentation
require_api_docs = true
require_readme = true
require_changelog = true
require_examples = false
```

**Beispiel:**
```bash
# Dokumentation prüfen
ultracode quality check --gates documentation
```

**Ausgabe:**
```
Documentation Completeness Report
===============================

✅ PASSED: Code Comments (28% ≥ 20%)
⚠️  WARNING: Function Docs (75% < 80%)
  - src/utils.ts: 10/15 Funktionen dokumentiert (66.7%)
  - src/helpers.ts: 8/10 Funktionen dokumentiert (80%)

✅ PASSED: API Documentation (100%)
✅ PASSED: README Files (100%)
⚠️  WARNING: CHANGELOG (outdated)
  - Last update: 2026-05-01 (30 Tage alt)

✅ PASSED: Examples (60% ≥ 50%)

Overall Score: 88.3%
Status: PASSED (Warnungen vorhanden)
```

---

### 6. ⚖️ License Compliance Verification

**Zweck:** Prüfung der Lizenz-Compliance

| **Prüfung** | **Beschreibung** | **Standard** | **Konfigurierbar** |
|-------------|------------------|--------------|-------------------|
| License Files | Vorhandensein von Lizenzen | 100% | ✅ |
| License Headers | Lizenz-Header in Dateien | ≥ 90% | ✅ |
| Dependency Licenses | Lizenzen von Abhängigkeiten | Kompatibel | ✅ |
| Attribution | korrekte Zuordnung | 100% | ✅ |

**Konfiguration:**
```toml
[versioning.quality.gates.license]
enabled = true
require_license_file = true
min_header_coverage = 90
check_dependencies = true
allowed_licenses = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"]
forbidden_licenses = ["GPL-3.0", "AGPL-3.0"]
```

**Beispiel:**
```bash
# Lizenz-Compliance prüfen
ultracode quality check --gates license
```

**Ausgabe:**
```
License Compliance Report
========================

✅ PASSED: License File (MIT)
✅ PASSED: License Headers (95% ≥ 90%)
  - 5/100 Dateien ohne Header
✅ PASSED: Dependency Licenses (Alle kompatibel)
✅ PASSED: Attribution (100%)

Warning: Following dependencies have non-standard licenses:
- package-a: BSD-2-Clause (allowed)
- package-b: Apache-2.0 (allowed)

Status: PASSED
```

---

### 7. 🎭 Custom Quality Gates

**Zweck:** Benutzerdefinierte Qualitätssicherungen

```typescript
// packages/core/src/versioning/quality/CustomGate.ts

import { BaseQualityGate, QualityCheckContext, QualityGateResult } from '@ultracode/core';

export class MyCustomGate extends BaseQualityGate {
  id = 'my-custom-gate';
  name = 'My Custom Quality Gate';
  description = 'Prüft meine benutzerdefinierten Kriterien';
  severity = 'medium';
  
  async check(context: QualityCheckContext): Promise<QualityGateResult> {
    // Benutzerdefinierte Prüfung
    const checks = await this.runCustomChecks(context);
    
    const passed = checks.every(c => c.passed);
    const score = (checks.filter(c => c.passed).length / checks.length) * 100;
    
    return {
      passed,
      gate: this.id,
      message: passed ? 'Alle benutzerdefinierten Kriterien erfüllt' : 'Benutzerdefinierte Kriterien nicht erfüllt',
      details: {
        checks,
        score,
        recommendations: this.generateRecommendations(checks),
      },
      severity: passed ? 'info' : this.severity,
    };
  }
  
  private async runCustomChecks(context: QualityCheckContext) {
    return [
      {
        name: 'Custom Check 1',
        passed: await this.check1(context),
        message: this.check1Message,
      },
      {
        name: 'Custom Check 2',
        passed: await this.check2(context),
        message: this.check2Message,
      },
    ];
  }
}
```

**Registrierung:**
```toml
[versioning.quality.gates.custom]
enabled = true

[[versioning.quality.gates.custom.gates]]
gate = "my-custom-gate"
severity = "medium"
```

---

## 🎯 Quality Gates in der Praxis

### Beispiel 1: Alle Gates ausführen

```bash
# Alle Quality Gates ausführen (strict = blockieren bei Warnungen)
ultracode quality check --strict

# Alle Quality Gates ausführen (nur Fehler blockieren)
ultracode quality check

# Spezifische Gates ausführen
ultracode quality check --gates code_review,test_coverage,security
```

---

### Beispiel 2: CI/CD-Integration

```yaml
# .github/workflows/quality-gates.yml
name: Quality Gates

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup UltraCode
        run: npm install -g ultracode
      
      - name: Run Quality Gates
        run: ultracode quality check --strict --format json > quality-report.json
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: quality-report
          path: quality-report.json
      
      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('quality-report.json', 'utf8'));
            
            const comment = `
            ## Quality Gate Report
            
            **Status:** ${report.overallStatus}
            **Score:** ${report.overallScore}/100
            
            ${report.gates.map(g => 
              `- ${g.name}: ${g.passed ? '✅ PASS' : '❌ FAIL'} (${g.score}/100)`
            ).join('\n')}
            `;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

---

### Beispiel 3: Interaktive Nutzung

```
> "Führe alle Quality Gates aus"
> quality_check(strict=true)

# UltraCode antwortet:
# Quality Gate Check in Progress...
# 
# ✅ Code Review: PASSED (Score: 85/100)
#   - Code Style: 95/100
#   - Best Practices: 88/100
#   - Anti-Patterns: 75/100 ⚠️
#     → 2 Warnungen (siehe Details)
# 
# ✅ Test Coverage: PASSED (87.5%)
#   - Line Coverage: 87.5% ✅
#   - Branch Coverage: 81.25% ⚠️
# 
# ✅ Security: PASSED (0 Critical, 0 High)
#   - 2 Medium Severity Issues ⚠️
# 
# ✅ Performance: PASSED (All Metrics OK)
# 
# ✅ Documentation: PASSED (88.3%)
#   - Function Docs: 75% ⚠️
# 
# ✅ License: PASSED (All OK)
# 
# ════════════════════════════════════
# Overall Status: ✅ PASSED (3 Warnungen)
# Overall Score: 87.2/100

> "Zeige Details zu den Warnungen"
> quality_check(gates=["code_review", "test_coverage", "documentation"], detailed=true)
```

---

## 📊 Quality Gate Ergebnisse

### Status-Typen

| **Status** | **Beschreibung** | **Farbe** | **Blockierend** |
|------------|------------------|-----------|-----------------|
| ✅ PASSED | Alle Prüfungen bestanden | Grün | ❌ Nein |
| ⚠️  WARNING | Warnungen vorhanden | Gelb | ❌ Nein (in strict-Modus: ✅ Ja) |
| ❌ FAILED | Kritische Fehler | Rot | ✅ Ja |
| ⏳ SKIPPED | Übersprungen | Grau | ❌ Nein |

---

### Schweregrade

| **Schweregrad** | **Beschreibung** | **Farbe** | **Numerischer Wert** |
|----------------|------------------|-----------|---------------------|
| Critical | Kritische Probleme, müssen behoben werden | Rot | 4 |
| High | Wichtige Probleme, sollten behoben werden | Orange | 3 |
| Medium | Mittlere Probleme, können behoben werden | Gelb | 2 |
| Low | Geringfügige Probleme, optional | Blau | 1 |
| Info | Informationen, keine Probleme | Grau | 0 |

---

## 🔧 Konfiguration

### Globale Konfiguration

```toml
[versioning.quality]
# Quality Gates aktivieren
enabled = true

# Strict Mode (Warnungen blockieren)
strict = false

# Mindest-Score für alle Gates
min_score = 80

# Mindest-Score für einzelne Gates
min_gate_score = {
  code_review = 75,
  test_coverage = 80,
  security = 90,
}

# Gates, die immer ausgeführt werden
required_gates = ["code_review", "security"]

# Gates, die aktiviert sind
enabled_gates = ["code_review", "test_coverage", "security", "performance"]
```

---

### Pro Gate Konfiguration

```toml
# Code Review
[versioning.quality.gates.code_review]
enabled = true
strict = true
critical_only = false
min_score = 85

# Test Coverage
[versioning.quality.gates.test_coverage]
enabled = true
min_line_coverage = 80
min_branch_coverage = 75

# Security
[versioning.quality.gates.security]
enabled = true
severity_level = "high"

# Performance
[versioning.quality.gates.performance]
enabled = false  # Nur bei Bedarf

# Documentation
[versioning.quality.gates.documentation]
enabled = true
min_comment_ratio = 20

# License
[versioning.quality.gates.license]
enabled = true
require_license_file = true

# Custom Gates
[versioning.quality.gates.my_custom_gate]
enabled = true
severity = "medium"
```

---

## 🛠️ Quality Gate Tools

### Verwalten von Quality Gates

| **Tool** | **Beschreibung** | **Beispiel** |
|----------|------------------|-------------|
| `quality_check` | Führt Quality Gates aus | `quality_check(strict=true)` |
| `quality_gate` | Konfiguriert Quality Gates | `quality_gate(action="enable", gate="security")` |
| `quality_list` | Liste verfügbare Gates | `quality_list()` |
| `quality_report` | Generiert Quality Report | `quality_report(version="2.0.0")` |
| `quality_history` | Zeigt Quality History | `quality_history(limit=10)` |

---

### Slash-Kommandos

| **Kommando** | **Beschreibung** | **Beispiel** |
|--------------|------------------|-------------|
| `/quality` | Quality Gates verwalten | `/quality check`, `/quality list` |
| `/gates` | Alias für /quality | `/gates check` |
| `/qg` | Kürzel für /quality | `/qg check` |

---

## 📈 Quality Gate Analytics

### Metriken und Berichte

```bash
# Quality Gate History anzeigen
ultracode quality history --limit 20

# Quality Gate Metriken
ultracode quality metrics --since 2026-01-01

# Quality Gate Trends
ultracode quality trend --gates code_review,test_coverage
```

**Ausgabe:**
```
Quality Gate History (Last 20 Runs)
===================================

┌────────────┬──────────────┬──────────────┬──────────┐
│ Datum       │ Gate          │ Score         │ Status   │
├────────────┼──────────────┼──────────────┼──────────┤
│ 2026-06-10 │ code_review   │ 85/100        │ PASSED   │
│ 2026-06-10 │ test_coverage │ 87/100        │ PASSED   │
│ 2026-06-10 │ security      │ 100/100       │ PASSED   │
│ 2026-06-09 │ code_review   │ 78/100        │ WARNING  │
│ 2026-06-09 │ test_coverage │ 75/100        │ WARNING  │
├────────────┼──────────────┼──────────────┼──────────┤
│ Trend:      │ ↑             │ ↑             │ ✅        │
└────────────┴──────────────┴──────────────┴──────────┘

Quality Gate Metrics (Since 2026-01-01):
- Average Score: 88.5/100
- Pass Rate: 92.3%
- Improvement: +15.2% (vs previous period)
```

---

## 🎯 Best Practices

### 1. Quality Gates in CI/CD

✅ **In Pull Requests** ausführen
✅ **Vor dem Merge** prüfen
✅ **Strict Mode** für main-Branch
✅ **Warnungen beheben** bevor sie zu Fehlern werden
✅ **Regelmäßig aktualisieren**

---

### 2. Quality Gates konfigurieren

✅ **Anforderungen anpassen** an dein Projekt
✅ **Realistische Schwellenwerte** setzen
✅ **Wichtige Gates** immer aktivieren (Security, Code Review)
✅ **Performance Gates** nur bei Bedarf aktivieren
✅ **Custom Gates** für spezifische Anforderungen

---

### 3. Ergebnisse interpretieren

✅ **PASSED** = Alles OK, kann gemergt werden
⚠️ **WARNING** = Warnungen prüfen, aber nicht blockierend
❌ **FAILED** = Kritische Fehler, müssen behoben werden

---

## 📖 Nächste Schritte

1. **Quality Gates einrichten:**
   ```bash
   ultracode quality check --strict
   ```

2. **Quality Gates anpassen:**
   → [Konfiguration →](../GETTING-STARTED/configuration.md)

3. **Mehr über AI-Features:**
   → [AI-Versionierungssystem →](./versioning-system.md)
   → [Release Planning →](./release-planning.md)

---

## 🤝 Community & Support

- **Discord:** [#quality-gates Channel](https://discord.gg/ultracode)
- **GitHub Issues:** [quality-gates Label](https://github.com/ultracode-ai/ultracode/labels/quality-gates)
- **Dokumentation:** [UltraCode Docs](https://ultracode.ai/docs)

---

## 🔗 Verweise

- [AI-Versionierungssystem →](./versioning-system.md)
- [Release Planning →](./release-planning.md)
- [Tools-Referenz →](../DEVELOPMENT/tools-reference.md)
- [Konfiguration →](../GETTING-STARTED/configuration.md)
