/**
 * The `UltraCode` facade — the single high-level entry point of `@ultracode/core`.
 *
 * `UltraCode.create()` wires all core modules together via their factory
 * contracts (config, providers, tools, memory, context, versioning). The
 * constructor itself takes every collaborator pre-built ({@link UltraCodeParts}),
 * so the facade is fully testable with fakes and without any neighbour module.
 *
 * NOTE for parallel development: the neighbouring modules
 * (`./config`, `./providers`, `./tools`, `./memory`, `./context`,
 * `./versioning`) are created in parallel. `create()` therefore loads them
 * via dynamic `import()` against their agreed factory contracts; the
 * integrator verifies the wiring once all modules exist.
 */

import {
  EventBus,
  NoopLogger,
  ProviderError,
  SessionError,
  ValidationError,
  serializeError,
  ENV_PREFIX,
} from "@ultracode/shared";
import type {
  AgentDefinition,
  AgentRunResult,
  ChangeAnalysis,
  ChatMessage,
  CompletionChunk,
  DeepPartial,
  IAgent,
  IEventBus,
  ILLMProvider,
  ISessionStore,
  Logger,
  ProviderId,
  ProviderOptions,
  QualityReport,
  ReleasePlan,
  ToolContext,
  ToolDefinition,
  ToolResult,
  UltraCodeConfig,
  VersionSuggestion,
} from "@ultracode/shared";
import os from "node:os";
import { AgentManager, createAgentManager } from "./agents/AgentManager.js";
import type { BaseAgentRunInput } from "./agents/BaseAgent.js";
import type { IToolRunner } from "./execution/types.js";
import type { ConfigManager } from "./config/ConfigManager.js";
import type { BudgetFacade, AuthoringFacade, LearningFacade } from "./facade/ext-types.js";
import {
  buildBudgetFacade,
  buildAuthoringFacade,
  buildLearningFacade,
} from "./facade/ext-adapters.js";

/* ----------------------------------------------------------------------------
 * Factory contracts of the parallel modules.
 *
 * `create()` loads the neighbouring modules via dynamic `import()`. Their result
 * is typed with the compiler-derived `typeof import("./<module>/index.js")`
 * (not hand-maintained mirror interfaces), so any drift in a factory's real
 * signature is caught at compile time instead of being hidden behind an
 * `as unknown as` cast.
 * ------------------------------------------------------------------------- */

/** Constructor options accepted by the real `ConfigManager` (drift-checked at the call site). */
interface ConfigManagerCtorOptions {
  cwd?: string;
  overrides?: DeepPartial<UltraCodeConfig>;
  env?: NodeJS.ProcessEnv;
  profile?: string;
  logger?: Logger;
}

/**
 * The subset of the {@link UltraCodeConfig} `providers` section that carries the
 * in-memory API-key store assembled by the config loader (env + `~/.ultracode/.env`).
 */
interface ProvidersWithKeys {
  apiKeys?: Record<string, string>;
}

