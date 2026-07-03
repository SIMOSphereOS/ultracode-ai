/**
 * `core/config` — hierarchical configuration system.
 *
 * Public surface (factory contract):
 * - {@link loadConfig} — load and merge all configuration layers.
 * - {@link ConfigManager} — stateful manager with get/set/save/import/export.
 * - {@link resolveHome} — `~` expansion helper (cross-platform).
 */

export type { ConfigManagerOptions, ConfigScope } from "./ConfigManager.js";
export { ConfigManager, loadConfig } from "./ConfigManager.js";
export { envToOverlay, parseDotEnv } from "./env.js";
export type { ConfigOverlay, WarnFn } from "./mapping.js";

export {
  configToToml,
  parseTomlSource,
  tomlToOverlay,
} from "./mapping.js";
export {
  atomicWriteFile,
  profileFile,
  projectConfigCandidates,
  resolveHome,
  userConfigFile,
  userEnvFile,
} from "./paths.js";
export type { ProvidersRuntimeConfig, ResolvedUltraCodeConfig } from "./schema.js";
export {
  checkConfig,
  configSchema,
  KNOWN_THEMES,
  validateConfig,
} from "./schema.js";

export { CONFIG_SPEC, camelizeKey, snakeifyKey } from "./spec.js";
