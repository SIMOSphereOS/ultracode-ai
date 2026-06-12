/**
 * Skill-/Agent-Creator (Modul B).
 *
 * Turns distilled {@link KnowledgeMaterial} into reviewable
 * {@link AuthoringProposal}s for skills and agents, validates them entirely
 * offline, and persists them only after explicit approval.
 *
 * ## Determinism & LLM refinement
 *
 * Scaffolding is **deterministic**: the same material always yields the same
 * proposal. An LLM is consulted to *refine* the description and triggers **only
 * when** a `provider` and a `budget` gate are both injected **and** the budget
 * check permits the spend. Otherwise a heuristic fallback is used. The provider
 * is best-effort: any failure (throw, malformed output, empty text) silently
 * falls back to the deterministic result — generation never breaks on the LLM.
 *
 * ## Safety
 *
 * Generated agents never escalate tool permissions: `enabledTools` is clamped
 * to an allow-listed universe at construction time, and {@link Authoring.test}
 * additionally rejects any proposal whose text contains forbidden/harmful
 * phrases or whose agent escapes the allowed tool set.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { inc, valid, clean } from "semver";
import type { ReleaseType } from "semver";
import { NoopLogger, serializeError } from "@ultracode/shared";
import type {
  AgentDefinition,
  IEventBus,
  ILLMProvider,
  Logger,
} from "@ultracode/shared";

import { resolveHome } from "../config/paths.js";
import { stringify as stringifyToml } from "smol-toml";

import { AuthoringError } from "./errors.js";
import {
  emitAuthoringEvent,
  SKILL_CREATED_EVENT,
  SKILL_UPDATED_EVENT,
  AGENT_CREATED_EVENT,
} from "./events.js";
import { agentSchema, skillSchema } from "./schema.js";
import { SkillRegistry } from "./SkillRegistry.js";
import { checkNoEscalation, clampToAllowed, findForbiddenPhrases } from "./safety.js";
import type {
  AuthoringProposal,
  CostEstimate,
  IBudgetGate,
  ISkillAuthor,
  KnowledgeMaterial,
  Skill,
  TestCheck,
  TestResult,
} from "./types.js";

/** A clock, injectable for deterministic tests. */
export type Clock = () => Date;

/** The default universe of tools an authored agent may be granted. */
export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  "read",
  "grep",
  "glob",
  "write",
  "edit",
  "bash",
  "git_status",
  "git_diff",
  "git_log",
];

/** Budget category authored work is charged to. */
const AUTHORING_CATEGORY = "development";

/** Options for {@link createAuthoring}. */
export interface AuthoringOptions {
  /** Logger (defaults to a no-op). */
  logger?: Logger;
  /** Optional event bus for `skill.*`/`agent.created` events. */
  events?: IEventBus;
  /** Optional LLM provider for refinement (deterministic fallback otherwise). */
  provider?: ILLMProvider;
  /** Optional budget gate; LLM refinement requires it to permit the spend. */
  budget?: IBudgetGate;
  /** Home-directory override (defaults to `os.homedir()`). */
  homeDir?: string;
  /** Clock override for deterministic timestamps. */
  now?: Clock;
  /** Model used for refinement requests. */
  model?: string;
  /** Allowed tool universe for authored agents. */
  allowedTools?: readonly string[];
}

/** Factory mirroring the other core modules' `create…` convention. */
export function createAuthoring(opts: AuthoringOptions = {}): Authoring {
  return new Authoring(opts);
}

/**
 * Concrete authoring implementation. See the module doc for the determinism,
 * LLM-refinement and safety guarantees.
 */
export class Authoring implements ISkillAuthor {
  private readonly logger: Logger;
  private readonly events?: IEventBus;
  private readonly provider?: ILLMProvider;
  private readonly budget?: IBudgetGate;
  private readonly homeDir: string;
  private readonly now: Clock;
  private readonly model: string;
  private readonly allowedTools: readonly string[];
  /** Public so callers can list/inspect skills via the same store. */
  public readonly registry: SkillRegistry;