/** Minimal `ITool`-like shape the facade registers for the `task` tool. */
interface RegistrableTool {
  readonly definition: ToolDefinition;
  validate(args: unknown): unknown;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/* ----------------------------------------------------------------------------
 * Public facade types
 * ------------------------------------------------------------------------- */

/** Versioning sub-API exposed on {@link UltraCode.versioning}. */
export interface VersioningFacade {
  /** Analyse repository changes (optionally limited to a git range). */
  analyze(range?: string): Promise<ChangeAnalysis>;
  /** Suggest the next semantic version. */
  suggest(range?: string): Promise<VersionSuggestion>;
  /** Draft a release plan for the given (or suggested) version. */
  plan(version?: string): Promise<ReleasePlan>;
  /** Run the configured quality gates. */
  quality(): Promise<QualityReport>;
}

/** Options for {@link UltraCode.create}. */
export interface UltraCodeCreateOptions {
  /** Project working directory. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Highest-priority config overrides. */
  configOverrides?: DeepPartial<UltraCodeConfig>;
  /** Logger used across all modules. Defaults to a no-op logger. */
  logger?: Logger;
  /** Named config profile to apply. */
  profile?: string;
  /**
   * Environment snapshot handed to tools. Defaults to `process.env`. For
   * `system`-category tools (e.g. `bash`) it is additionally run through
   * credential sanitisation regardless of this value — secrets must never
   * reach a shell child whose output is returned to the model. Embedders that
   * want strict isolation should pass a minimal explicit `env`.
   */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Options for {@link UltraCode.run}. */
export interface UltraCodeRunOptions {
  /** Agent to run; defaults to the active/default agent. */
  agent?: string;
  /** Existing session to continue; a new session is created when omitted. */
  sessionId?: string;
  /** Cancellation signal for the run. */
  signal?: AbortSignal;
  /** Streaming callback for incremental output (raw completion chunks). */
  onChunk?: (c: CompletionChunk) => void;
}

/** Pre-built collaborators injected into the {@link UltraCode} constructor. */
export interface UltraCodeParts {
  /** Fully-resolved configuration. */
  config: UltraCodeConfig;
  /** Structured logger. */
  logger?: Logger;
  /** Shared event bus. */
  events: IEventBus;
  /** Session persistence. */
  sessions: ISessionStore;
  /** Tool runner (registry + executor adapter). */
  tools: IToolRunner;
  /** Agent registry/factory. */
  agents: AgentManager;
  /** Versioning sub-system facade. */
  versioning: VersioningFacade;
  /** Budget sub-API (Module A). */
  budget: BudgetFacade;
  /** Skill/agent authoring sub-API (Module B). */
  authoring: AuthoringFacade;
  /** Documentation-learning sub-API (Module C). */
  learning: LearningFacade;
  /**
   * Optional stateful config manager. When present the CLI uses it for
   * `config get/set/validate/save` and the redacted view; otherwise those
   * mutating commands degrade gracefully.
   */
  configManager?: ConfigManager;
  /**
   * Pre-flight check invoked by {@link UltraCode.run}; should throw a clear
   * {@link ProviderError} when the active provider is not usable (e.g. no
   * API key configured).
   */
  ensureProviderReady?: () => void;
  /** Cleanup callbacks invoked by {@link UltraCode.dispose}. */
  disposables?: Array<() => void | Promise<void>>;
  /** Working directory of this instance. Defaults to `process.cwd()`. */
  cwd?: string;
}

/** Environment variable name that holds the API key for a provider. */
function apiKeyEnvVar(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

/** Resolve a provider API key from the environment (provider- or UltraCode-prefixed). */
function resolveApiKeyFromEnv(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  return env[apiKeyEnvVar(provider)] ?? env[`${ENV_PREFIX}${apiKeyEnvVar(provider)}`];
}

/**
 * Resolve a provider API key, preferring the in-memory store assembled by the
 * config loader (`providers.apiKeys`, fed from the environment and
 * `~/.ultracode/.env`) and falling back to a direct environment lookup.
 */
function resolveApiKey(
  provider: string,
  config: UltraCodeConfig,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const fromConfig = (config.providers as ProvidersWithKeys).apiKeys?.[provider];
  if (typeof fromConfig === "string" && fromConfig.trim() !== "") return fromConfig;
  return resolveApiKeyFromEnv(provider, env);
}

/** Derive a single-line session title from a prompt. */
function titleFromPrompt(prompt: string): string {
  const line = prompt.replace(/\s+/g, " ").trim();
  return line.length > 64 ? `${line.slice(0, 63)}…` : line || "New session";
}

/** Validated arguments of the `task` tool. */
interface TaskToolArgs {
  agent: string;
  prompt: string;
}

/**
 * Build the `task` tool that delegates a prompt to a (sub)agent via
 * {@link AgentManager.delegate} (depth limit enforced by the manager). Tools
 * never throw from `execute`; failures are reported as `ok: false` results.
 *
 * Exported for unit testing; production wiring registers it inside {@link
 * UltraCode.create}.
 */
export function createTaskTool(agents: AgentManager): RegistrableTool {
  const definition: ToolDefinition = {
    name: "task",
    description:
      "Delegate a self-contained subtask to a named agent (e.g. \"plan\", \"review\", " +
      "\"security\") and return its final answer. Use for focused, independent work.",
    category: "ai",
    permission: "always",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Name of the agent to delegate to (e.g. default, build, plan, review, security).",
        },
        prompt: {
          type: "string",
          description: "The self-contained instruction for the delegated agent.",
        },
      },
      required: ["agent", "prompt"],
    },
  };

