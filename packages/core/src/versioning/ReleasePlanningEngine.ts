/**
 * Release Planning Engine — drafts a Keep-a-Changelog changelog, milestones
 * and a risk assessment from a {@link ChangeAnalysis}.
 *
 * An optional {@link ILLMProvider} may polish the heuristic changelog draft;
 * provider failures are swallowed and the heuristic result is kept, so the
 * engine is fully functional offline.
 */

import type {
  ChangeAnalysis,
  CommitInfo,
  ILLMProvider,
  Logger,
  Milestone,
  ReleasePlan,
  Risk,
  SecurityFinding,
  UltraCodeConfig,
} from "@ultracode/shared";
import { parseConventionalSubject } from "./conventional.js";

/** Construction options for {@link ReleasePlanningEngine}. */
export interface ReleasePlanningEngineOptions {
  /** Logger for diagnostics. */
  logger: Logger;
  /** Optional LLM provider used to polish the changelog draft. */
  provider?: ILLMProvider;
  /** Optional full config (changelog model selection). */
  config?: UltraCodeConfig;
  /** Clock override for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

/** Options for a single {@link ReleasePlanningEngine.plan} call. */
export interface PlanOptions {
  /** Target release date, ISO-8601 (UTC). */
  targetDate?: string;
}

/** Total diff size (added + deleted lines) above which a release is risky. */
const LARGE_DIFF_THRESHOLD = 2000;

/** Human-friendly milestone titles for scopeless commit categories. */
const CATEGORY_TITLES: Record<string, string> = {
  feat: "Features",
  fix: "Bug fixes",
  perf: "Performance",
  refactor: "Refactoring",
  docs: "Documentation",
  test: "Testing",
  chore: "Maintenance",
  other: "General changes",
};

/** Changelog entry text for one commit (`**scope:** description`). */
function changelogEntry(commit: CommitInfo): string {
  const parsed = parseConventionalSubject(commit.subject);
  const description = parsed.description.trim() || commit.subject;
  return commit.scope ? `**${commit.scope}:** ${description}` : description;
}

/** Formats a security finding as a changelog/risk line. */
function findingLine(finding: SecurityFinding): string {
  const location = finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
  return `${finding.rule}: ${finding.description} (${location}, severity ${finding.severity})`;
}

/**
 * Plans a release for a target version: Keep-a-Changelog draft, milestones
 * derived from scopes/categories and a heuristic risk assessment.
 */
export class ReleasePlanningEngine {
  private readonly logger: Logger;
  private readonly provider: ILLMProvider | undefined;
  private readonly config: UltraCodeConfig | undefined;
  private readonly now: () => Date;

