/**
 * `@ultracode/core/authoring` — the Skill-/Agent-Creator (Modul B).
 *
 * Public surface:
 * - {@link Authoring} / {@link createAuthoring} — the authoring engine and its
 *   factory; implements {@link ISkillAuthor} plus `createOrEvolveAgent` and
 *   `scoreSkill`.
 * - {@link SkillRegistry} — markdown-with-frontmatter skill store under
 *   `~/.ultracode/skills/<catalog>/<name>.md`.
 * - The {@link parseFrontmatter}/{@link serializeFrontmatter} helpers.
 * - Safety primitives ({@link findForbiddenPhrases}, {@link checkNoEscalation},
 *   {@link clampToAllowed}).
 * - The core-local {@link AuthoringError} and the `skill.*`/`agent.created`
 *   events.
 * - All public types/contracts.
 */

export { Authoring, createAuthoring, DEFAULT_ALLOWED_TOOLS } from "./Authoring.js";
export type { AuthoringOptions, Clock } from "./Authoring.js";

export { SkillRegistry } from "./SkillRegistry.js";

export {
  createSkillInjector,
  DEFAULT_MAX_SKILLS,
  DEFAULT_MAX_CHARS as SKILL_INJECTOR_DEFAULT_MAX_CHARS,
  SKILL_CONTEXT_HEADER,
} from "./SkillInjector.js";
export type { SkillInjectorOptions } from "./SkillInjector.js";

export {
  parseFrontmatter,
  serializeFrontmatter,
  splitDocument,
} from "./frontmatter.js";

export {
  findForbiddenPhrases,
  checkNoEscalation,
  clampToAllowed,
  FORBIDDEN_PHRASES,
} from "./safety.js";
export type { PermissionCheck } from "./safety.js";

export { skillSchema, agentSchema } from "./schema.js";

export {
  AGENTS_DIR,
  AUDIT_FILENAME,
  AUTHORING_CATEGORY,
  AUTHORING_DIR,
  CLIP_MIN_BUDGET_FRACTION,
  DEFAULT_MODEL,
  FALLBACK_SKILL_VERSION,
  HEURISTIC_DESCRIPTION_MAX_LENGTH,
  INFER_TOOLS_BASE,
  INITIAL_SKILL_VERSION,
  SAFE_SEGMENT,
  SCORE_BODY_MAX,
  SCORE_BODY_TARGET_LENGTH,
  SCORE_DESCRIPTION_MAX,
  SCORE_DESCRIPTION_TARGET_LENGTH,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_SOURCES_MAX,
  SCORE_SOURCES_TARGET,
  SCORE_STATUS_ACTIVE,
  SCORE_STATUS_DEPRECATED,
  SCORE_STATUS_DRAFT,
  SCORE_TRIGGERS_MAX,
  SCORE_TRIGGERS_TARGET,
  SKILL_UPGRADE_RELEASE,
  SKILLS_ROOT,
  SLUG_MAX_LENGTH,
  STOPWORDS,
  UNKNOWN_FROM_VERSION,
} from "./defaults.js";

export { AuthoringError } from "./errors.js";

export {
  emitAuthoringEvent,
  SKILL_CREATED_EVENT,
  SKILL_UPDATED_EVENT,
  AGENT_CREATED_EVENT,
} from "./events.js";
export type {
  AuthoringEvent,
  SkillCreatedEvent,
  SkillUpdatedEvent,
  AgentCreatedEvent,
} from "./events.js";

export type {
  Skill,
  SkillFrontmatter,
  SkillStatus,
  KnowledgeMaterial,
  AuthoringProposal,
  AuthoringKind,
  TestResult,
  TestCheck,
  ISkillAuthor,
  IBudgetGate,
  CostEstimate,
  ModelSpend,
  BudgetDecision,
  EstimateInput,
} from "./types.js";
