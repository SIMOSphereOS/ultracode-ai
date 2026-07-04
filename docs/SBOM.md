# SBOM — Software Bill of Materials

**DE:** Menschenlesbares Abhängigkeits- und Lizenz-Inventar der **Produktions**-Abhängigkeiten (transitive Closure) von UltraCode AI. **EN:** Human-readable dependency and license inventory of UltraCode AI's **production** dependencies (transitive closure).

- **Projekt / Project:** `ultracode-ai-monorepo` v1.4.0 — SIMO GmbH
- **Projekt-Lizenz / Project license:** AGPL-3.0-or-later
- **Paketmanager / Package manager:** pnpm@11.5.2 · Node >=22.13.0
- **Quelle / Source:** `pnpm licenses list --prod --json` (Wahrheitsquelle / source of truth: `pnpm-lock.yaml`)
- **Umfang / Scope:** nur Produktion (`--prod`, entspricht `--omit dev`); Dev-/Build-Tools sind ausgeschlossen. / production only; dev/build tools excluded.

> **DE:** Generiert mit `node scripts/gen-sbom.mjs` — **nicht von Hand bearbeiten**. Deterministisch (keine Zeitstempel). Eine maschinenlesbare CycloneDX-SBOM (`sbom.json`) sollte zusätzlich im CI erzeugt werden (siehe `docs/DEVELOPMENT/README.md → SBOM / Supply-Chain`). **EN:** Generated with `node scripts/gen-sbom.mjs` — **do not edit by hand**. Deterministic (no timestamps). A machine-readable CycloneDX SBOM (`sbom.json`) should additionally be produced in CI.

## Lizenz-Übersicht / License summary

| Lizenz / License | Pakete / Packages |
| --- | ---: |
| MIT | 44 |
| ISC | 2 |
| (MIT OR CC0-1.0) | 1 |
| BSD-3-Clause | 1 |
| **Summe / Total** | **48** |

**DE:** Alle Produktionslizenzen sind permissiv (MIT/ISC/BSD-3-Clause/CC0) und mit der AGPL-3.0-or-later des Projekts kompatibel — kein Copyleft im Produktionsbaum. **EN:** All production licenses are permissive (MIT/ISC/BSD-3-Clause/CC0) and compatible with the project's AGPL-3.0-or-later — no copyleft in the production tree.

## Direkte Produktions-Abhängigkeiten / Direct production dependencies

| Paket / Package | Version-Range | Deklariert in / Declared in |
| --- | --- | --- |
| `commander` | `^12.1.0` | `ultracode-ai` |
| `ink` | `^5.1.0` | `ultracode-ai` |
| `react` | `^18.3.1` | `ultracode-ai` |
| `semver` | `^7.6.0` | `ultracode-core` |
| `smol-toml` | `^1.3.0` | `ultracode-core` |
| `zod` | `^3.24.0` | `ultracode-core` |

## Vollständiges Inventar / Full inventory (transitive, `--prod`)

| Paket / Package | Version | Lizenz / License |
| --- | --- | --- |
| `@alcalzone/ansi-tokenize` | 0.1.3 | MIT |
| `@types/prop-types` | 15.7.15 | MIT |
| `@types/react` | 18.3.31 | MIT |
| `ansi-escapes` | 7.3.0 | MIT |
| `ansi-regex` | 6.2.2 | MIT |
| `ansi-styles` | 6.2.3 | MIT |
| `auto-bind` | 5.0.1 | MIT |
| `chalk` | 5.6.2 | MIT |
| `cli-boxes` | 3.0.0 | MIT |
| `cli-cursor` | 4.0.0 | MIT |
| `cli-truncate` | 4.0.0 | MIT |
| `code-excerpt` | 4.0.0 | MIT |
| `commander` | 12.1.0 | MIT |
| `convert-to-spaces` | 2.0.1 | MIT |
| `csstype` | 3.2.3 | MIT |
| `emoji-regex` | 10.6.0 | MIT |
| `environment` | 1.1.0 | MIT |
| `es-toolkit` | 1.47.0 | MIT |
| `escape-string-regexp` | 2.0.0 | MIT |
| `get-east-asian-width` | 1.6.0 | MIT |
| `indent-string` | 5.0.0 | MIT |
| `ink` | 5.2.1 | MIT |
| `is-fullwidth-code-point` | 4.0.0 | MIT |
| `is-fullwidth-code-point` | 5.1.0 | MIT |
| `is-in-ci` | 1.0.0 | MIT |
| `js-tokens` | 4.0.0 | MIT |
| `loose-envify` | 1.4.0 | MIT |
| `mimic-fn` | 2.1.0 | MIT |
| `onetime` | 5.1.2 | MIT |
| `patch-console` | 2.0.0 | MIT |
| `react` | 18.3.1 | MIT |
| `react-reconciler` | 0.29.2 | MIT |
| `restore-cursor` | 4.0.0 | MIT |
| `scheduler` | 0.23.2 | MIT |
| `semver` | 7.8.4 | ISC |
| `signal-exit` | 3.0.7 | ISC |
| `slice-ansi` | 5.0.0 | MIT |
| `slice-ansi` | 7.1.2 | MIT |
| `smol-toml` | 1.6.1 | BSD-3-Clause |
| `stack-utils` | 2.0.6 | MIT |
| `string-width` | 7.2.0 | MIT |
| `strip-ansi` | 7.2.0 | MIT |
| `type-fest` | 4.41.0 | (MIT OR CC0-1.0) |
| `widest-line` | 5.0.0 | MIT |
| `wrap-ansi` | 9.0.2 | MIT |
| `ws` | 8.21.0 | MIT |
| `yoga-layout` | 3.2.1 | MIT |
| `zod` | 3.25.76 | MIT |

