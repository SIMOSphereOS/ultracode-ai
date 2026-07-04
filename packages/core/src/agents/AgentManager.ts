/**
 * {@link AgentManager} — registry and factory for agents.
 *
 * Holds {@link AgentDefinition}s (built-ins plus custom registrations),
 * lazily instantiates {@link BaseAgent}s with `AgentsConfig` overrides
 * merged in, tracks the active agent, and offers bounded `task`-style
 * subagent delegation (depth limit 2, concurrency from
 * `tools.perTool.task.maxConcurrent`, default 3).
 */

import type {
  AgentConfigEntry,
  AgentDefinition,
  AgentRunResult,
  IEventBus,
  ILLMProvider,
  Logger,
  ProviderId,
  UltraCodeConfig,
} from "ultracode-shared";
import { AgentError, NoopLogger } from "ultracode-shared";
import type { IToolRunner } from "../execution/types.js";
import type { ContextCollector } from "./BaseAgent.js";
import { BaseAgent } from "./BaseAgent.js";
import { BUILT_IN_AGENTS, SYSTEM_PROMPTS } from "./builtins.js";

/** Maximum subagent delegation depth (a delegate of a delegate is the limit). */
export const MAX_DELEGATION_DEPTH = 2;

/** Default cap on concurrently running delegations. */
export const DEFAULT_MAX_CONCURRENT_DELEGATIONS = 3;

/** Construction options for {@link AgentManager}. */
export interface AgentManagerOptions {
  /** Fully-resolved configuration (agents + tools sections are consulted). */
  config: UltraCodeConfig;
  /** Structured logger; defaults to a no-op logger. */
  logger?: Logger;
  /** Unfiltered tool runner shared by all agents. */
  tools: IToolRunner;
  /** Default provider used when an agent declares no override. */
  provider: ILLMProvider;
  /**
   * Optional resolver for per-agent provider overrides. Without it, provider
   * overrides fall back to the default provider (with a warning).
   */
  resolveProvider?: (name: ProviderId) => ILLMProvider;
  /** Optional event bus (`agent.switched`, engine events). */
  events?: IEventBus;
  /** Maximum model turns per run, forwarded to every agent. */
  maxTurns?: number;
  /** Working directory forwarded to agents/tools. */
  cwd?: string;
  /** Environment snapshot forwarded to agents/tools (defaults to `process.env`). */
  env?: Readonly<Record<string, string | undefined>>;
  /** Optional context collector forwarded to every agent. */
  contextCollector?: ContextCollector;
}

/** Options for {@link AgentManager.delegate}. */
export interface DelegateOptions {
  /** Current delegation depth (root callers omit this; subagents pass depth+1). */
  depth?: number;
  /** Cancellation signal for the delegated run. */
  signal?: AbortSignal;
}

/** Minimal async semaphore bounding concurrent delegations. */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    };
  }
}

/** Merge an `AgentsConfig` override entry into a definition (immutably). */
function mergeConfigEntry(
  base: AgentDefinition,
  entry: AgentConfigEntry | undefined,
): AgentDefinition {
  if (!entry) return { ...base };
  const merged: AgentDefinition = { ...base };
  if (entry.activeModel !== undefined) merged.model = entry.activeModel;
  if (entry.activeProvider !== undefined) merged.provider = entry.activeProvider;
  if (entry.systemPromptId !== undefined) merged.systemPromptId = entry.systemPromptId;
  if (entry.enabledTools !== undefined) merged.enabledTools = [...entry.enabledTools];
  if (entry.disabledTools !== undefined) merged.disabledTools = [...entry.disabledTools];
  return merged;
}

/**
 * Agent registry, factory and delegation coordinator.
 *
 * Agents are created lazily from their definitions on first {@link get} and
 * cached; re-registering a name invalidates the cached instance.
 */
export class AgentManager {
  private readonly definitions = new Map<string, AgentDefinition>();
  private readonly instances = new Map<string, BaseAgent>();
  private readonly config: UltraCodeConfig;
  private readonly logger: Logger;
  private readonly tools: IToolRunner;
  private readonly provider: ILLMProvider;
  private readonly resolveProvider?: (name: ProviderId) => ILLMProvider;
  private readonly events?: IEventBus;
  private readonly maxTurns?: number;
  private readonly cwd?: string;
  private readonly env?: Readonly<Record<string, string | undefined>>;
  private readonly contextCollector?: ContextCollector;
  private readonly delegationSemaphore: Semaphore;
  private activeName: string;

  constructor(options: AgentManagerOptions) {
    this.config = options.config;
    this.logger = options.logger ?? new NoopLogger();
    this.tools = options.tools;
    this.provider = options.provider;
    this.resolveProvider = options.resolveProvider;
    this.events = options.events;
    this.maxTurns = options.maxTurns;
    this.cwd = options.cwd;
    this.env = options.env;
    this.contextCollector = options.contextCollector;

    for (const def of BUILT_IN_AGENTS) this.definitions.set(def.name, { ...def });

    // Agents that only exist in config become custom definitions.
    for (const name of Object.keys(this.config.agents.agents)) {
      if (!this.definitions.has(name)) {
        this.definitions.set(name, {
          name,
          description: `Custom agent "${name}" (from configuration)`,
          type: "custom",
        });
      }
    }

    const maxConcurrentRaw = this.config.tools.perTool["task"]?.maxConcurrent;
    const maxConcurrent =
      typeof maxConcurrentRaw === "number" &&
      Number.isInteger(maxConcurrentRaw) &&
      maxConcurrentRaw > 0
        ? maxConcurrentRaw
        : DEFAULT_MAX_CONCURRENT_DELEGATIONS;
    this.delegationSemaphore = new Semaphore(maxConcurrent);

    const preferred = this.config.agents.default || this.config.core.defaultAgent || "default";
    if (this.definitions.has(preferred)) {
      this.activeName = preferred;
    } else {
      this.logger.warn(`configured default agent "${preferred}" is unknown; using "default"`, {
        preferred,
      });
      this.activeName = "default";
    }
  }

