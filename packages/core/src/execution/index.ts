/**
 * Public surface of the execution module.
 *
 * Note: the `UltraCode` facade lives in `../UltraCode.ts` (re-exported by the
 * package root) because it wires *all* core modules together; this index
 * exposes the execution engine, the query pipeline and the agent-manager
 * factory mandated by the monorepo factory contract.
 */

export type { AgentManagerOptions, DelegateOptions } from "../agents/AgentManager.js";
export {
  AgentManager,
  createAgentManager,
  DEFAULT_MAX_CONCURRENT_DELEGATIONS,
  MAX_DELEGATION_DEPTH,
} from "../agents/AgentManager.js";
export type {
  ExecutionEngineOptions,
  ExecutionRunInput,
  ExecutionRunResult,
  ITokenOptimizer,
} from "./ExecutionEngine.js";
export { DEFAULT_MAX_TURNS, ExecutionEngine, isAbortError } from "./ExecutionEngine.js";
export type {
  ParsedQuery,
  QueryExecutor,
  QueryPipelineOptions,
  QueryPipelineResult,
} from "./QueryPipeline.js";
export { QueryPipeline } from "./QueryPipeline.js";
export type { IToolRunner } from "./types.js";
