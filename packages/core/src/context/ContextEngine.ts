/**
 * Context engine — facade combining {@link ContextCollector} and
 * {@link ContextCompressor} into a single `collect()` call that returns a
 * formatted, budgeted system-context string.
 */

import { serializeError } from "ultracode-shared";
import type { Logger, UltraCodeConfig } from "ultracode-shared";

import { ContextCollector } from "./ContextCollector.js";
import type { ContextSection } from "./ContextCollector.js";
import { ContextCompressor } from "./ContextCompressor.js";

/** Request for {@link ContextEngine.collect}. */
export interface ContextCollectRequest {
  /** Project working directory to inspect. */
  cwd: string;
  /** The user prompt — drives relevance ranking. */
  prompt: string;
  /** Token budget; defaults to `config.core.maxTokens`. */
  maxTokens?: number;
}

/** Injectable dependencies for {@link ContextEngine} (tests/integrator). */
export interface ContextEngineDeps {
  collector?: ContextCollector;
  compressor?: ContextCompressor;
}

/**
 * Collects project context and compresses it into a markdown document that
 * fits the requested token budget. `collect` never rejects for degraded
 * environments — failed sources are simply omitted.
 */
export class ContextEngine {
  private readonly config: UltraCodeConfig;
  private readonly logger: Logger;
  private readonly collector: ContextCollector;
  private readonly compressor: ContextCompressor;

  constructor(config: UltraCodeConfig, logger: Logger, deps: ContextEngineDeps = {}) {
    this.config = config;
    this.logger = logger;
    this.collector = deps.collector ?? new ContextCollector(logger);
    this.compressor = deps.compressor ?? new ContextCompressor();
  }

  /**
   * Gather context for `req.cwd`, rank it against `req.prompt` and render a
   * markdown system-context string within the token budget
   * (`req.maxTokens ?? config.core.maxTokens`). Returns `""` when nothing is
   * available or the budget is non-positive.
   */
  async collect(req: ContextCollectRequest): Promise<string> {
    const maxTokens = req.maxTokens ?? this.config.core.maxTokens;
    let sections: ContextSection[] = [];
    try {
      sections = await this.collector.collect(req.cwd);
    } catch (err) {
      // The collector is fault-tolerant by design; this is belt-and-braces.
      this.logger.warn("Context collection failed; returning empty context", {
        cwd: req.cwd,
        error: serializeError(err),
      });
    }
    return this.compressor.compress(sections, { prompt: req.prompt, maxTokens });
  }
}

/**
 * Factory per the monorepo-wide contract:
 * `createContextEngine(config, logger): ContextEngine`.
 */
export function createContextEngine(config: UltraCodeConfig, logger: Logger): ContextEngine {
  return new ContextEngine(config, logger);
}