  /** Register (or replace) an agent definition; invalidates any cached instance. */
  register(definition: AgentDefinition): void {
    if (!definition.name || definition.name.trim().length === 0) {
      throw new AgentError("Agent definition must have a non-empty name");
    }
    this.definitions.set(definition.name, { ...definition });
    this.instances.delete(definition.name);
  }

  /** List all registered agent definitions (config overrides applied). */
  list(): AgentDefinition[] {
    return [...this.definitions.values()].map((def) =>
      mergeConfigEntry(def, this.config.agents.agents[def.name]),
    );
  }

  /**
   * Get (lazily creating) the agent with the given name.
   * @throws {AgentError} when no such agent is registered.
   */
  get(name: string): BaseAgent {
    const cached = this.instances.get(name);
    if (cached) return cached;

    const base = this.definitions.get(name);
    if (!base) {
      throw new AgentError(`Unknown agent "${name}"`, {
        details: { available: [...this.definitions.keys()] },
      });
    }

    const definition = mergeConfigEntry(base, this.config.agents.agents[name]);
    const model = definition.model ?? this.config.core.activeModel;
    // A project-local agent (loaded from `<cwd>/.ultracode/agents/<name>.md`)
    // carries its complete system prompt inline as its markdown body. Prefer that
    // verbatim; otherwise resolve an embedded prompt by id (built-ins/custom).
    const systemPromptId = definition.systemPromptId ?? definition.name;
    const systemPrompt =
      definition.systemPrompt ?? SYSTEM_PROMPTS[systemPromptId] ?? SYSTEM_PROMPTS["default"] ?? "";

    let provider = this.provider;
    if (definition.provider !== undefined && definition.provider !== this.provider.name) {
      if (this.resolveProvider) {
        provider = this.resolveProvider(definition.provider);
      } else {
        this.logger.warn(
          `agent "${name}" requests provider "${String(definition.provider)}" but no provider resolver is configured; using default provider`,
          { agent: name },
        );
      }
    }

    const agentOptions: ConstructorParameters<typeof BaseAgent>[0] = {
      definition,
      systemPrompt,
      provider,
      tools: this.tools,
      model,
      logger: this.logger,
    };
    if (this.events !== undefined) agentOptions.events = this.events;
    if (this.maxTurns !== undefined) agentOptions.maxTurns = this.maxTurns;
    if (this.cwd !== undefined) agentOptions.cwd = this.cwd;
    if (this.env !== undefined) agentOptions.env = this.env;
    if (this.contextCollector !== undefined) agentOptions.contextCollector = this.contextCollector;
    agentOptions.maxTokens = this.config.core.maxTokens;
    agentOptions.temperature = this.config.core.temperature;

    const agent = new BaseAgent(agentOptions);
    this.instances.set(name, agent);
    return agent;
  }

  /**
   * Set the active agent and emit an `agent.switched` event.
   * @throws {AgentError} when the agent is unknown.
   */
  setActive(name: string): void {
    if (!this.definitions.has(name)) {
      throw new AgentError(`Cannot activate unknown agent "${name}"`, {
        details: { available: [...this.definitions.keys()] },
      });
    }
    const from = this.activeName;
    this.activeName = name;
    if (from !== name) {
      this.events?.emit({ type: "agent.switched", from, to: name });
    }
  }

  /** Name of the currently active agent. */
  getActiveName(): string {
    return this.activeName;
  }

  /** The currently active agent instance. */
  getActive(): BaseAgent {
    return this.get(this.activeName);
  }

  /**
   * Delegate a prompt to a (sub)agent — the `task` tool's backing operation.
   *
   * Depth starts at 1 for a root delegation; a delegated agent delegating
   * again passes `depth: 2`. Anything deeper rejects with {@link AgentError}.
   * Concurrency is bounded by `tools.perTool.task.maxConcurrent` (default 3);
   * excess delegations wait for a slot instead of failing.
   *
   * @throws {AgentError} when the depth limit is exceeded or the run fails.
   */
  async delegate(
    agentName: string,
    prompt: string,
    options: DelegateOptions = {},
  ): Promise<AgentRunResult> {
    const depth = options.depth ?? 1;
    if (!Number.isInteger(depth) || depth < 1) {
      throw new AgentError(`Invalid delegation depth ${String(depth)}`);
    }
    if (depth > MAX_DELEGATION_DEPTH) {
      throw new AgentError(`Subagent delegation depth limit (${MAX_DELEGATION_DEPTH}) exceeded`, {
        details: { depth, agent: agentName },
      });
    }
    const agent = this.get(agentName);
    const release = await this.delegationSemaphore.acquire();
    try {
      const input: Parameters<BaseAgent["run"]>[0] = { prompt };
      if (options.signal !== undefined) input.signal = options.signal;
      return await agent.run(input);
    } finally {
      release();
    }
  }
}

/**
 * Factory for the agent system — registers all built-in agents and applies
 * `AgentsConfig` overrides from the given configuration.
 */
export function createAgentManager(options: AgentManagerOptions): AgentManager {
  return new AgentManager(options);
}
