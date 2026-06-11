import { describe, expect, it } from "vitest";
import type {
  ChangeAnalysis,
  QualityReport,
  ReleasePlan,
  VersionSuggestion,
} from "@ultracode/shared";
import {
  formatChangeAnalysis,
  formatQualityReport,
  formatReleasePlan,
  formatVersionSuggestion,
} from "./format.js";

const emptyAnalysis: ChangeAnalysis = {
  files: [],
  commits: [],
  breakingChanges: [],
  categories: { feat: 0, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 },
  securityFindings: [],
};

describe("formatChangeAnalysis", () => {
  it("formats a populated analysis", () => {
    const a: ChangeAnalysis = {
      files: [
        { path: "src/a.ts", status: "modified", additions: 10, deletions: 2 },
        { path: "src/b.ts", status: "added", additions: 30, deletions: 0 },
      ],
      commits: [
        { hash: "abc", type: "feat", scope: null, subject: "add x", breaking: false },
      ],
      breakingChanges: [
        { source: "commit", description: "drop node 18", location: "package.json" },
      ],
      categories: { feat: 1, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 },
      securityFindings: [
        { severity: "high", rule: "no-eval", file: "src/a.ts", line: 10, description: "eval used" },
      ],
    };
    const out = formatChangeAnalysis(a);
    expect(out).toContain("2 changed (+40 / -2)");
    expect(out).toContain("feat 1");
    expect(out).toContain("[commit] drop node 18 (package.json)");
    expect(out).toContain("[high] no-eval in src/a.ts:10 — eval used");
  });

  it("formats an empty analysis", () => {
    const out = formatChangeAnalysis(emptyAnalysis);
    expect(out).toContain("0 changed (+0 / -0)");
    expect(out).toContain("Breaking changes: 0");
    expect(out).toContain("Security findings: 0");
  });
});

describe("formatVersionSuggestion", () => {
  it("formats bump, confidence and reasons", () => {
    const s: VersionSuggestion = {
      currentVersion: "1.2.3",
      suggestedVersion: "1.3.0",
      bump: "minor",
      confidence: 0.857,
      reasons: ["3 new features", "no breaking changes 🚀"],
    };
    const out = formatVersionSuggestion(s);
    expect(out).toContain("1.2.3 → 1.3.0 (minor bump, confidence 86%)");
    expect(out).toContain("- 3 new features");
    expect(out).toContain("🚀");
  });

  it("omits the reasons block when empty", () => {
    const s: VersionSuggestion = {
      currentVersion: "0.0.0",
      suggestedVersion: "0.0.0",
      bump: "none",
      confidence: 0,
      reasons: [],
    };
    expect(formatVersionSuggestion(s)).not.toContain("Reasons:");
  });
});

describe("formatReleasePlan", () => {
  it("formats milestones with checkmarks, risks and changelog", () => {
    const p: ReleasePlan = {
      version: "v2.0.0",
      targetDate: "2026-07-01T00:00:00Z",
      milestones: [
        { title: "API freeze", items: ["lock types"], done: true },
        { title: "Docs", items: ["write guide"], done: false },
      ],
      risks: [{ description: "migration pain", severity: "high", mitigation: "codemod" }],
      changelogDraft: "### Added\n- everything",
    };
    const out = formatReleasePlan(p);
    expect(out).toContain("Release Plan v2.0.0 (target 2026-07-01T00:00:00Z)");
    expect(out).toContain("[x] API freeze");
    expect(out).toContain("[ ] Docs");
    expect(out).toContain("[high] migration pain — mitigation: codemod");
    expect(out).toContain("### Added");
  });

  it("handles an empty plan and truncates a 1 MB changelog draft", () => {
    const p: ReleasePlan = {
      version: "v0.1.0",
      milestones: [],
      risks: [],
      changelogDraft: "z".repeat(1_200_000),
    };
    const out = formatReleasePlan(p);
    expect(out).toContain("Milestones: 0");
    expect(out.length).toBeLessThan(60_000);
  });
});

describe("formatQualityReport", () => {
  it("marks gates with ✓/✗ and shows scores", () => {
    const q: QualityReport = {
      passed: false,
      overallScore: 72,
      gates: [
        { gate: "coverage", passed: true, score: 85, details: "above threshold" },
        { gate: "review", passed: false, details: "no approving review" },
      ],
    };
    const out = formatQualityReport(q);
    expect(out).toContain("✗ FAILED (overall score 72)");
    expect(out).toContain("✓ coverage (85) — above threshold");
    expect(out).toContain("✗ review — no approving review");
  });

  it("formats a passing report with zero gates", () => {
    const q: QualityReport = { passed: true, overallScore: 100, gates: [] };
    expect(formatQualityReport(q)).toContain("✓ PASSED (overall score 100)");
  });
});
