/**
 * `core/config` — hierarchical configuration system.
 *
 * Public surface (factory contract):
 * - {@link loadConfig} — load and merge all configuration layers.
 * - {@link ConfigManager} — stateful manager with get/set/save/import/export.
 * - {@link resolveHome} — `~` expansion helper (cross-platform).
 */

export { loadConfig, ConfigManager } from "./ConfigManager.js";
export type { ConfigManagerOptions, ConfigScope } from "./ConfigManager.js";

export {
  resolveHome,
  userConfigFile,
  userEnvFile,
  profileFile,
  projectConfigCandidates,
  atomicWriteFile,
} from "./paths.js";

export { parseDotEnv, envToOverlay } from "./env.js";

export {
  parseTomlSource,
  tomlToOverlay,
  configToToml,
} from "./mapping.js";
export type { ConfigOverlay, WarnFn } from "./mapping.js";

export {
  configSchema,
  validateConfig,
  checkConfig,
  KNOWN_THEMES,
} from "./schema.js";
export type { ResolvedUltraCodeConfig, ProvidersRuntimeConfig } from "./schema.js";

export { camelizeKey, snakeifyKey, CONFIG_SPEC } from "./spec.js";