  constructor(opts: AuthoringOptions = {}) {
    this.logger = opts.logger ?? new NoopLogger();
    this.events = opts.events;
    this.provider = opts.provider;
    this.budget = opts.budget;
    this.homeDir = opts.homeDir ?? os.homedir();
    this.now = opts.now ?? (() => new Date());
    this.model = opts.model ?? "local";
    this.allowedTools = opts.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    this.registry = new SkillRegistry(this.homeDir, this.logger);
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private iso(): string {
    return this.now().toISOString();
  }

  /* --------------------------------------------------------------------- *
   * Skills
   * --------------------------------------------------------------------- */

  /** {@inheritDoc ISkillAuthor.createOrUpgradeSkill} */
  public async createOrUpgradeSkill(material: KnowledgeMaterial): Promise<AuthoringProposal> {
    validateMaterial(material);
    const name = slugify(material.topic);
    const existing = await this.registry.get(name).catch(() => null);

    const refined = await this.refine(material);
    const ts = this.iso();
    const body = buildSkillBody(material);

    if (existing) {
      const version = bumpVersion(existing.version, "minor");
      const skill: Skill = {
        name: existing.name,
        description: refined.description,
        version,
        catalog: material.catalog,
        triggers: refined.triggers,
        sources: dedupe([...existing.sources, ...material.sources]),
        status: existing.status === "deprecated" ? "draft" : existing.status,
        createdAt: existing.createdAt,
        updatedAt: ts,
        body,
      };
      if (existing.tools) skill.tools = existing.tools;
      return {
        kind: "skill",
        name: skill.name,
        skill,
        rationale: `Upgrade existing skill "${name}" with refreshed knowledge on "${material.topic}".`,
        diffFromExisting: diffSkills(existing, skill),
      };
    }

    const skill: Skill = {
      name,
      description: refined.description,
      version: "1.0.0",
      catalog: material.catalog,
      triggers: refined.triggers,
      sources: dedupe(material.sources),
      status: "draft",
      createdAt: ts,
      updatedAt: ts,
      body,
    };
    return {
      kind: "skill",
      name,
      skill,
      rationale: `Create new skill "${name}" from knowledge on "${material.topic}".`,
    };
  }

  /* --------------------------------------------------------------------- *
   * Agents
   * --------------------------------------------------------------------- */

  /**
   * Propose a new agent (or an evolution of an existing definition) derived
   * from knowledge material. The agent's `enabledTools` is clamped to the
   * allowed universe so it can never escalate permissions.
   *
   * @param material - Knowledge to base the agent on.
   * @param base - Optional existing agent definition to evolve.
   */
  public async createOrEvolveAgent(
    material: KnowledgeMaterial,
    base?: AgentDefinition,
  ): Promise<AuthoringProposal> {
    validateMaterial(material);
    const name = base?.name ?? slugify(`${material.topic}-agent`);
    const refined = await this.refine(material);

    // Desired tools are inferred from the material's snippets but ALWAYS
    // clamped to the allowed universe — no escalation, by construction.
    const desired = base?.enabledTools ?? inferTools(material);
    const enabledTools = clampToAllowed(desired, this.allowedTools);

    const agent: AgentDefinition = {
      name,
      description: refined.description,
      type: base?.type ?? "specialized",
      systemPromptId: base?.systemPromptId,
      enabledTools: enabledTools.length > 0 ? enabledTools : undefined,
    };
    if (base?.model) agent.model = base.model;
    if (base?.provider) agent.provider = base.provider;
    if (base?.disabledTools) agent.disabledTools = base.disabledTools;

    const proposal: AuthoringProposal = {
      kind: "agent",
      name,
      agent,
      rationale: base
        ? `Evolve agent "${name}" with refreshed knowledge on "${material.topic}".`
        : `Create new specialized agent "${name}" for "${material.topic}".`,
    };
    if (base) proposal.diffFromExisting = diffAgents(base, agent);
    return proposal;
  }

  /* --------------------------------------------------------------------- *
   * Persist
   * --------------------------------------------------------------------- */

  /** {@inheritDoc ISkillAuthor.persist} */
  public async persist(
    proposal: AuthoringProposal,
    opts: { approved: boolean },
  ): Promise<void> {
    if (!opts.approved) {
      this.logger.info("authoring.persist.skipped-unapproved", {
        kind: proposal.kind,
        name: proposal.name,
      });
      return;
    }

    // Re-run safety gating before any write — defence in depth.
    const test = await this.test(proposal);
    if (!test.passed) {
      throw new AuthoringError("Refusing to persist a proposal that fails validation", {
        details: { name: proposal.name, checks: test.checks.filter((c) => !c.passed) },
      });
    }

    if (proposal.kind === "skill") {
      const skill = proposal.skill;
      if (!skill) throw new AuthoringError("Skill proposal missing `skill`");
      const existed = (await this.registry.get(skill.name).catch(() => null)) !== null;
      await this.registry.save(skill);
      await this.appendAudit({
        ts: this.iso(),
        kind: "skill",
        name: skill.name,
        version: skill.version,
        action: existed ? "updated" : "created",
      });
      if (existed) {
        emitAuthoringEvent(
          {
            type: SKILL_UPDATED_EVENT,
            name: skill.name,
            catalog: skill.catalog,
            fromVersion: proposal.diffFromExisting ? extractFromVersion(proposal) : skill.version,
            toVersion: skill.version,
          },
          this.events,
          this.logger,
        );
      } else {
        emitAuthoringEvent(
          {
            type: SKILL_CREATED_EVENT,
            name: skill.name,
            catalog: skill.catalog,
            version: skill.version,
          },
          this.events,
          this.logger,
        );
      }
      return;
    }

    const agent = proposal.agent;
    if (!agent) throw new AuthoringError("Agent proposal missing `agent`");
    await this.saveAgent(agent);
    await this.appendAudit({
      ts: this.iso(),
      kind: "agent",
      name: agent.name,
      action: "created",
    });
    emitAuthoringEvent({ type: AGENT_CREATED_EVENT, name: agent.name }, this.events, this.logger);
  }

  /* --------------------------------------------------------------------- *
   * Test
   * --------------------------------------------------------------------- */

  /** {@inheritDoc ISkillAuthor.test} */
  public async test(proposal: AuthoringProposal): Promise<TestResult> {
    const checks: TestCheck[] = [];

    if (proposal.kind === "skill") {
      this.testSkill(proposal, checks);
    } else {
      this.testAgent(proposal, checks);
    }

    return { passed: checks.every((c) => c.passed), checks };
  }

  /** Offline checks for a skill proposal. */
  private testSkill(proposal: AuthoringProposal, checks: TestCheck[]): void {
    const skill = proposal.skill;
    const parsed = skillSchema.safeParse(skill);
    checks.push({
      name: "schema-valid",
      passed: parsed.success,
      detail: parsed.success ? "skill matches schema" : formatZod(parsed.error),
    });
    if (!skill) return;

    checks.push({
      name: "frontmatter-complete",
      passed:
        skill.name.length > 0 &&
        skill.description.length > 0 &&
        skill.version.length > 0 &&
        skill.catalog.length > 0 &&
        skill.createdAt.length > 0 &&
        skill.updatedAt.length > 0,
      detail: "all required frontmatter fields present",
    });
    checks.push({
      name: "triggers-nonempty",
      passed: Array.isArray(skill.triggers) && skill.triggers.length > 0,
      detail: `${skill.triggers?.length ?? 0} trigger(s)`,
    });
    checks.push({
      name: "version-semver",
      passed: valid(skill.version) !== null,
      detail: `version "${skill.version}"`,
    });

    const haystack = `${skill.description}\n${skill.body}\n${skill.triggers.join("\n")}`;
    const forbidden = findForbiddenPhrases(haystack);
    checks.push({
      name: "no-harmful-instructions",
      passed: forbidden.length === 0,
      detail: forbidden.length === 0 ? "clean" : `forbidden: ${forbidden.join(", ")}`,
    });
  }

  /** Offline checks for an agent proposal. */
  private testAgent(proposal: AuthoringProposal, checks: TestCheck[]): void {
    const agent = proposal.agent;
    const parsed = agentSchema.safeParse(agent);
    checks.push({
      name: "schema-valid",
      passed: parsed.success,
      detail: parsed.success ? "agent matches schema" : formatZod(parsed.error),
    });
    if (!agent) return;

    const esc = checkNoEscalation(agent, this.allowedTools);
    checks.push({
      name: "no-permission-escalation",
      passed: esc.ok,
      detail: esc.ok ? "within allowed tool set" : `escalated: ${esc.escalated.join(", ")}`,
    });

    const haystack = `${agent.description}\n${agent.systemPromptId ?? ""}\n${(agent.enabledTools ?? []).join(
      "\n",
    )}`;
    const forbidden = findForbiddenPhrases(haystack);
    checks.push({
      name: "no-harmful-instructions",
      passed: forbidden.length === 0,
      detail: forbidden.length === 0 ? "clean" : `forbidden: ${forbidden.join(", ")}`,
    });
  }

  /* --------------------------------------------------------------------- *
   * Scoring
   * --------------------------------------------------------------------- */

  /**
   * Heuristic quality score for a skill, `0`–`100`. Rewards a rich
   * description, multiple triggers, cited sources, an active status and a
   * substantial body; penalises forbidden phrases (forces a `0`).
   *
   * @param skill - The skill to score.
   */
  public scoreSkill(skill: Skill): number {
    if (!skill || typeof skill !== "object") return 0;
    const haystack = `${skill.description ?? ""}\n${skill.body ?? ""}`;
    if (findForbiddenPhrases(haystack).length > 0) return 0;

    let score = 0;
    // Description quality (up to 25): length-gated, capped.
    const descLen = (skill.description ?? "").trim().length;
    score += clampScore((descLen / 80) * 25, 0, 25);
    // Triggers (up to 25): 0 → 0, ≥4 → full.
    const triggers = Array.isArray(skill.triggers) ? skill.triggers.length : 0;
    score += clampScore((triggers / 4) * 25, 0, 25);
    // Sources (up to 20): ≥3 → full.
    const sources = Array.isArray(skill.sources) ? skill.sources.length : 0;
    score += clampScore((sources / 3) * 20, 0, 20);
    // Body substance (up to 20): ≥600 chars → full.
    const bodyLen = (skill.body ?? "").trim().length;
    score += clampScore((bodyLen / 600) * 20, 0, 20);
    // Status (up to 10): active=10, draft=5, deprecated=0.
    score += skill.status === "active" ? 10 : skill.status === "draft" ? 5 : 0;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /* --------------------------------------------------------------------- *
   * LLM refinement (best-effort, budget-gated)
   * --------------------------------------------------------------------- */

  /**
   * Refine description + triggers via the LLM when permitted; otherwise return
   * a deterministic heuristic. Never throws — any failure falls back.
   */
  private async refine(
    material: KnowledgeMaterial,
  ): Promise<{ description: string; triggers: string[] }> {
    const fallback = heuristicRefine(material);
    if (!this.provider || !this.budget) return fallback;

    // Budget gate: estimate then check. Refuse → heuristic fallback.
    let estimate: CostEstimate;
    try {
      estimate = this.budget.estimate({
        category: AUTHORING_CATEGORY,
        texts: [material.summary, ...material.facts],
        batch: 1,
      });
      const decision = this.budget.check(estimate, AUTHORING_CATEGORY);
      if (!decision.allowed || decision.requiresApproval) {
        this.logger.info("authoring.refine.budget-declined", { reason: decision.reason });
        return fallback;
      }
    } catch (err) {
      this.logger.warn("authoring.refine.budget-error", { error: serializeError(err) });
      return fallback;
    }

    try {
      const result = await this.provider.complete({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You refine skill metadata. Reply with strict JSON: " +
              '{"description": string, "triggers": string[]}. No prose, no code fences.',
          },
          {
            role: "user",
            content: `Topic: ${material.topic}\nSummary: ${material.summary}\nFacts:\n${material.facts.join(
              "\n",
            )}`,
          },
        ],
      });
      const parsed = parseRefinement(result.text);
      if (!parsed) return fallback;

      // Even refined text is safety-screened; harmful → fallback.
      const screen = `${parsed.description}\n${parsed.triggers.join("\n")}`;
      if (findForbiddenPhrases(screen).length > 0) {
        this.logger.warn("authoring.refine.harmful-output-rejected", {});
        return fallback;
      }

      // Record the (best-effort) spend.
      await this.budget
        .record({
          ts: this.iso(),
          category: AUTHORING_CATEGORY,
          model: this.model,
          estimatedUsd: estimate.usdHigh,
          actualUsd: estimate.usdHigh,
          note: `refine:${material.topic}`,
        })
        .catch((err) => {
          this.logger.warn("authoring.refine.record-failed", { error: serializeError(err) });
        });

      return {
        description: parsed.description.trim() || fallback.description,
        triggers: parsed.triggers.length > 0 ? dedupe(parsed.triggers) : fallback.triggers,
      };
    } catch (err) {
      this.logger.warn("authoring.refine.provider-error", { error: serializeError(err) });
      return fallback;
    }
  }