  constructor(options: ReleasePlanningEngineOptions) {
    this.logger = options.logger;
    this.provider = options.provider;
    this.config = options.config;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Builds a {@link ReleasePlan} for `version` from the given analysis. Works
   * fully offline; an injected provider only polishes the changelog draft.
   */
  public async plan(
    version: string,
    analysis: ChangeAnalysis,
    options: PlanOptions = {},
  ): Promise<ReleasePlan> {
    let changelogDraft = this.draftChangelog(version, analysis);
    changelogDraft = await this.polishWithProvider(changelogDraft);

    const plan: ReleasePlan = {
      version,
      milestones: this.buildMilestones(analysis),
      risks: this.assessRisks(analysis),
      changelogDraft,
    };
    if (options.targetDate !== undefined) plan.targetDate = options.targetDate;
    return plan;
  }

  /** Heuristic Keep-a-Changelog draft grouped by Added/Changed/Fixed/Security. */
  private draftChangelog(version: string, analysis: ChangeAnalysis): string {
    const date = this.now().toISOString().slice(0, 10);
    const lines: string[] = [`## [${version}] - ${date}`];

    const added = analysis.commits.filter((c) => c.type === "feat").map(changelogEntry);
    const fixed = analysis.commits.filter((c) => c.type === "fix").map(changelogEntry);
    const changed = [
      ...analysis.breakingChanges.map((b) =>
        b.location !== undefined
          ? `**BREAKING:** ${b.description} (${b.location})`
          : `**BREAKING:** ${b.description}`,
      ),
      ...analysis.commits
        .filter((c) => c.type === "perf" || c.type === "refactor")
        .map(changelogEntry),
    ];
    const security = analysis.securityFindings.map(findingLine);

    const sections: Array<[string, string[]]> = [
      ["Added", added],
      ["Changed", changed],
      ["Fixed", fixed],
      ["Security", security],
    ];
    let hasContent = false;
    for (const [title, entries] of sections) {
      if (entries.length === 0) continue;
      hasContent = true;
      lines.push("", `### ${title}`, ...entries.map((e) => `- ${e}`));
    }
    if (!hasContent) {
      lines.push("", "_No notable changes._");
    }
    return `${lines.join("\n")}\n`;
  }

  /** Milestones from commit scopes, plus category groups for scopeless commits. */
  private buildMilestones(analysis: ChangeAnalysis): Milestone[] {
    const byScope = new Map<string, string[]>();
    const byCategory = new Map<string, string[]>();
    for (const commit of analysis.commits) {
      if (commit.scope !== null) {
        const items = byScope.get(commit.scope) ?? [];
        items.push(commit.subject);
        byScope.set(commit.scope, items);
      } else {
        const key = commit.type ?? "other";
        const items = byCategory.get(key) ?? [];
        items.push(commit.subject);
        byCategory.set(key, items);
      }
    }
    const milestones: Milestone[] = [];
    for (const [scope, items] of byScope) {
      milestones.push({ title: `Scope: ${scope}`, items, done: true });
    }
    for (const [category, items] of byCategory) {
      milestones.push({ title: CATEGORY_TITLES[category] ?? "General changes", items, done: true });
    }
    return milestones;
  }

  /** Heuristic risk assessment with mitigations. */
  private assessRisks(analysis: ChangeAnalysis): Risk[] {
    const risks: Risk[] = [];

    if (analysis.breakingChanges.length > 0) {
      risks.push({
        description: `${analysis.breakingChanges.length} breaking change(s) may break downstream consumers.`,
        severity: "high",
        mitigation:
          "Document every breaking change in a migration guide and communicate the major version bump clearly.",
      });
    }

    if (analysis.securityFindings.length > 0) {
      const maxSeverity = analysis.securityFindings.reduce<SecurityFinding["severity"]>(
        (acc, f) => {
          const order = { low: 0, medium: 1, high: 2, critical: 3 } as const;
          return order[f.severity] > order[acc] ? f.severity : acc;
        },
        "low",
      );
      const riskSeverity: Risk["severity"] =
        maxSeverity === "critical" || maxSeverity === "high"
          ? "high"
          : maxSeverity === "medium"
            ? "medium"
            : "low";
      risks.push({
        description: `${analysis.securityFindings.length} security finding(s) detected in the changeset (max severity: ${maxSeverity}).`,
        severity: riskSeverity,
        mitigation:
          "Rotate any exposed credentials and fix or formally accept every flagged finding before the release.",
      });
    }

    const totalDiff = analysis.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    if (totalDiff > LARGE_DIFF_THRESHOLD) {
      risks.push({
        description: `Large changeset (${totalDiff} changed lines across ${analysis.files.length} files) increases regression risk.`,
        severity: "medium",
        mitigation: "Schedule an extra review pass and roll the release out in stages.",
      });
    }

    const total = analysis.commits.length;
    if (total > 0) {
      const conventional = analysis.commits.filter((c) => c.type !== null).length;
      if (conventional / total < 0.5) {
        risks.push({
          description: `Only ${conventional} of ${total} commit(s) follow Conventional Commits — automated analysis is less reliable.`,
          severity: "low",
          mitigation: "Adopt Conventional Commits so changelogs and version bumps stay trustworthy.",
        });
      }
    }

    return risks;
  }

  /** Lets the optional provider polish the draft; failures keep the heuristic. */
  private async polishWithProvider(draft: string): Promise<string> {
    if (this.provider === undefined) return draft;
    const model = this.config?.versioning.changelog.model ?? "mistral-medium";
    try {
      const result = await this.provider.complete({
        model,
        maxTokens: 2048,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a release-notes editor. Polish the following Keep-a-Changelog draft: improve wording, keep the exact section structure and markdown format, and return only the polished changelog.",
          },
          { role: "user", content: draft },
        ],
      });
      const text = result.text.trim();
      if (text !== "") return text;
      this.logger.warn("versioning: provider returned an empty changelog, keeping heuristic draft");
      return draft;
    } catch (err) {
      this.logger.warn("versioning: changelog polish via provider failed, keeping heuristic draft", {
        error: err instanceof Error ? err.message : String(err),
      });
      return draft;
    }
  }
}
