/**
 * Project-wide constants shared across UltraCode packages.
 */

/** Current package/protocol version. */
export const VERSION = "0.1.0" as const;

/**
 * Candidate project-level config file names, in resolution order
 * (first match wins). Paths are relative to the project root.
 */
export const CONFIG_FILE_NAMES = [
  ".ultracode/config.toml",
  ".vibe/config.toml",
  ".ultracode.toml",
] as const;

/** User-level config directory (tilde-prefixed; expanded by the loader). */
export const USER_CONFIG_DIR = "~/.ultracode" as const;

/** User-level config file path. */
export const USER_CONFIG_FILE = "~/.ultracode/config.toml" as const;

/** User-level `.env` file path holding API keys. */
export const USER_ENV_FILE = "~/.ultracode/.env" as const;

/** Prefix for UltraCode-specific environment variables (e.g. `ULTRACODE_DEBUG`). */
export const ENV_PREFIX = "ULTRACODE_" as const;

/** Default directory for persisted sessions. */
export const DEFAULT_SESSION_DIR = "~/.ultracode/sessions" as const;

/** Directory holding user-authored system prompts. */
export const PROMPTS_DIR = "~/.ultracode/prompts" as const;

/** Hard cap on a single tool's output, in characters, before truncation. */
export const MAX_TOOL_OUTPUT_CHARS = 100_000 as const;

/** Default per-request provider timeout, in milliseconds. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000 as const;

/** Default maximum provider retry attempts. */
export const DEFAULT_MAX_RETRIES = 3 as const;

/** Default base retry delay, in milliseconds. */
export const DEFAULT_RETRY_DELAY_MS = 1_000 as const;

/** Default changelog file name. */
export const DEFAULT_CHANGELOG_FILE = "CHANGELOG.md" as const;
