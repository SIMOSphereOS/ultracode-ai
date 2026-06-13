/**
 * Core-local contracts for the Skill-/Agent-Creator (Modul B).
 *
 * These types are intentionally defined *here* in `core` rather than in the
 * frozen `ultracode-shared` 1.0 contract layer: the authoring subsystem is
 * new and may still evolve. Cross-module dependencies (budget gate, LLM
 * provider) are consumed through narrow, constructor-injected interfaces so
 * that sibling modules (budget = Modul A, learning = Modul C) never need to be
 * imported directly.
 */

import type { AgentDefinition } from "ultracode-shared";

/* ------------------------------------------------------------------------- *
 * Skill model
 * ------------------------------------------------------------------------- */

/** Lifecycle status of a skill. */
export type SkillStatus = "draft" | "active" | "deprecated";

/**
 * The parsed YAML-ish frontmatter block at the top of a skill markdown file.
 *
 * Every field is mandatory in a *well-formed* skill; the registry tolerates
 * partially-corrupt files by skipping them (see {@link SkillRegistry.load}).
 */
export interface SkillFrontmatter {
  /** Unique, file-safe skill name (e.g. `"dora-compliance"`). */
  name: string;
  /** One-line, human-readable description used for routing/triggering. */
  description: string;
  /** Semantic version of the skill (e.g. `"1.2.0"`). */
  version: string;
  /** Catalog/namespace the skill belongs to (e.g. `"compliance"`). */
  catalog: string;
  /** Natural-language trigger phrases; MUST be non-empty for a valid skill. */
  triggers: string[];
  /** Names of tools the skill expects to be available (optional). */
  tools?: string[];
  /** Source URLs/identifiers the skill's knowledge was derived from. */
  sources: string[];
  /** Lifecycle status. */
  status: SkillStatus;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/** A fully-realised skill: frontmatter plus its markdown body. */
export interface Skill extends SkillFrontmatter {
  /** Markdown body (everything after the frontmatter block). */
  body: string;
}

/* ------------------------------------------------------------------------- *
 * Knowledge input
 * ------------------------------------------------------------------------- */

/**
 * Distilled knowledge handed to the author to scaffold or upgrade a skill.
 * Typically produced by the learning module (Modul C) but deliberately
 * decoupled from it.
 */
export interface KnowledgeMaterial {
  /** Target catalog/namespace. */
  catalog: string;
  /** Topic the material covers (drives the default skill name). */
  topic: string;
  /** Short prose summary of the topic. */
  summary: string;
  /** Discrete factual statements extracted from the sources. */
  facts: string[];
  /** Illustrative code snippets (already fenced bodies, no backticks). */
  codeSnippets: string[];
  /** Source URLs/identifiers the material was derived from. */
  sources: string[];
}

/* ------------------------------------------------------------------------- *
 * Proposals & testing
 * ------------------------------------------------------------------------- */

/** Whether a proposal creates a skill or an agent. */
export type AuthoringKind = "skill" | "agent";

/**
 * A reviewable proposal. Nothing is persisted until {@link ISkillAuthor.persist}
 * is called with `{ approved: true }`.
 */
export interface AuthoringProposal {
  /** What this proposal would create/modify. */
  kind: AuthoringKind;
  /** Name of the skill/agent. */
  name: string;
  /** Present when `kind === "skill"`. */
  skill?: Skill;
  /** Present when `kind === "agent"`. */
  agent?: AgentDefinition;
  /** Why the author produced this proposal. */
  rationale: string;
  /**
   * Human-readable diff vs. an existing same-named artefact, when this is an
   * upgrade rather than a fresh creation.
   */
  diffFromExisting?: string;
}

/** Result of a single offline check performed by {@link ISkillAuthor.test}. */
export interface TestCheck {
  /** Stable check name (e.g. `"frontmatter-complete"`). */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Human-readable detail / failure reason. */
  detail: string;
}

/** Aggregate result of validating a proposal offline. */
export interface TestResult {
  /** `true` iff every check passed. */
  passed: boolean;
  /** Individual check outcomes. */
  checks: TestCheck[];
}

/* ------------------------------------------------------------------------- *
 * Injected dependencies (narrow, cross-module-safe)
 * ------------------------------------------------------------------------- */

/** Per-model spend line in a cost estimate. */
export interface ModelSpend {
  /** Model identifier. */
  model: string;
  /** Estimated input tokens. */
  tokensIn: number;
  /** Estimated output tokens. */
  tokensOut: number;
  /** Estimated USD cost. */
  usd: number;
}

/** A cost estimate produced by the budget module (Modul A). */
export interface CostEstimate {
  /** Optional page count the estimate covers. */
  pages?: number;
  /** Total estimated input tokens. */
  tokensIn: number;
  /** Total estimated output tokens. */
  tokensOut: number;
  /** Per-model breakdown. */
  byModel: ModelSpend[];
  /** Low-bound USD estimate. */
  usdLow: number;
  /** High-bound USD estimate. */
  usdHigh: number;
  /** EUR equivalent. */
  eur: number;
  /** USD→EUR FX rate used. */
  fxRate: number;
  /** Human-readable assumptions that fed the estimate (Module A returns a list). */
  assumptions: string[];
}

/** A budget gate's decision about whether spend is allowed. */
export interface BudgetDecision {
  /** Whether the spend is allowed at all. */
  allowed: boolean;
  /** Whether human approval is required before proceeding. */
  requiresApproval: boolean;
  /** Remaining USD budget. */
  remainingUsd: number;
  /** Hard cap in USD, or `null` when uncapped. */
  capUsd: number | null;
  /** Human-readable reason for the decision. */
  reason: string;
}

/** Input shape accepted by {@link IBudgetGate.estimate}. */
export interface EstimateInput {
  /** Budget category (e.g. `"development"`, `"learning"`). */
  category: string;
  /** Optional page count. */
  pages?: number;
  /** Per-item input-token assumption. */
  perItemTokensIn?: number;
  /** Per-item output-token assumption. */
  perItemTokensOut?: number;
  /** Model routing split. */
  routing?: Array<{ model: string; share: number }>;
  /** Batch size. */
  batch?: number;
  /** Safety multiplier. */
  safetyFactor?: number;
  /** Raw texts to estimate from. */
  texts?: string[];
}

/**
 * The narrow slice of the budget planner (Modul A) the author depends on.
 * Injected via the constructor — the author never imports the budget module.
 */
export interface IBudgetGate {
  /** Estimate the cost of an operation. */
  estimate(input: EstimateInput): CostEstimate;
  /** Decide whether the estimated spend is allowed for a category. */
  check(estimate: CostEstimate, category: string): BudgetDecision;
  /** Record actual/estimated spend in the ledger. */
  record(entry: {
    ts: string;
    category: string;
    model?: string;
    estimatedUsd: number;
    actualUsd: number;
    note?: string;
  }): Promise<void>;
  /** Render a human-readable report of an estimate + decision. */
  formatReport(estimate: CostEstimate, decision: BudgetDecision): string;
}

/* ------------------------------------------------------------------------- *
 * Author interface
 * ------------------------------------------------------------------------- */

/**
 * The implementable authoring interface.
 *
 * Implementations are deterministic by default. LLM refinement is applied
 * *only* when both a provider and a budget gate are supplied **and** the
 * budget check permits the spend; otherwise a heuristic fallback is used.
 */
export interface ISkillAuthor {
  /**
   * Scaffold a new skill from knowledge material, or — when a same-named skill
   * already exists — produce an upgrade proposal with a diff and a SemVer bump.
   */
  createOrUpgradeSkill(material: KnowledgeMaterial): Promise<AuthoringProposal>;
  /** Persist a proposal. Writes only when `approved === true`. */
  persist(proposal: AuthoringProposal, opts: { approved: boolean }): Promise<void>;
  /** Validate a proposal entirely offline. */
  test(proposal: AuthoringProposal): Promise<TestResult>;
}
