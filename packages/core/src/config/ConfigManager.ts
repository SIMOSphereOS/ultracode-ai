/**
 * Hierarchical configuration manager for UltraCode.
 *
 * Layer order (highest priority applied last):
 * 1. `DEFAULT_CONFIG` (embedded baseline)
 * 2. user config `~/.ultracode/config.toml`
 * 3. project config (first existing of `.ultracode/config.toml`,
 *    `.vibe/config.toml`, `.ultracode.toml`)
 * 4. profile `~/.ultracode/profiles/<name>.toml` (when requested)
 * 5. environment variables (incl. `~/.ultracode/.env`)
 * 6. runtime overrides passed to {@link loadConfig}
 *
 * Missing files are not an error (defaults apply); broken TOML, unknown
 * profiles and schema violations raise `ConfigError`.
 */

import { readFile } from "node:fs/promises";
import * as os from "node:os";
import type { DeepPartial, Logger, UltraCodeConfig } from "ultracode-shared";
import {
  ConfigError,
  DEFAULT_CONFIG,
  deepMerge,
  isPlainObject,
  NoopLogger,
} from "ultracode-shared";
import { envToOverlay, parseDotEnv } from "./env.js";
import { type ConfigOverlay, configToToml, parseTomlSource, tomlToOverlay } from "./mapping.js";
import {
  atomicWriteFile,
  profileFile,
  projectConfigCandidates,
  userConfigFile,
  userEnvFile,
} from "./paths.js";
import { checkConfig, type ResolvedUltraCodeConfig, validateConfig } from "./schema.js";
import { CONFIG_SPEC, camelizeKey, DANGEROUS_KEYS, type SpecNode } from "./spec.js";

/** Options accepted by {@link ConfigManager} and {@link loadConfig}. */
export interface ConfigManagerOptions {
  /** Project working directory (default: `process.cwd()`). */
  cwd?: string;
  /** Runtime overrides — the highest-priority layer. */
  overrides?: DeepPartial<UltraCodeConfig>;
  /** Environment to read (default: `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Profile name (`~/.ultracode/profiles/<name>.toml`). */
  profile?: string;
  /** Logger for warnings about unknown keys etc. (default: silent). */
  logger?: Logger;
  /**
   * Home directory override used for the user config, `.env` and profiles
   * (default: `os.homedir()`). Useful for tests and embedders.
   */
  homeDir?: string;
}

/** Persistence scope for {@link ConfigManager.save}. */
export type ConfigScope = "user" | "project";

/** Mask used by {@link ConfigManager.redacted} for secret values. */
const REDACTED = "***REDACTED***";

/** Key names whose string values are considered secrets. */
const SECRET_KEY_RE = /api[_-]?keys?$/i;

/** Reads a file as UTF-8; `null` when it does not exist. */
async function readFileIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw new ConfigError(`Failed to read config file: ${file}`, {
      cause,
      details: { file },
    });
  }
}

/**
 * Manages the layered UltraCode configuration: loading, dotted-path access,
 * validated mutation, TOML import/export and atomic persistence.
 */
export class ConfigManager {
  private readonly cwd: string;
  private readonly homeDir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly profile: string | undefined;
  private readonly overrides: DeepPartial<UltraCodeConfig> | undefined;
  private readonly logger: Logger;
  private current: ResolvedUltraCodeConfig | null = null;

  constructor(options: ConfigManagerOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.homeDir = options.homeDir ?? os.homedir();
    this.env = options.env ?? process.env;
    this.profile = options.profile;
    this.overrides = options.overrides;
    this.logger = options.logger ?? new NoopLogger();
  }

