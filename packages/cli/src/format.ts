/**
 * Human-readable formatters for the versioning subsystem's result types
 * (`ChangeAnalysis`, `VersionSuggestion`, `ReleasePlan`, `QualityReport`).
 * All formatters are pure, total and ANSI-free.
 */

import type {
  ChangeAnalysis,
  QualityReport,
  ReleasePlan,
  VersionSuggestion,
} from "@ultracode/shared";
import { truncate } from "@ultracode/shared";

/** Cap applied to free-form blocks (changelog drafts etc.). */
const MAX_BLOCK_CHARS = 10_000;

/** Format a {@link ChangeAnalysis} as an indented plain-text report. */
export function formatChangeAnalysis(a: ChangeAnalysis): string {
  const additions = a.files.reduce((n, f) => n + f.additions, 0);
  const deletions = a.files.reduce((n, f) => n + f.deletions, 0);
  const cats = Object.entries(a.categories)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  const lines: string[] = [
    "Change Analysis",
    `  Files:   ${a.files.length} changed (+${additions} / -${deletions})`,
    `  Commits: ${a.commits.length} (${cats})`,
    `  Breaking changes: ${a.breakingChanges.length}`,
  ];
  for (const b of a.breakingChanges) {
    lines.push(`    - [${b.source}] ${b.description}${b.location ? ` (${b.location})` : ""}`);
  }
  lines.push(`  Security findings: ${a.securityFindings.length}`);
  for (const s of a.securityFindings) {
    lines.push(
      `    - [${s.severity}] ${s.rule} in ${s.file}${s.line !== undefined ? `:${s.line}` : ""} — ${s.description}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Format a {@link VersionSuggestion} including bump, confidence and reasons. */
export function formatVersionSuggestion(s: VersionSuggestion): string {
  const confidence = Math.round(s.confidence * 100);
  const lines: string[] = [
    "Version Suggestion",
    `  ${s.currentVersion} → ${s.suggestedVersion} (${s.bump} bump, confidence ${confidence}%)`,
  ];
  if (s.reasons.length > 0) {
    lines.push("  Reasons:");
    for (const r of s.reasons) lines.push(`    - ${truncate(r, 200)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Format a {@link ReleasePlan} with milestones, risks and changelog draft. */
export function formatReleasePlan(p: ReleasePlan): string {
  const lines: string[] = [
    `Release Plan ${p.version}${p.targetDate ? ` (target ${p.targetDate})` : ""}`,
  ];
  lines.push(`  Milestones: ${p.milestones.length}`);
  for (const m of p.milestones) {
    lines.push(`    [${m.done ? "x" : " "}] ${m.title}`);
    for (const item of m.items) lines.push(`        - ${truncate(item, 200)}`);
  }
  lines.push(`  Risks: ${p.risks.length}`);
  for (const r of p.risks) {
    lines.push(`    - [${r.severity}] ${r.description} — mitigation: ${r.mitigation}`);
  }
  if (p.changelogDraft.trim() !== "") {
    lines.push("  Changelog draft:");
    for (const l of truncate(p.changelogDraft, MAX_BLOCK_CHARS).split(/\r?\n/)) {
      lines.push(`    ${l}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Format a {@link QualityReport}: per-gate `✓`/`✗` plus the overall score. */
export function formatQualityReport(q: QualityReport): string {
  const lines: string[] = [
    `Quality Report — ${q.passed ? "✓ PASSED" : "✗ FAILED"} (overall score ${q.overallScore})`,
  ];
  for (const g of q.gates) {
    const mark = g.passed ? "✓" : "✗";
    const score = g.score !== undefined ? ` (${g.score})` : "";
    lines.push(`  ${mark} ${g.gate}${score} — ${truncate(g.details, 200)}`);
  }
  return `${lines.join("\n")}\n`;
}
