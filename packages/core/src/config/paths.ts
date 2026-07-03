/**
 * Cross-platform path helpers for the configuration system.
 *
 * All paths are built via `node:path` so the loader behaves identically on
 * Linux, macOS and Windows. Tilde-prefixed paths (as used by the shared
 * constants, e.g. `~/.ultracode/config.toml`) are expanded with
 * {@link resolveHome}, because `~` has no meaning outside POSIX shells.
 */

import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CONFIG_FILE_NAMES, ConfigError, USER_CONFIG_FILE, USER_ENV_FILE } from "ultracode-shared";

/**
 * Expands a leading `~` to the user's home directory.
 *
 * - `"~"` → home directory
 * - `"~/x/y"` or `"~\x\y"` → `path.join(home, "x/y")`
 * - Anything else (including `"~user/x"`) is returned unchanged.
 *
 * @param p - The path that may start with a tilde.
 * @param homeDir - Home directory override (defaults to `os.homedir()`).
 *   Primarily useful for tests and embedders.
 */
export function resolveHome(p: string, homeDir: string = os.homedir()): string {
  if (p === "~") return homeDir;
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(homeDir, p.slice(2));
  }
  return p;
}

/** Absolute path of the user-level config file (`~/.ultracode/config.toml`). */
export function userConfigFile(homeDir: string = os.homedir()): string {
  return resolveHome(USER_CONFIG_FILE, homeDir);
}

/** Absolute path of the user-level `.env` file (`~/.ultracode/.env`). */
export function userEnvFile(homeDir: string = os.homedir()): string {
  return resolveHome(USER_ENV_FILE, homeDir);
}

/**
 * Absolute path of a named profile file (`~/.ultracode/profiles/<name>.toml`).
 *
 * @throws {ConfigError} when the profile name contains path separators or
 *   traversal sequences (defence against `--profile ../../evil`).
 */
export function profileFile(profile: string, homeDir: string = os.homedir()): string {
  if (
    profile.length === 0 ||
    profile.includes("/") ||
    profile.includes("\\") ||
    profile.includes("..") ||
    profile.includes("\0")
  ) {
    throw new ConfigError(`Invalid profile name: ${JSON.stringify(profile)}`, {
      details: { profile },
    });
  }
  return path.join(homeDir, ".ultracode", "profiles", `${profile}.toml`);
}

/**
 * Candidate project-level config files for a working directory, in resolution
 * order (first existing file wins). The shared constants use `/` separators;
 * they are re-joined via `node:path` for Windows compatibility.
 */
export function projectConfigCandidates(cwd: string): string[] {
  return CONFIG_FILE_NAMES.map((rel) => path.join(cwd, ...rel.split("/")));
}

/**
 * Atomically writes `data` to `file` (UTF-8): the content is first written to
 * a unique temp file in the same directory and then `rename`d into place, so
 * readers never observe a half-written config. Parent directories are created
 * as needed.
 *
 * @throws {ConfigError} when the write or rename fails.
 */
export async function atomicWriteFile(file: string, data: string): Promise<void> {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, data, "utf8");
    await rename(tmp, file);
  } catch (cause) {
    await unlink(tmp).catch(() => undefined);
    throw new ConfigError(`Failed to write config file: ${file}`, {
      cause,
      details: { file },
    });
  }
}