  return {
    definition,
    validate(args: unknown): TaskToolArgs {
      if (!isRecord(args)) {
        throw new ValidationError('Invalid arguments for tool "task": expected an object');
      }
      const agent = args["agent"];
      const prompt = args["prompt"];
      if (typeof agent !== "string" || agent.trim() === "") {
        throw new ValidationError('Invalid arguments for tool "task": "agent" must be a non-empty string');
      }
      if (typeof prompt !== "string" || prompt.trim() === "") {
        throw new ValidationError('Invalid arguments for tool "task": "prompt" must be a non-empty string');
      }
      return { agent, prompt };
    },
    async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
      const start = Date.now();
      const { agent, prompt } = args as TaskToolArgs;
      try {
        const options: { depth: number; signal?: AbortSignal } = { depth: 1 };
        if (ctx.signal !== undefined) options.signal = ctx.signal;
        const result = await agents.delegate(agent, prompt, options);
        return {
          ok: true,
          output: {
            agent,
            text: result.text,
            toolCallsExecuted: result.toolCallsExecuted,
            usage: result.usage,
            turns: result.turns,
          },
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          ok: false,
          output: null,
          error: serializeError(err),
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

/** True only for plain (non-array) objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Close `target` if it exposes a `close()` method or a `Symbol.dispose`/
 * `Symbol.asyncDispose` handler. Used to release optional resources (e.g. a
 * SQLite handle) that the `ISessionStore` contract does not require.
 */
async function closeIfDisposable(target: unknown): Promise<void> {
  if (target === null || typeof target !== "object") return;
  const obj = target as Record<PropertyKey, unknown>;
  if (typeof obj["close"] === "function") {
    await (obj["close"] as () => unknown | Promise<unknown>)();
    return;
  }
  const asyncDispose = obj[Symbol.asyncDispose as unknown as PropertyKey];
  if (typeof asyncDispose === "function") {
    await (asyncDispose as () => Promise<unknown>).call(target);
    return;
  }
  const dispose = obj[Symbol.dispose as unknown as PropertyKey];
  if (typeof dispose === "function") {
    (dispose as () => unknown).call(target);
  }
}

/**
 * Wrap a provider factory so the underlying {@link ILLMProvider} is only built
 * on first actual use. This keeps `UltraCode.create()` (and therefore the
 * read-only CLI commands: `tools list`, `agents list`, `config show`, `doctor`,
 * `version …`) working offline even when no API key is configured — a missing
 * key only surfaces when a run actually needs the model.
 *
 * @param name - provider name (used for the lazy `.name` getter).
 * @param factory - constructs the real provider (may throw `ProviderError`).
 */
function lazyProvider(name: ProviderId, factory: () => ILLMProvider): ILLMProvider {
  let instance: ILLMProvider | undefined;
  const resolve = (): ILLMProvider => (instance ??= factory());
  return {
    get name() {
      return String(name);
    },
    listModels: (...args) => resolve().listModels(...args),
    complete: (...args) => resolve().complete(...args),
    stream: (...args) => resolve().stream(...args),
    healthCheck: (...args) => resolve().healthCheck(...args),
  } as ILLMProvider;
}

/**
 * High-level facade over the UltraCode core.
 *
 * Construct via {@link UltraCode.create} for fully wired instances, or via
 * the constructor with {@link UltraCodeParts} for embedding/testing.
 */
export class UltraCode {
  /** The fully-resolved configuration. */
  public readonly config: UltraCodeConfig;
  /** The shared event bus. */
  public readonly events: IEventBus;
  /** The session store. */
  public readonly sessions: ISessionStore;
  /** The versioning sub-API. */
  public readonly versioning: VersioningFacade;
  /** The budget sub-API (Module A): cost estimation, plan, ledger. */
  public readonly budget: BudgetFacade;
  /** The authoring sub-API (Module B): skills + agents. */
  public readonly authoring: AuthoringFacade;
  /** The learning sub-API (Module C): documentation sources + runs. */
  public readonly learning: LearningFacade;
  /**
   * The stateful config manager, when wired (always set by {@link create}).
   * The CLI feature-detects this for `config get/set/validate/save`.
   */
  public readonly configManager?: ConfigManager;

  private readonly logger: Logger;
  private readonly toolRunner: IToolRunner;
  private readonly agentManager: AgentManager;
  private readonly ensureProviderReady?: () => void;
  private readonly disposables: Array<() => void | Promise<void>>;
  private disposed = false;

  constructor(parts: UltraCodeParts) {
    this.config = parts.config;
    this.logger = parts.logger ?? new NoopLogger();
    this.events = parts.events;
    this.sessions = parts.sessions;
    this.toolRunner = parts.tools;
    this.agentManager = parts.agents;
    this.versioning = parts.versioning;
    this.budget = parts.budget;
    this.authoring = parts.authoring;
    this.learning = parts.learning;
    if (parts.configManager !== undefined) this.configManager = parts.configManager;
    this.ensureProviderReady = parts.ensureProviderReady;
    this.disposables = [...(parts.disposables ?? [])];
  }

  /**
   * Create a fully wired UltraCode instance from the on-disk configuration,
   * using the factory contracts of all core modules.
   */
  static async create(options: UltraCodeCreateOptions = {}): Promise<UltraCode> {
    const logger = options.logger ?? new NoopLogger();
    const cwd = options.cwd ?? process.cwd();

    const configModule = await import("./config/index.js");
    const ctorOptions: ConfigManagerCtorOptions = { cwd, logger };
    if (options.configOverrides !== undefined) ctorOptions.overrides = options.configOverrides;
    if (options.profile !== undefined) ctorOptions.profile = options.profile;
    const configManager = new configModule.ConfigManager(ctorOptions);
    const config = (await configManager.load()) as unknown as UltraCodeConfig;

    const events = new EventBus();

    const providersModule = await import("./providers/index.js");
    const providerOptionsFor = (name: ProviderId): ProviderOptions & { logger?: Logger } => {
      const opts: ProviderOptions & { logger?: Logger } = {
        timeoutMs: config.providers.timeout * 1000,
        maxRetries: config.providers.maxRetries,
        retryDelayMs: config.providers.retryDelay * 1000,
        logger,
      };
      const apiKey = resolveApiKey(String(name), config, process.env);
      if (apiKey !== undefined) opts.apiKey = apiKey;
      if (name === "local") opts.baseUrl = config.providers.local.endpoint;
      return opts;
    };
    const activeProviderName = config.core.activeProvider;
    // Build providers lazily: constructing a keyed provider throws when no API
    // key is configured, but read-only commands (tools/agents/config/doctor/
    // version) must work offline. The key check happens in `ensureProviderReady`
    // (run path) and on first real provider use.
    const provider = lazyProvider(activeProviderName, () =>
      providersModule.createProvider(activeProviderName, providerOptionsFor(activeProviderName)),
    );

    const toolsModule = await import("./tools/index.js");
    const { registry, executor } = toolsModule.createToolSystem(config, logger, events);
    const toolRunner: IToolRunner = {
      execute: (name, args, ctx) => executor.execute(name, args, ctx),
      list: () => registry.list(),
    };

    const memoryModule = await import("./memory/index.js");
    const sessions = await memoryModule.createSessionStore(config, logger);

    const contextModule = await import("./context/index.js");
    const contextEngine = contextModule.createContextEngine(config, logger);

    const versioningModule = await import("./versioning/index.js");
    const versioningSystem = versioningModule.createVersioningSystem({
      cwd,
      logger,
      provider,
      config,
    });
    const versioning: VersioningFacade = {
      analyze: (range?: string) => versioningSystem.analyze(range),
      suggest: (range?: string) => versioningSystem.suggest(range),
      plan: (version?: string) => versioningSystem.plan(version),
      quality: () => versioningSystem.quality(),
    };

    // --- Modules A/B/C (budget / authoring / learning) ----------------------
    // All cross-module dependencies are passed by constructor injection against
    // the agreed contracts; no module imports a sibling. The LLM provider is
    // shared with authoring/learning ONLY when a key is actually configured —
    // offline they fall back to deterministic behaviour.
    const homeDir = os.homedir();
    const nowIso = (): string => new Date().toISOString();

    const budgetModule = await import("./budget/index.js");
    const planner = budgetModule.createBudgetPlanner({ logger, events, homeDir });
    // Load any persisted plan + ledger; install the sensible default plan the
    // first time so `budget status`/`show` report a real plan (caps + EUR/USD).
    await planner.loadPlan();
    if (planner.getPlan().envelopes.length === 0) {
      await planner.installDefaultPlan();
    }
    await planner.loadLedger();
    const budget = buildBudgetFacade(planner, homeDir, nowIso);

    const extProvider =
      resolveApiKey(String(activeProviderName), config, process.env) !== undefined
        ? provider
        : undefined;

    const authoringModule = await import("./authoring/index.js");
    const authoringInstance = authoringModule.createAuthoring({
      logger,
      events,
      homeDir,
      budget: planner,
      ...(extProvider !== undefined ? { provider: extProvider } : {}),
    });
    const authoring = buildAuthoringFacade(authoringInstance);

    const learningModule = await import("./learning/index.js");
    const learnAgent = learningModule.createLearnAgent({
      logger,
      events,
      homeDir,
      budget: planner,
      author: authoringInstance,
      ingestion: new learningModule.NativeCrawlerProvider(),
      ...(extProvider !== undefined ? { provider: extProvider } : {}),
    });
    const learning = buildLearningFacade(learnAgent, logger);

    const agents = createAgentManager({
      config,
      logger,
      tools: toolRunner,
      provider,
      resolveProvider: (name) =>
        name === activeProviderName
          ? provider
          : lazyProvider(name, () =>
              providersModule.createProvider(name, providerOptionsFor(name)),
            ),
      events,
      cwd,
      env: options.env ?? (process.env as Readonly<Record<string, string | undefined>>),
      contextCollector: (prompt) =>
        contextEngine.collect({ cwd, prompt, maxTokens: config.core.maxTokens }),
    });

    // Register the `task` tool, backed by bounded subagent delegation. Skipped
    // when the tool module already provides one (forward-compatible).
    if (!registry.has("task")) {
      registry.register(createTaskTool(agents));
    }

    const ensureProviderReady = (): void => {
      const name = String(config.core.activeProvider);
      if (name === "local") return;
      if (resolveApiKey(name, config, process.env) === undefined) {
        throw new ProviderError(
          `No API key configured for provider "${name}". Set the ${apiKeyEnvVar(name)} ` +
            `environment variable (for example in ~/.ultracode/.env) or run the UltraCode ` +
            `setup to configure your credentials.`,
          { provider: name, retryable: false },
        );
      }
    };

    return new UltraCode({
      config,
      logger,
      events,
      sessions,
      tools: toolRunner,
      agents,
      versioning,
      budget,
      authoring,
      learning,
      configManager,
      ensureProviderReady,
      cwd,
    });
  }

  /** List all registered agent definitions. */
  listAgents(): AgentDefinition[] {
    return this.agentManager.list();
  }

  /** List all registered tool definitions. */
  listTools(): ToolDefinition[] {
    return this.toolRunner.list();
  }

  /**
   * Get an agent by name.
   * @throws {AgentError} when the agent is unknown.
   */
  getAgent(name: string): IAgent {
    return this.agentManager.get(name);
  }

  /**
   * Run a prompt against an agent, with optional session continuity and
   * streaming.
   *
   * @throws {ProviderError} when the active provider is not usable (e.g. no
   *   API key configured).
   * @throws {SessionError} when `sessionId` refers to an unknown session.
   * @throws {AgentError} when the run fails.
   */
  async run(prompt: string, opts: UltraCodeRunOptions = {}): Promise<AgentRunResult> {
    this.ensureProviderReady?.();

    const agent = opts.agent ? this.agentManager.get(opts.agent) : this.agentManager.getActive();

    let sessionId = opts.sessionId;
    let history: ChatMessage[] | undefined;
    if (sessionId !== undefined) {
      const record = await this.sessions.get(sessionId);
      if (record === null) {
        throw new SessionError(`Session "${sessionId}" not found`, {
          details: { sessionId },
        });
      }
      history = record.messages;
    } else if (this.config.sessions.enablePersistence) {
      const meta = await this.sessions.create(agent.definition.name, titleFromPrompt(prompt));
      sessionId = meta.id;
    }

    const input: BaseAgentRunInput = { prompt };
    if (sessionId !== undefined) input.sessionId = sessionId;
    if (history !== undefined) input.history = history;
    if (opts.signal !== undefined) input.signal = opts.signal;
    if (opts.onChunk !== undefined) input.onChunk = opts.onChunk;

    const result = await agent.run(input);

    if (sessionId !== undefined) {
      try {
        await this.sessions.appendMessages(sessionId, [
          { role: "user", content: prompt },
          { role: "assistant", content: result.text },
        ]);
      } catch (err) {
        // Persistence problems must not destroy a successful run result.
        this.logger.warn("failed to persist session messages", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  /** Release resources; safe to call multiple times. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.disposables) {
      try {
        await dispose();
      } catch (err) {
        this.logger.warn("disposable threw during dispose", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // The session store may hold an OS handle (e.g. SqliteSessionStore's
    // DatabaseSync). `ISessionStore` does not mandate cleanup, so feature-detect
    // a `close()` / `Symbol.dispose` method and call whichever exists.
    try {
      await closeIfDisposable(this.sessions);
    } catch (err) {
      this.logger.warn("session store close threw during dispose", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (this.events instanceof EventBus) {
      this.events.removeAll();
    }
  }
}
