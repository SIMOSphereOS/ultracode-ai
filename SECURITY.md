# Security Policy / Sicherheitsrichtlinie — UltraCode AI

Vielen Dank, dass Sie helfen, UltraCode AI sicher zu halten. / Thank you for helping keep UltraCode AI secure.

---

## DE — Deutsch

### Sicherheitslücke melden

Bitte melden Sie Schwachstellen **vertraulich und koordiniert** — **nicht** über öffentliche GitHub-Issues, Merge Requests, Diskussionen oder soziale Medien.

- **E-Mail:** security@simosphereai.com *(Platzhalter — vor Veröffentlichung durch SIMO bestätigen/anpassen)*
- **Verschlüsselung (PGP):** Für sensible Details stellen wir einen PGP-Schlüssel bereit. Fordern Sie ihn per o. g. Adresse an oder nutzen Sie den im Repository hinterlegten Fingerprint, sobald veröffentlicht.
- **Alternativ:** die private Meldefunktion „Report a vulnerability" (GitHub Security Advisories) im Projekt-Repository.

Bitte geben Sie so viele Informationen wie möglich an:

- betroffene Version/Commit und Plattform (Linux/macOS/Windows, Node-Version),
- eine Beschreibung der Schwachstelle und ihrer möglichen Auswirkung,
- eine **reproduzierbare** Schritt-für-Schritt-Anleitung oder einen Proof-of-Concept,
- ggf. eine vorgeschlagene Behebung.

### Was Sie von uns erwarten können (Zielzeiten)

| Schritt | Zielzeit |
| --- | --- |
| **Empfangsbestätigung** | innerhalb von **72 Stunden** |
| **Erste Einschätzung / Triage** | innerhalb von **7 Kalendertagen** |
| **Statusupdates** | mindestens alle **14 Tage** bis zur Behebung |
| **Koordinierte Offenlegung** | nach Bereitstellung eines Fixes, i. d. R. innerhalb von **90 Tagen** |

Wir arbeiten nach dem Prinzip der **koordinierten Offenlegung (Coordinated Vulnerability Disclosure)**: Wir stimmen den Zeitpunkt der Veröffentlichung mit Ihnen ab, veröffentlichen ein Security Advisory und nennen Sie auf Wunsch als Melder:in (Credit). Bitte geben Sie uns eine angemessene Frist zur Behebung, bevor Sie Details öffentlich machen.

### Unterstützte Versionen

| Version | Unterstützt |
| --- | --- |
| **1.4.x** | ✅ Sicherheitsupdates |
| < 1.4 | ❌ nicht mehr unterstützt — bitte aktualisieren |

Sicherheitskorrekturen fließen in die jeweils aktuelle **1.4.x**-Linie ein. Ältere Stände erhalten keine Fixes; ein Upgrade wird empfohlen.

### Geltungsbereich (Scope)

Im Geltungsbereich: der Quellcode dieses Repositorys (Pakete `ultracode-shared`, `ultracode-core`, `ultracode-ai`) und die veröffentlichten Artefakte. Außerhalb: Schwachstellen in Dritt-Abhängigkeiten (bitte direkt beim jeweiligen Projekt melden; informieren Sie uns dennoch gern) sowie Fehlkonfigurationen in Ihrer eigenen Umgebung. **Safe Harbor:** Gutgläubige, an dieser Richtlinie orientierte Sicherheitsforschung betrachten wir nicht als Verstoß; unterlassen Sie Datenabfluss, Dienstunterbrechung und Zugriff auf fremde Daten.

---

## EN — English

### Reporting a vulnerability

Please report vulnerabilities **confidentially and in a coordinated manner** — **not** via public GitHub issues, merge requests, discussions or social media.

- **Email:** security@simosphereai.com *(placeholder — confirm/adjust via SIMO before publication)*
- **Encryption (PGP):** For sensitive details we provide a PGP key. Request it at the address above, or use the fingerprint published in the repository once available.
- **Alternatively:** the private "Report a vulnerability" function (GitHub Security Advisories) in the project repository.

Please include as much detail as possible:

- affected version/commit and platform (Linux/macOS/Windows, Node version),
- a description of the vulnerability and its potential impact,
- **reproducible** step-by-step instructions or a proof of concept,
- optionally, a proposed fix.

### What to expect from us (target times)

| Step | Target |
| --- | --- |
| **Acknowledgement of receipt** | within **72 hours** |
| **Initial assessment / triage** | within **7 calendar days** |
| **Status updates** | at least every **14 days** until resolved |
| **Coordinated disclosure** | after a fix is available, typically within **90 days** |

We follow **Coordinated Vulnerability Disclosure**: we align the publication timing with you, publish a security advisory and credit you as reporter if you wish. Please allow us a reasonable period to remediate before disclosing details publicly.

### Supported versions

| Version | Supported |
| --- | --- |
| **1.4.x** | ✅ security updates |
| < 1.4 | ❌ no longer supported — please upgrade |

Security fixes land in the current **1.4.x** line. Older builds receive no fixes; upgrading is recommended.

### Scope

In scope: the source code of this repository (packages `ultracode-shared`, `ultracode-core`, `ultracode-ai`) and the published artifacts. Out of scope: vulnerabilities in third-party dependencies (please report to the respective project directly; feel free to notify us as well) and misconfigurations in your own environment. **Safe harbor:** good-faith security research consistent with this policy is not considered a violation; refrain from data exfiltration, service disruption and access to others' data.

---

*Copyright © 2026 SIMO GmbH — UltraCode AI.*
