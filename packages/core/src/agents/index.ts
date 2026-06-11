/**
 * Public surface of the agents module.
 */

export { BaseAgent } from "./BaseAgent.js";
export type { BaseAgentOptions, BaseAgentRunInput, ContextCollector } from "./BaseAgent.js";
export {
  AgentManager,
  createAgentManager,
  MAX_DELEGATION_DEPTH,
  DEFAULT_MAX_CONCURRENT_DELEGATIONS,
} from "./AgentManager.js";
export type { AgentManagerOptions, DelegateOptions } from "./AgentManager.js";
export {
  BUILT_IN_AGENTS,
  SYSTEM_PROMPTS,
  DEFAULT_SYSTEM_PROMPT,
  BUILD_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  RELEASE_SYSTEM_PROMPT,
  SECURITY_SYSTEM_PROMPT,
} from "./builtins.js";
export {
  matchesToolPattern,
  toolPredicateFor,
  resolveEffectiveTools,
  FilteredToolRunner,
} from "./toolFilter.js";
