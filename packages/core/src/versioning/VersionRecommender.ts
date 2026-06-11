/**
 * Version Recommender — turns a {@link ChangeAnalysis} into a SemVer bump
 * suggestion with confidence and human-readable reasons.
 */

import { clean, inc, major, prerelease, valid } from "semver";
import type { ReleaseType } from "semver";
import { VersioningError, clamp } from "@ultracode/shared";
import type {
  BumpType,
  ChangeAnalysis,
  Logger,
  VersionSuggestion,
  VersioningConfig,
} from "@ultracode/shared";

/** Options influencing a single suggestion. */
export interface SuggestOptions {
  /**
   * Prerelease identifier (`"alpha"`, `"beta"`, `"rc"`, …). When set the
   * suggestion becomes a prerelease bump using this identifier.
   */
  prerelease?: string;
}

/** Construction options for {@link VersionRecommender}. */
export interface VersionRecommenderOptions {
  /** Versioning config (used for channel resolution). */
  config?: VersioningConfig;
  /** Optional logger. */
  logger?: Logger;
}

/** Paths that do not count as code changes (docs, licences, plain text). */
const NON_CODE_FILE_RE =
  /(\.(md|markdown|txt|rst|adoc)$)|((^|\/)(docs?|documentation)\/)|((^|\/)(LICENSE|NOTICE|AUTHORS|CODEOWNERS)([._-]|$))/i;

/** Whether a changed file is considered production/test code (vs. docs). */
function isCodeFile(path: string): boolean {
  return !NON_CODE_FILE_RE.test(path);
}

/**
 * Recommends the next version based on a change analysis, applying SemVer 2.0
 * rules (with the `0.x` convention that breaking changes bump minor).
 */
export class VersionRecommender {
  private readonly config: VersioningConfig | undefined;
  private readonly logger: Logger | undefined;

  constructor(options: VersionRecommenderOptions = {}) {
    this.config = options.config;
    this.logger = options.logger;
  }

  /**
   * Resolves the current version of a release channel from
   * `VersioningConfig.channels`. Throws {@link VersioningError} for unknown
   * channels.
   */
  public resolveChannelVersion(channel = "stable"): string {
    const version = this.config?.channels?.[channel];
    if (version === undefined || version === "") {
      throw new VersioningError(`unknown release channel "${channel}"`, {
        details: { channel, knownChannels: Object.keys(this.config?.channels ?? {}) },
      });
    }
    return version;
  }

  /**
   * Produces a {@link VersionSuggestion} for the given analysis and current
   * version. Throws {@link VersioningError} when `currentVersion` is not a
   * valid SemVer version (a leading `v` prefix is tolerated).
   */
  public suggest(
    analysis: ChangeAnalysis,
    currentVersion: string,
    options: SuggestOptions = {},
  ): VersionSuggestion {
    const cleaned = valid(clean(currentVersion) ?? "") ?? valid(currentVersion);
    if (cleaned === null) {
      throw new VersioningError(`current version "${currentVersion}" is not valid SemVer`, {
        details: { currentVersion },
      });
    }

    const reasons: string[] = [];
    const categories = analysis.categories;
    const totalCommits = analysis.commits.length;
    const conventionalCommits = analysis.commits.filter((c) => c.type !== null).length;
    const breakingCount =
      analysis.breakingChanges.length > 0
        ? analysis.breakingChanges.length
        : analysis.commits.filter((c) => c.breaking).length;
    const hasBreaking = breakingCount > 0;
    const functionalCount = categories.fix + categories.perf + categories.refactor;
    let lowConfidence = false;

    let bump: BumpType;
    if (totalCommits === 0 && analysis.files.length === 0) {
      bump = "none";
      reasons.push("No commits or file changes found in the analysed range.");
    } else if (hasBreaking) {
      if (major(cleaned) === 0) {
        bump = "minor";
        reasons.push(
          `${breakingCount} breaking change(s) detected; on a 0.x version breaking changes map to a minor bump (SemVer pre-1.0 convention).`,
        );
      } else {
        bump = "major";
        reasons.push(`${breakingCount} breaking change(s) detected — a major bump is required.`);
      }
    } else if (categories.feat > 0) {
      bump = "minor";
      reasons.push(`${categories.feat} feature commit(s) — backwards-compatible minor bump.`);
    } else if (functionalCount > 0) {
      bump = "patch";
      reasons.push(
        `${functionalCount} fix/perf/refactor commit(s) — backwards-compatible patch bump.`,
      );
    } else {
      const codeChanged = analysis.files.some((f) => isCodeFile(f.path));
      if (!codeChanged) {
        bump = "none";
        reasons.push(
          "Only documentation/chore/test changes without code impact — no release required.",
        );
      } else {
        bump = "patch";
        lowConfidence = true;
        reasons.push(
          "Only docs/chore/test or unclassified commits, but code files changed — defaulting to a cautious patch bump.",
        );
      }
    }

    let suggestedVersion: string;
    if (options.prerelease !== undefined && options.prerelease !== "") {
      const identifier = options.prerelease;
      const releaseType: ReleaseType =
        prerelease(cleaned) !== null
          ? "prerelease"
          : (`pre${bump === "none" ? "patch" : bump}` as ReleaseType);
      const next = inc(cleaned, releaseType, identifier);
      if (next === null) {
        throw new VersioningError(
          `could not compute a ${releaseType} increment of "${cleaned}"`,
          { details: { currentVersion: cleaned, releaseType, identifier } },
        );
      }
      suggestedVersion = next;
      bump = "prerelease";
      reasons.push(`Prerelease identifier "${identifier}" requested — ${releaseType} increment.`);
    } else if (bump === "none") {
      suggestedVersion = cleaned;
    } else {
      const next = inc(cleaned, bump as ReleaseType);
      if (next === null) {
        throw new VersioningError(`could not compute a ${bump} increment of "${cleaned}"`, {
          details: { currentVersion: cleaned, bump },
        });
      }
      suggestedVersion = next;
    }

    let confidence: number;
    if (totalCommits === 0) {
      confidence = bump === "none" ? 0.9 : 0.5;
    } else {
      const conventionalRatio = conventionalCommits / totalCommits;
      confidence = 0.35 + 0.55 * conventionalRatio;
      if (hasBreaking) confidence = Math.min(1, confidence + 0.05);
      if (lowConfidence) confidence = Math.min(confidence, 0.4);
      reasons.push(
        `${conventionalCommits} of ${totalCommits} commit(s) follow the Conventional Commits format.`,
      );
    }
    confidence = Math.round(clamp(confidence, 0, 1) * 100) / 100;

    this.logger?.debug("versioning: suggestion computed", {
      currentVersion: cleaned,
      suggestedVersion,
      bump,
      confidence,
    });

    return { currentVersion: cleaned, suggestedVersion, bump, confidence, reasons };
  }
}
