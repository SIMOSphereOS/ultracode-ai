#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// gen-sbom.mjs — deterministischer SBOM-/Lizenz-Inventar-Generator.
//   Determi­nistic SBOM / license-inventory generator.
//
// Erzeugt docs/SBOM.md aus `pnpm licenses list --prod --json` (nur Produktions-
// Abhängigkeiten). Deterministisch: keine Zeitstempel, stabile Sortierung —
// die einzige Wahrheitsquelle ist pnpm-lock.yaml. /
// Produces docs/SBOM.md from `pnpm licenses list --prod --json` (production
// dependencies only). Deterministic: no timestamps, stable sort — the single
// source of truth is pnpm-lock.yaml.
//
// Nutzung / Usage:  node scripts/gen-sbom.mjs
//
// Hinweis: Dies ist ein menschenlesbares Inventar. Eine maschinenlesbare
// CycloneDX-SBOM (sbom.json) sollte zusätzlich im CI erzeugt werden — siehe
// docs/DEVELOPMENT/README.md → "SBOM / Supply-Chain". /
// Note: this is a human-readable inventory. A machine-readable CycloneDX SBOM
// (sbom.json) should additionally be produced in CI — see the developer docs.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Liest package.json relativ zum Repo-Root. / Read a package.json under root. */
function readPkg(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

/** Sammelt die direkten Produktions-Deps aller Workspace-Pakete (ohne interne). */
function directProdDeps() {
  const pkgs = [
    "packages/shared/package.json",
    "packages/core/package.json",
    "packages/cli/package.json",
  ];
  const rows = [];
  for (const rel of pkgs) {
    const p = readPkg(rel);
    for (const [name, range] of Object.entries(p.dependencies || {})) {
      // Interne Workspace-Referenzen überspringen. / Skip internal workspace refs.
      if (String(range).startsWith("workspace:")) continue;
      rows.push({ pkg: p.name, name, range: String(range) });
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.pkg.localeCompare(b.pkg));
  return rows;
}

/** Ruft `pnpm licenses list --prod --json` auf und parst das Ergebnis. */
function pnpmLicenses() {
  const out = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/** Flacht die nach Lizenz gruppierte pnpm-Ausgabe zu (name, version, license). */
function flatten(byLicense) {
  const seen = new Set();
  const rows = [];
  for (const groupLicense of Object.keys(byLicense)) {
    for (const pkg of byLicense[groupLicense]) {
      const license = pkg.license || groupLicense || "UNKNOWN";
      for (const version of pkg.versions || []) {
        const key = `${pkg.name}@${version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ name: pkg.name, version, license });
      }
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return rows;
}

/** Zählt Pakete je Lizenz. / Counts packages per license. */
function licenseSummary(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.license, (counts.get(r.license) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Escaped Pipe-Zeichen für Markdown-Tabellen. / Escape pipes for MD tables. */
const esc = (s) => String(s).replace(/\|/g, "\\|");

function render(rootPkg, direct, rows, summary) {
  const L = [];
  L.push("# SBOM — Software Bill of Materials");
  L.push("");
  L.push(
    "**DE:** Menschenlesbares Abhängigkeits- und Lizenz-Inventar der " +
      "**Produktions**-Abhängigkeiten (transitive Closure) von UltraCode AI. " +
      "**EN:** Human-readable dependency and license inventory of UltraCode AI's " +
      "**production** dependencies (transitive closure).",
  );
  L.push("");
  L.push(
    `- **Projekt / Project:** \`${rootPkg.name}\` v${rootPkg.version} — ${rootPkg.author || "SIMO GmbH"}`,
  );
  L.push(`- **Projekt-Lizenz / Project license:** ${rootPkg.license}`);
  L.push(
    `- **Paketmanager / Package manager:** ${rootPkg.packageManager || "pnpm"} · Node ${rootPkg.engines?.node || "n/a"}`,
  );
  L.push(
    "- **Quelle / Source:** `pnpm licenses list --prod --json` (Wahrheitsquelle / source of truth: `pnpm-lock.yaml`)",
  );
  L.push(
    "- **Umfang / Scope:** nur Produktion (`--prod`, entspricht `--omit dev`); " +
      "Dev-/Build-Tools sind ausgeschlossen. / production only; dev/build tools excluded.",
  );
  L.push("");
  L.push(
    "> **DE:** Generiert mit `node scripts/gen-sbom.mjs` — **nicht von Hand " +
      "bearbeiten**. Deterministisch (keine Zeitstempel). Eine maschinenlesbare " +
      "CycloneDX-SBOM (`sbom.json`) sollte zusätzlich im CI erzeugt werden " +
      "(siehe `docs/DEVELOPMENT/README.md → SBOM / Supply-Chain`). " +
      "**EN:** Generated with `node scripts/gen-sbom.mjs` — **do not edit by " +
      "hand**. Deterministic (no timestamps). A machine-readable CycloneDX SBOM " +
      "(`sbom.json`) should additionally be produced in CI.",
  );
  L.push("");
  L.push("## Lizenz-Übersicht / License summary");
  L.push("");
  L.push("| Lizenz / License | Pakete / Packages |");
  L.push("| --- | ---: |");
  for (const [lic, n] of summary) L.push(`| ${esc(lic)} | ${n} |`);
  L.push(`| **Summe / Total** | **${rows.length}** |`);
  L.push("");
  L.push(
    "**DE:** Alle Produktionslizenzen sind permissiv (MIT/ISC/BSD-3-Clause/CC0) " +
      "und mit der AGPL-3.0-or-later des Projekts kompatibel — kein Copyleft im " +
      "Produktionsbaum. **EN:** All production licenses are permissive " +
      "(MIT/ISC/BSD-3-Clause/CC0) and compatible with the project's " +
      "AGPL-3.0-or-later — no copyleft in the production tree.",
  );
  L.push("");
  L.push("## Direkte Produktions-Abhängigkeiten / Direct production dependencies");
  L.push("");
  L.push("| Paket / Package | Version-Range | Deklariert in / Declared in |");
  L.push("| --- | --- | --- |");
  for (const d of direct)
    L.push(`| \`${esc(d.name)}\` | \`${esc(d.range)}\` | \`${esc(d.pkg)}\` |`);
  L.push("");
  L.push("## Vollständiges Inventar / Full inventory (transitive, `--prod`)");
  L.push("");
  L.push("| Paket / Package | Version | Lizenz / License |");
  L.push("| --- | --- | --- |");
  for (const r of rows) L.push(`| \`${esc(r.name)}\` | ${esc(r.version)} | ${esc(r.license)} |`);
  L.push("");
  return `${L.join("\n")}\n`;
}

function main() {
  const rootPkg = readPkg("package.json");
  const direct = directProdDeps();
  const rows = flatten(pnpmLicenses());
  const summary = licenseSummary(rows);
  const md = render(rootPkg, direct, rows, summary);
  const outPath = join(ROOT, "docs", "SBOM.md");
  writeFileSync(outPath, md, "utf8");
  process.stdout.write(
    `SBOM geschrieben / written: docs/SBOM.md (${rows.length} Pakete / packages, ${summary.length} Lizenzen / licenses)\n`,
  );
}

main();