  /**
   * Loads and merges all configuration layers.
   *
   * @returns the fully-resolved, validated configuration.
   * @throws {ConfigError} for broken TOML (with line info), an unknown
   *   profile, or schema violations. Missing files are fine.
   */
  public async load(): Promise<ResolvedUltraCodeConfig> {
    const warn = (msg: string): void => this.logger.warn(msg);

    let merged: Record<string, unknown> = deepMerge(
      structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
      { providers: { apiKeys: {} } },
    );

    const applyFile = async (file: string): Promise<void> => {
      const source = await readFileIfExists(file);
      if (source === null) return;
      const overlay = tomlToOverlay(parseTomlSource(source, file), (m) => warn(`${m} (${file})`));
      merged = deepMerge(merged, overlay);
      this.logger.debug(`Applied config layer: ${file}`);
    };

    // 2. user config
    await applyFile(userConfigFile(this.homeDir));

    // 3. project config — first existing candidate wins
    for (const candidate of projectConfigCandidates(this.cwd)) {
      const source = await readFileIfExists(candidate);
      if (source === null) continue;
      const overlay = tomlToOverlay(parseTomlSource(source, candidate), (m) =>
        warn(`${m} (${candidate})`),
      );
      merged = deepMerge(merged, overlay);
      this.logger.debug(`Applied project config: ${candidate}`);
      break;
    }

    // 4. profile (explicitly requested → missing file is an error)
    if (this.profile !== undefined) {
      const file = profileFile(this.profile, this.homeDir);
      const source = await readFileIfExists(file);
      if (source === null) {
        throw new ConfigError(`Profile "${this.profile}" not found: ${file}`, {
          details: { profile: this.profile, file },
        });
      }
      const overlay = tomlToOverlay(parseTomlSource(source, file), (m) => warn(`${m} (${file})`));
      merged = deepMerge(merged, overlay);
      this.logger.debug(`Applied profile: ${this.profile}`);
    }

    // 5. environment (.env file first, real environment wins)
    const effectiveEnv: Record<string, string> = {};
    const dotEnvSource = await readFileIfExists(userEnvFile(this.homeDir)).catch(() => null);
    if (dotEnvSource !== null) Object.assign(effectiveEnv, parseDotEnv(dotEnvSource));
    for (const [k, v] of Object.entries(this.env)) {
      if (typeof v === "string") effectiveEnv[k] = v;
    }
    merged = deepMerge(merged, envToOverlay(effectiveEnv, warn));

    // 6. runtime overrides
    if (this.overrides !== undefined) {
      merged = deepMerge(merged, this.overrides as ConfigOverlay);
    }

    this.current = validateConfig(merged);
    return this.current;
  }

  /** The resolved configuration. @throws {ConfigError} before `load()`. */
  public get config(): ResolvedUltraCodeConfig {
    if (this.current === null) {
      throw new ConfigError("Configuration not loaded yet — call load() first");
    }
    return this.current;
  }

  /**
   * Normalises a dotted path: structural segments accept snake_case or
   * camelCase; keys of open records (tool names, agent names, channels,
   * provider names) are kept verbatim.
   */
  private normalizePath(dottedPath: string): string[] {
    if (typeof dottedPath !== "string" || dottedPath.trim().length === 0) {
      throw new ConfigError(`Invalid config path: ${JSON.stringify(dottedPath)}`);
    }
    const rawSegments = dottedPath.split(".").map((s) => s.trim());
    if (rawSegments.some((s) => s.length === 0)) {
      throw new ConfigError(`Invalid config path: ${JSON.stringify(dottedPath)}`);
    }
    const out: string[] = [];
    let node: SpecNode | undefined = CONFIG_SPEC;
    for (const raw of rawSegments) {
      if (DANGEROUS_KEYS.has(raw) || DANGEROUS_KEYS.has(camelizeKey(raw))) {
        throw new ConfigError(`Invalid config path: ${JSON.stringify(dottedPath)}`);
      }
      if (node !== undefined && node.kind === "object") {
        const camel = camelizeKey(raw);
        if (node.keys[camel] !== undefined) {
          out.push(camel);
          node = node.keys[camel];
          continue;
        }
        if (node.open !== undefined) {
          out.push(node.open === "camel" ? camelizeKey(raw) : raw);
          node = node.openValue;
          continue;
        }
        out.push(camel);
        node = undefined;
        continue;
      }
      out.push(raw);
      node = undefined;
    }
    return out;
  }

