/**
 * AI Versioning System — public entry point.
 *
 * Wires the Change Analysis Engine, Version Recommender, Release Planning
 * Engine and Quality Gate System together behind the
 * {@link createVersioningSystem} factory mandated by the monorepo factory
 * contract.
 */

import { DEFAULT_CONFIG } from "@ultracode/shared";
import type {
  ChangeAnalysis,
  ILLMProvider,
  Logger,
  QualityReport,
  ReleasePlan,
  UltraCodeConfig,
  VersionSuggestion,
  VersioningConfig,
} from "@ultracode/shared";
import { ChangeAnalysisEngine } from "./ChangeAnalysisEngine.js";
import { GitClient } from "./GitClient.js";
import type { GitRunner } from "./GitClient.js";
import { QualityGateSystem } from "./QualityGateSystem.js";
import type { CommandRunner, QualityCheckInput } from "./QualityGateSystem.js";
import { ReleasePlanningEngine } from "./ReleasePlanningEngine.js";
import type { PlanOptions } from "./ReleasePlanningEngine.js";
import { VersionRecommender } from "./VersionRecommender.js";
import type { SuggestOptions } from "./VersionRecommender.js";

export { GitClient, defaultGitRunner } from "./GitClient.js";
export type { GitClientOptions, GitCommandResult, GitRunner, GitRunnerOptions } from "./GitClient.js";
export { ChangeAnalysisEngine, extractExportedNames } from "./ChangeAnalysisEngine.js";
export type { ChangeAnalysisEngineOptions } from "./ChangeAnalysisEngine.js";
export { VersionRecommender } from "./VersionRecommender.js";
export type { SuggestOptions, VersionRecommenderOptions } from "./VersionRecommender.js";
export { ReleasePlanningEngine } from "./ReleasePlanningEngine.js";
export type { PlanOptions, ReleasePlanningEngineOptions } from "./ReleasePlanningEngine.js";
export { QualityGateSystem, defaultCommandRunner } from "./QualityGateSystem.js";
export type {
  CommandResult,
  CommandRunner,
  QualityCheckInput,
  QualityGateSystemOptions,
  TestCommand,
} from "./QualityGateSystem.js";
export { parseConventionalSubject, hasBreakingFooter } from "./conventional.js";
export type { ParsedConventionalSubject } from "./conventional.js";
export {
  SECURITY_RULES,
  scanFileForFindings,
  isTestFile,
  dampenSeverity,
} from "./securityRules.js";
export type { SecurityRule, SecuritySeverity } from "./securityRules.js";

/** Options for the system-level `suggest` call. */
export interface SystemSuggestOptions extends SuggestOptions {
  /** Release channel whose current version is the bump base (default `"stable"`). */
  channel?: string;
  /** Explicit current version (wins over the channel lookup). */
  currentVersion?: string;
}

/** Options for {@link createVersioningSystem}. */
export interface VersioningSystemOptions {
  /** Repository / project root. */
  cwd: string;
  /** Logger for diagnostics. */
  logger: Logger;
  /** Optional LLM provider (changelog polish). The system works without it. */
  provider?: ILLMProvider;
  /** Optional resolved config; defaults to `DEFAULT_CONFIG`'s versioning section. */
  config?: UltraCodeConfig;
  /** Injectable git runner (tests). */
  gitRunner?: GitRunner;
  /** Injectable command runner for the quality gates (tests). */
  commandRunner?: CommandRunner;
  /** Clock override for deterministic changelog dates (tests). */
  now?: () => Date;
}

/** The wired-up AI versioning system facade. */
export interface VersioningSystem {
  /** Underlying change analysis engine. */
  readonly analyzer: ChangeAnalysisEngine;
  /** Underlying version recommender. */
  readonly recommender: VersionRecommender;
  /** Underlying release planning engine. */
  readonly planner: ReleasePlanningEngine;
  /** Underlying quality gate system. */
  readonly qualityGates: QualityGateSystem;
  /** Analyses a revision range (default: last tag → `HEAD`). */
  analyze(range?: string): Promise<ChangeAnalysis>;
  /** Analyses and recommends the next version. */
  suggest(range?: string, options?: SystemSuggestOptions): Promise<VersionSuggestion>;
  /** Plans a release for `version` (defaults to the suggested next version). */
  plan(version?: string, options?: PlanOptions): Promise<ReleasePlan>;
  /** Runs the quality gates (analysis is computed internally when possible). */
  quality(input?: QualityCheckInput): Promise<QualityReport>;
}

/**
 * Creates the AI versioning system for a repository.
 *
 * Factory contract:
 * `createVersioningSystem(opts: { cwd, logger, provider?, config? }): VersioningSystem`
 * with `analyze(range?)`, `suggest(range?)`, `plan(version?)` and `quality()`.
 */
export function createVersioningSystem(options: VersioningSystemOptions): VersioningSystem {
  const { cwd, logger, provider, config } = options;
  const versioningConfig: VersioningConfig = config?.versioning ?? DEFAULT_CONFIG.versioning;

  const git = new GitClient({
    cwd,
    logger,
    ...(options.gitRunner !== undefined ? { runner: options.gitRunner } : {}),
  });
  const analyzer = new ChangeAnalysisEngine({ cwd, logger, git });
  const recommender = new VersionRecommender({ config: versioningConfig, logger });
  const planner = new ReleasePlanningEngine({
    logger,
    ...(provider !== undefined ? { provider } : {}),
    ...(config !== undefined ? { config } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  const qualityGates = new QualityGateSystem({
    cwd,
    logger,
    config: versioningConfig,
    ...(options.commandRunner !== undefined ? { runner: options.commandRunner } : {}),
  });

  const analyze = (range?: string): Promise<ChangeAnalysis> => analyzer.analyze(range);

  const suggest = async (
    range?: string,
    suggestOptions: SystemSuggestOptions = {},
  ): Promise<VersionSuggestion> => {
    const analysis = await analyze(range);
    const currentVersion =
      suggestOptions.currentVersion ??
      recommender.resolveChannelVersion(suggestOptions.channel ?? "stable");
    const opts: SuggestOptions =
      suggestOptions.prerelease !== undefined ? { prerelease: suggestOptions.prerelease } : {};
    return recommender.suggest(analysis, currentVersion, opts);
  };

  const plan = async (version?: string, planOptions: PlanOptions = {}): Promise<ReleasePlan> => {
    const analysis = await analyze();
    let target = version;
    if (target === undefined || target === "") {
      const suggestion = recommender.suggest(
        analysis,
        recommender.resolveChannelVersion("stable"),
      );
      target = suggestion.suggestedVersion;
    }
    return planner.plan(target, analysis, planOptions);
  };

  const quality = async (input: QualityCheckInput = {}): Promise<QualityReport> => {
    let analysis = input.analysis;
    if (analysis === undefined) {
      try {
        analysis = await analyze();
      } catch (err) {
        logger.warn("versioning: change analysis unavailable for quality gates", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return qualityGates.check({
      ...input,
      ...(analysis !== undefined ? { analysis } : {}),
    });
  };

  return { analyzer, recommender, planner, qualityGates, analyze, suggest, plan, quality };
}
