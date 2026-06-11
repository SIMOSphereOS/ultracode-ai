/**
 * Public surface of the execution module.
 *
 * Note: the `UltraCode` facade lives in `../UltraCode.ts` (re-exported by the
 * package root) because it wires *all* core modules together; this index
 * exposes the execution engine, the query pipeline and the agent-manager
 * factory mandated by the monorepo factory contract.
 */

export { ExecutionEngine, DEFAULT_MAX_TURNS, isAbortError } from "./ExecutionEngine.js";
export type {
  ExecutionEngineOptions,
  ExecutionRunInput,
  ExecutionRunResult,
} from "./ExecutionEngine.js";
export { QueryPipeline } from "./QueryPipeline.js";
export type {
  ParsedQuery,
  QueryExecutor,
  QueryPipelineOptions,
  QueryPipelineResult,
} from "./QueryPipeline.js";
export type { IToolRunner } from "./types.js";
export {
  createAgentManager,
  AgentManager,
  MAX_DELEGATION_DEPTH,
  DEFAULT_MAX_CONCURRENT_DELEGATIONS,
} from "../agents/AgentManager.js";
export type { AgentManagerOptions, DelegateOptions } from "../agents/AgentManager.js";
