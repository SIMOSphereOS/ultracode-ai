/**
 * TEMPORARY ambient declaration, remove after core is built.
 *
 * `@ultracode/core` is developed in parallel and its `dist/` output does not
 * exist yet. This ambient module mirrors the agreed facade contract exactly so
 * the CLI can be type-checked in isolation. Once the real package is built,
 * TypeScript resolves the genuine declarations from `dist/index.d.ts` (module
 * resolution succeeds and this ambient fallback is no longer consulted), so
 * keeping the file around is harmless — but the integrator should delete it.
 */
declare module "@ultracode/core" {
  import type {
    AgentDefinition,
    AgentRunResult,
    ChangeAnalysis,
    DeepPartial,
    IAgent,
    IEventBus,
    ISessionStore,
    Logger,
    QualityReport,
    ReleasePlan,
    ToolDefinition,
    UltraCodeConfig,
    VersionSuggestion,
  } from "@ultracode/shared";

  /** Options accepted by {@link UltraCode.create}. */
  export interface UltraCodeCreateOptions {
    cwd?: string;
    configOverrides?: DeepPartial<UltraCodeConfig>;
    logger?: Logger;
    profile?: string;
  }

  /** Options accepted by {@link UltraCode.run}. */
  export interface UltraCodeRunOptions {
    agent?: string;
    sessionId?: string;
    signal?: AbortSignal;
    onChunk?: (text: string) => void;
  }

  /** The versioning sub-facade (`analyze`/`suggest`/`plan`/`quality`). */
  export interface VersioningFacade {
    analyze(range?: string): Promise<ChangeAnalysis>;
    suggest(range?: string): Promise<VersionSuggestion>;
    plan(version?: string): Promise<ReleasePlan>;
    quality(): Promise<QualityReport>;
  }

  /**
   * ConfigManager surface consumed by the CLI (`config get/set/...`,
   * `--setup`). The CLI feature-detects this on the facade instance and
   * degrades gracefully (read-only config commands) when absent.
   */
  export interface ConfigManagerLike {
    get(path: string): unknown;
    set(path: string, value: unknown): void;
    validate(): void;
    save(layer: "user" | "project"): Promise<void> | void;
    /** Redacted (secret-masked) view of the resolved config, when supported. */
    redacted?(): UltraCodeConfig;
  }

  /** The UltraCode facade — the CLI's single entry point into core. */
  export class UltraCode {
    static create(options?: UltraCodeCreateOptions): Promise<UltraCode>;
    readonly config: UltraCodeConfig;
    readonly events: IEventBus;
    readonly sessions: ISessionStore;
    readonly versioning: VersioningFacade;
    /** Optional; see {@link ConfigManagerLike}. */
    readonly configManager?: ConfigManagerLike;
    listAgents(): AgentDefinition[];
    listTools(): ToolDefinition[];
    getAgent(name: string): IAgent;
    run(prompt: string, opts?: UltraCodeRunOptions): Promise<AgentRunResult>;
    dispose(): Promise<void>;
  }
}