  /**
   * Reads a value at a dotted path (e.g. `"core.max_tokens"` or
   * `"core.maxTokens"`). Returns `undefined` when the path does not exist.
   */
  public get(dottedPath: string): unknown {
    const segments = this.normalizePath(dottedPath);
    let cur: unknown = this.config;
    for (const seg of segments) {
      if (cur === null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }

  /**
   * Sets a value at a dotted path and re-validates the whole configuration.
   * The change is only committed when validation passes.
   *
   * @throws {ConfigError} for invalid paths or values (with the precise path).
   */
  public set(dottedPath: string, valueIn: unknown): void {
    const segments = this.normalizePath(dottedPath);
    const draft = structuredClone(this.config) as unknown as Record<string, unknown>;
    let cur: Record<string, unknown> = draft;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i] as string;
      const next = cur[seg];
      if (isPlainObject(next)) {
        cur = next;
      } else if (next === undefined) {
        const fresh: Record<string, unknown> = {};
        cur[seg] = fresh;
        cur = fresh;
      } else {
        throw new ConfigError(
          `Cannot set "${dottedPath}": "${segments.slice(0, i + 1).join(".")}" is not an object`,
        );
      }
    }
    cur[segments[segments.length - 1] as string] = structuredClone(valueIn);
    this.current = validateConfig(draft); // throws ConfigError on bad values
  }

  /**
   * Persists the current configuration as TOML, atomically (tmp + rename).
   * API keys are never written.
   *
   * @param scope - `"user"` → `~/.ultracode/config.toml`,
   *   `"project"` → `<cwd>/.ultracode/config.toml`.
   * @returns the absolute path of the written file.
   */
  public async save(scope: ConfigScope): Promise<string> {
    let file: string;
    if (scope === "user") {
      file = userConfigFile(this.homeDir);
    } else if (scope === "project") {
      const candidates = projectConfigCandidates(this.cwd);
      file = candidates[0] as string; // `.ultracode/config.toml`
    } else {
      throw new ConfigError(`Invalid save scope: ${JSON.stringify(scope)}`);
    }
    await atomicWriteFile(file, this.exportToml());
    this.logger.info(`Configuration saved: ${file}`);
    return file;
  }

  /** Serialises the current configuration to TOML (secrets stripped). */
  public exportToml(): string {
    return configToToml(this.config);
  }

  /**
   * Parses TOML text, merges it on top of the current configuration and
   * re-validates. On any error the previous state is kept.
   *
   * @throws {ConfigError} for broken TOML or schema violations.
   */
  public importToml(toml: string): void {
    if (typeof toml !== "string") {
      throw new ConfigError("importToml expects a TOML string");
    }
    const overlay = tomlToOverlay(parseTomlSource(toml, "<import>"), (m) =>
      this.logger.warn(`${m} (import)`),
    );
    const merged = deepMerge(
      structuredClone(this.config) as unknown as Record<string, unknown>,
      overlay,
    );
    this.current = validateConfig(merged);
  }

  /** Non-throwing validation of the current configuration. */
  public validate(): { valid: boolean; errors: string[] } {
    if (this.current === null) {
      return { valid: false, errors: ["configuration not loaded"] };
    }
    return checkConfig(this.current);
  }

  /**
   * A deep copy of the configuration with every secret masked — all values
   * under keys matching `*_api_key`/`apiKey`/`apiKeys` become
   * `"***REDACTED***"`. Safe for display and logging.
   */
  public redacted(): ResolvedUltraCodeConfig {
    const clone = structuredClone(this.config);
    const mask = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) mask(item);
        return;
      }
      if (!isPlainObject(node)) return;
      for (const key of Object.keys(node)) {
        const v = node[key];
        if (SECRET_KEY_RE.test(key)) {
          if (typeof v === "string") {
            node[key] = REDACTED;
          } else if (isPlainObject(v)) {
            for (const inner of Object.keys(v)) {
              if (typeof v[inner] === "string") v[inner] = REDACTED;
            }
          }
          continue;
        }
        mask(v);
      }
    };
    mask(clone as unknown as Record<string, unknown>);
    return clone;
  }
}

/**
 * Loads the fully-resolved UltraCode configuration (factory contract).
 *
 * Convenience wrapper around {@link ConfigManager}: construct, `load()`,
 * return the merged + validated config.
 */
export async function loadConfig(options: ConfigManagerOptions = {}): Promise<UltraCodeConfig> {
  const manager = new ConfigManager(options);
  return manager.load();
}