  /* --------------------------------------------------------------------- *
   * Persistence helpers
   * --------------------------------------------------------------------- */

  /** Write an agent definition to `~/.ultracode/agents/<name>.toml`. */
  private async saveAgent(agent: AgentDefinition): Promise<void> {
    const dir = resolveHome("~/.ultracode/agents", this.homeDir);
    const file = path.join(dir, `${safeFile(agent.name)}.toml`);
    const data = stringifyToml(pruneUndefined(agent) as Record<string, unknown>);
    await atomicWrite(file, data);
  }

  /** Append a JSONL audit line to `~/.ultracode/authoring/audit.jsonl`. */
  private async appendAudit(entry: Record<string, unknown>): Promise<void> {
    const dir = resolveHome("~/.ultracode/authoring", this.homeDir);
    const file = path.join(dir, "audit.jsonl");
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (err) {
      // Audit is best-effort; surface as a warning, never block the write.
      this.logger.warn("authoring.audit.append-failed", { error: serializeError(err) });
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Pure helpers
 * ------------------------------------------------------------------------- */

/** Validate incoming knowledge material; throws on structurally bad input. */
function validateMaterial(material: KnowledgeMaterial): void {
  if (!material || typeof material !== "object") {
    throw new AuthoringError("KnowledgeMaterial must be an object");
  }
  if (typeof material.topic !== "string" || material.topic.trim().length === 0) {
    throw new AuthoringError("KnowledgeMaterial.topic is required");
  }
  if (typeof material.catalog !== "string" || material.catalog.trim().length === 0) {
    throw new AuthoringError("KnowledgeMaterial.catalog is required");
  }
}

/** Deterministic description + triggers from material (no LLM). */
function heuristicRefine(material: KnowledgeMaterial): {
  description: string;
  triggers: string[];
} {
  const summary = (material.summary ?? "").trim();
  const description =
    summary.length > 0
      ? truncateSentence(summary, 160)
      : `Knowledge skill covering ${material.topic}.`;

  const triggers = dedupe([
    material.topic.trim(),
    ...keywordsFrom(material.topic),
    ...keywordsFrom(summary).slice(0, 3),
  ]).filter((t) => t.length > 0);

  // Always guarantee at least one trigger (the topic).
  if (triggers.length === 0) triggers.push(material.topic.trim() || "topic");
  return { description, triggers };
}

/** Build the markdown body of a skill from material. */
function buildSkillBody(material: KnowledgeMaterial): string {
  const lines: string[] = [];
  lines.push(`# ${material.topic}`, "");
  if (material.summary.trim()) lines.push(material.summary.trim(), "");
  if (material.facts.length > 0) {
    lines.push("## Key facts", "");
    for (const f of material.facts) lines.push(`- ${f}`);
    lines.push("");
  }
  if (material.codeSnippets.length > 0) {
    lines.push("## Examples", "");
    for (const snippet of material.codeSnippets) {
      lines.push("```", snippet, "```", "");
    }
  }
  if (material.sources.length > 0) {
    lines.push("## Sources", "");
    for (const s of material.sources) lines.push(`- ${s}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Infer a (pre-clamp) tool wishlist from code snippets. */
function inferTools(material: KnowledgeMaterial): string[] {
  const text = material.codeSnippets.join("\n").toLowerCase();
  const tools = new Set<string>(["read", "grep"]);
  if (/\bgit\b/.test(text)) tools.add("git_status");
  if (/write|create file|fs\.write/.test(text)) tools.add("write");
  if (/edit|replace|patch/.test(text)) tools.add("edit");
  if (/\bbash\b|shell|command/.test(text)) tools.add("bash");
  return [...tools];
}

/** Bump a SemVer string; falls back to a sane default on invalid input. */
function bumpVersion(version: string, release: ReleaseType): string {
  const cleaned = clean(version) ?? (valid(version) ? version : null);
  if (cleaned === null) return "1.0.0";
  const next = inc(cleaned, release);
  return next ?? cleaned;
}

/** Human-readable diff between two skills. */
function diffSkills(prev: Skill, next: Skill): string {
  const parts: string[] = [];
  if (prev.version !== next.version) parts.push(`version: ${prev.version} → ${next.version}`);
  if (prev.description !== next.description) {
    parts.push(`description: "${prev.description}" → "${next.description}"`);
  }
  const addedTriggers = next.triggers.filter((t) => !prev.triggers.includes(t));
  if (addedTriggers.length > 0) parts.push(`+triggers: ${addedTriggers.join(", ")}`);
  const addedSources = next.sources.filter((s) => !prev.sources.includes(s));
  if (addedSources.length > 0) parts.push(`+sources: ${addedSources.length}`);
  parts.push("body: regenerated from latest material");
  return parts.join("\n");
}

/** Human-readable diff between two agent definitions. */
function diffAgents(prev: AgentDefinition, next: AgentDefinition): string {
  const parts: string[] = [];
  if (prev.description !== next.description) {
    parts.push(`description: "${prev.description}" → "${next.description}"`);
  }
  const prevTools = new Set(prev.enabledTools ?? []);
  const nextTools = next.enabledTools ?? [];
  const added = nextTools.filter((t) => !prevTools.has(t));
  const removed = (prev.enabledTools ?? []).filter((t) => !nextTools.includes(t));
  if (added.length > 0) parts.push(`+tools: ${added.join(", ")}`);
  if (removed.length > 0) parts.push(`-tools: ${removed.join(", ")}`);
  return parts.length > 0 ? parts.join("\n") : "no material changes";
}

/** Best-effort recovery of the previous version for an upgrade event. */
function extractFromVersion(proposal: AuthoringProposal): string {
  const m = /version:\s*([0-9][^\s]*)\s*→/.exec(proposal.diffFromExisting ?? "");
  return m?.[1] ?? "0.0.0";
}

/** Try to parse a `{description, triggers}` JSON object from LLM text. */
function parseRefinement(
  text: string,
): { description: string; triggers: string[] } | null {
  if (typeof text !== "string") return null;
  // Tolerate accidental code fences / surrounding prose.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const description = typeof rec["description"] === "string" ? rec["description"] : "";
  const triggers = Array.isArray(rec["triggers"])
    ? rec["triggers"].filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];
  if (description.length === 0 && triggers.length === 0) return null;
  return { description, triggers };
}

/** Slugify a topic into a file-safe skill name. */
function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug.length > 0 ? slug : "skill";
}

/** Extract lower-cased keyword tokens from a string. */
function keywordsFrom(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z0-9]{3,}/g) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => !STOPWORDS.has(w));
}

/** A small stopword set so triggers are not noise. */
const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "into",
  "your",
  "they",
  "them",
  "have",
  "will",
  "shall",
  "about",
  "which",
  "when",
  "what",
  "skill",
  "knowledge",
]);

/** De-duplicate a string array, preserving first-seen order. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (!seen.has(it)) {
      seen.add(it);
      out.push(it);
    }
  }
  return out;
}

/** Truncate to `max` chars at a sentence/word boundary where possible. */
function truncateSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(" "));
  return `${(lastStop > 0 ? slice.slice(0, lastStop) : slice).trimEnd()}…`;
}

/** Clamp a numeric score contribution. */
function clampScore(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Format a zod error compactly. */
function formatZod(error: { issues: Array<{ path: Array<string | number>; message: string }> }): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Restrict a name to a safe filename. */
function safeFile(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe.length > 0 ? safe : "agent";
}

/** Recursively strip `undefined` (smol-toml rejects it). */
function pruneUndefined(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.filter((v) => v !== undefined).map((v) => pruneUndefined(v));
  }
  if (input === null || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = pruneUndefined(v);
  }
  return out;
}

/** Atomic UTF-8 write (temp + rename), creating parent dirs as needed. */
async function atomicWrite(file: string, data: string): Promise<void> {
  const dir = path.dirname(file);
  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.tmp`,
  );
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, data, "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw new AuthoringError(`Failed to write file: ${file}`, {
      cause: err,
      details: { file },
    });
  }
}
