/**
 * Public surface of the agents module.
 */

export type { AgentManagerOptions, DelegateOptions } from "./AgentManager.js";
export {
  AgentManager,
  createAgentManager,
  DEFAULT_MAX_CONCURRENT_DELEGATIONS,
  MAX_DELEGATION_DEPTH,
} from "./AgentManager.js";
export type { BaseAgentOptions, BaseAgentRunInput, ContextCollector } from "./BaseAgent.js";
export { BaseAgent } from "./BaseAgent.js";
export {
  BUILD_SYSTEM_PROMPT,
  BUILT_IN_AGENTS,
  DEFAULT_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  RELEASE_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  SECURITY_SYSTEM_PROMPT,
  SYSTEM_PROMPTS,
} from "./builtins.js";
export {
  FilteredToolRunner,
  matchesToolPattern,
  resolveEffectiveTools,
  toolPredicateFor,
} from "./toolFilter.js";
