/**
 * AI versioning / release-planning contracts.
 *
 * These types describe the inputs and outputs of the Change Analysis,
 * Version Recommender, Release Planning and Quality Gate subsystems.
 */

/** Kind of version bump implied by a set of changes. */
export type BumpType = "major" | "minor" | "patch" | "prerelease" | "none";

/** A single file's change in a diff. */
export interface FileChange {
  /** Repository-relative path. */
  path: string;
  /** Change status. */
  status: "added" | "modified" | "deleted" | "renamed";
  /** Lines added. */
  additions: number;
  /** Lines removed. */
  deletions: number;
}

/** Parsed Conventional-Commit-style metadata for one commit. */
export interface CommitInfo {
  /** Commit hash. */
  hash: string;
  /** Conventional type (e.g. `"feat"`), or `null` if unparseable. */
  type: string | null;
  /** Conventional scope, or `null` if absent. */
  scope: string | null;
  /** Commit subject line. */
  subject: string;
  /** Whether the commit declares a breaking change. */
  breaking: boolean;
}

/** A detected breaking change. */
export interface BreakingChange {
  /** Where the signal came from. */
  source: "commit" | "api-diff";
  /** Human-readable description. */
  description: string;
  /** Optional location (file, symbol, …). */
  location?: string;
}

/** A security finding from static analysis. */
export interface SecurityFinding {
  /** Severity ranking. */
  severity: "low" | "medium" | "high" | "critical";
  /** Rule/check identifier. */
  rule: string;
  /** Affected file path. */
  file: string;
  /** Affected line number, when known. */
  line?: number;
  /** Human-readable description. */
  description: string;
}

/** Aggregated analysis of a change set. */
export interface ChangeAnalysis {
  /** Changed files. */
  files: FileChange[];
  /** Parsed commits. */
  commits: CommitInfo[];
  /** Detected breaking changes. */
  breakingChanges: BreakingChange[];
  /** Commit-category tallies. */
  categories: {
    feat: number;
    fix: number;
    docs: number;
    refactor: number;
    test: number;
    chore: number;
    perf: number;
    other: number;
  };
  /** Security findings discovered during analysis. */
  securityFindings: SecurityFinding[];
}

/** A recommended next version with rationale. */
export interface VersionSuggestion {
  /** Current version string. */
  currentVersion: string;
  /** Suggested next version string. */
  suggestedVersion: string;
  /** The bump that produced the suggestion. */
  bump: BumpType;
  /** Confidence in the suggestion, `0`–`1`. */
  confidence: number;
  /** Human-readable reasons supporting the suggestion. */
  reasons: string[];
}

/** A release milestone. */
export interface Milestone {
  /** Milestone title. */
  title: string;
  /** Work items under this milestone. */
  items: string[];
  /** Whether the milestone is complete. */
  done: boolean;
}

/** A release risk and its mitigation. */
export interface Risk {
  /** Risk description. */
  description: string;
  /** Risk severity. */
  severity: "low" | "medium" | "high";
  /** Planned mitigation. */
  mitigation: string;
}

/** A drafted release plan. */
export interface ReleasePlan {
  /** Target version. */
  version: string;
  /** Target date, ISO-8601 (UTC), when set. */
  targetDate?: string;
  /** Milestones for the release. */
  milestones: Milestone[];
  /** Identified risks. */
  risks: Risk[];
  /** Draft changelog text. */
  changelogDraft: string;
}

/** Result of a single quality gate. */
export interface QualityGateResult {
  /** Gate identifier (e.g. `"coverage"`, `"review"`). */
  gate: string;
  /** Whether the gate passed. */
  passed: boolean;
  /** Optional numeric score for the gate. */
  score?: number;
  /** Human-readable detail. */
  details: string;
}

/** Aggregated quality report across all gates. */
export interface QualityReport {
  /** `true` iff every gate passed. */
  passed: boolean;
  /** Per-gate results. */
  gates: QualityGateResult[];
  /** Overall score across gates. */
  overallScore: number;
}
