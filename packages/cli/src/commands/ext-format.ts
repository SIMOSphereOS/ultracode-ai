/**
 * Pure, ANSI-free, total formatters for the budget/authoring/learning result
 * types. Mirrors `../format.ts` for the versioning subsystem. Never throws.
 */

import type {
  BudgetStatusView,
  CostEstimate,
  LearnRunReport,
  LearnSource,
  LedgerEntry,
  SkillFrontmatter,
  AuthoringTestResult as TestResult,
} from "ultracode-core";
import { truncate } from "ultracode-shared";

/** Cap applied to free-form blocks. */
const MAX_BLOCK_CHARS = 10_000;

/** Format a USD amount with two decimals (total; clamps non-finite to 0). */
function usd(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/** Format a EUR amount with two decimals. */
function eur(n: number): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} EUR`;
}

/** Format a {@link BudgetStatusView} as an indented plain-text report. */
export function formatBudgetStatus(s: BudgetStatusView): string {
  const lines: string[] = ["Budget Status"];
  if (s.periodStart !== undefined) lines.push(`  Period start: ${s.periodStart}`);
  lines.push(`  Spent:     ${usd(s.spentUsd)}`);
  lines.push(`  Cap:       ${s.capUsd === null ? "(none)" : usd(s.capUsd)}`);
  lines.push(`  Remaining: ${usd(s.remainingUsd)}`);
  if (s.entries !== undefined) lines.push(`  Ledger entries: ${s.entries}`);
  if (s.byCategory && Object.keys(s.byCategory).length > 0) {
    lines.push("  By category:");
    for (const [cat, amount] of Object.entries(s.byCategory)) {
      lines.push(`    - ${cat}: ${usd(amount)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Format a {@link CostEstimate} (used standalone by `budget estimate`). */
export function formatCostEstimate(e: CostEstimate): string {
  const lines: string[] = ["Cost Estimate"];
  if (e.pages !== undefined) lines.push(`  Pages: ${e.pages}`);
  lines.push(`  Tokens: ${e.tokensIn} in / ${e.tokensOut} out`);
  lines.push(`  USD range: ${usd(e.usdLow)} – ${usd(e.usdHigh)}`);
  lines.push(`  EUR: ${eur(e.eur)} (fx ${e.fxRate})`);
  if (e.byModel.length > 0) {
    lines.push("  By model:");
    for (const m of e.byModel) {
      lines.push(`    - ${m.model}: ${m.tokensIn} in / ${m.tokensOut} out → ${usd(m.usd)}`);
    }
  }
  const assumptions = e.assumptions.join("; ").trim();
  if (assumptions !== "") {
    lines.push(`  Assumptions: ${truncate(assumptions, 400)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Format a budget ledger ({@link LedgerEntry}[]) as a chronological list. */
export function formatLedger(entries: ReadonlyArray<LedgerEntry>): string {
  if (entries.length === 0) return "(no ledger entries)\n";
  const lines: string[] = [
    `Budget History — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
  ];
  for (const e of entries) {
    const model = e.model !== undefined ? ` ${e.model}` : "";
    const note = e.note !== undefined && e.note !== "" ? ` — ${truncate(e.note, 120)}` : "";
    lines.push(
      `  ${e.ts} [${e.category}]${model} est ${usd(e.estimatedUsd)} / act ${usd(e.actualUsd)}${note}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Format a list of skills ({@link SkillFrontmatter}[]). */
export function formatSkillList(skills: ReadonlyArray<SkillFrontmatter>): string {
  if (skills.length === 0) return "(no skills)\n";
  const lines: string[] = [`Skills — ${skills.length}`];
  for (const s of skills) {
    lines.push(
      `  ${s.name} v${s.version} [${s.status}] (${s.catalog}) — ${truncate(s.description, 80)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Format a {@link TestResult} with a per-check ✓/✗ breakdown. */
export function formatTestResult(t: TestResult): string {
  const lines: string[] = [`Test Result — ${t.passed ? "✓ PASSED" : "✗ FAILED"}`];
  for (const c of t.checks) {
    lines.push(`  ${c.passed ? "✓" : "✗"} ${c.name} — ${truncate(c.detail, 200)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Format a list of learn sources ({@link LearnSource}[]). */
export function formatSourceList(sources: ReadonlyArray<LearnSource>): string {
  if (sources.length === 0) return "(no learning sources)\n";
  const lines: string[] = [`Learning Sources — ${sources.length}`];
  for (const s of sources) {
    const last = s.lastProcessed !== undefined ? ` last ${s.lastProcessed}` : " never processed";
    lines.push(`  ${s.id} [${s.catalog}/${s.schedule}] ${s.url}${last}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Format a {@link LearnRunReport} after an executed learn run. */
export function formatLearnReport(r: LearnRunReport): string {
  const lines: string[] = [
    `Learn Run — ${r.sourceId}`,
    `  Pages: ${r.pagesChecked} checked, ${r.notModified} not-modified, ${r.unchanged} unchanged, ${r.processed} processed, ${r.errors} error(s)`,
    `  Skills: ${r.skillsCreated} created, ${r.skillsUpdated} updated`,
    `  Cost: est ${usd(r.estimatedUsd)} / act ${usd(r.actualUsd)}`,
    `  Window: ${r.startedAt} → ${r.finishedAt}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Truncate a free-form block (rationale/diff) for display. */
export function formatBlock(label: string, text: string): string {
  if (text.trim() === "") return "";
  return `${label}:\n${truncate(text, MAX_BLOCK_CHARS)
    .split(/\r?\n/)
    .map((l) => `  ${l}`)
    .join("\n")}\n`;
}
