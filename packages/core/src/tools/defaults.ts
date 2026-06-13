/**
 * Centralised, safe-by-default parameters for the tool system.
 *
 * These lists ship as the *default* hardening posture so that, on a first run
 * with no user override, the file tools cannot be used to clobber or exfiltrate
 * sensitive local files (credentials, private keys, dotfiles). They are applied
 * by {@link createToolSystem} only when the corresponding `tools.perTool` entry
 * does not already specify its own list — a user (or embedder) override of
 * `protectedExtensions` / `readDeny` replaces the default wholesale.
 *
 * Matching is performed case-insensitively against the file's *basename*:
 * - an entry beginning with `.` and containing no further `.` (e.g. `.env`) is
 *   treated as both an extension (`secrets.env`) and an exact dotfile name
 *   (`.env`) by {@link WriteFileTool}/{@link ReadTool};
 * - an entry with no leading dot (e.g. `id_rsa`) is an exact basename;
 * - a path-style entry (e.g. `.git/config`) matches when the resolved/target
 *   path ends with that segment.
 */

/**
 * Default `protected_extensions` applied to {@link WriteFileTool} unless the
 * user overrides `tools.perTool.write_file.protectedExtensions`.
 *
 * Blocks `write_file` from creating or overwriting credential / key material
 * and sensitive dotfiles out of the box. Overridable.
 */
export const DEFAULT_PROTECTED_EXTENSIONS: readonly string[] = Object.freeze([
  ".env",
  ".pem",
  ".key",
  "id_rsa",
  ".npmrc",
  ".git/config",
]);

/**
 * Default read-deny list applied to {@link ReadTool} unless the user overrides
 * `tools.perTool.read.readDeny`.
 *
 * Prevents `read` from exfiltrating credential / key material and sensitive
 * dotfiles out of the box. Kept in sync with
 * {@link DEFAULT_PROTECTED_EXTENSIONS} (a file you may not write is also a file
 * you may not read) and extended with read-only-sensitive paths. Overridable.
 */
export const DEFAULT_READ_DENY: readonly string[] = Object.freeze([
  ".env",
  ".pem",
  ".key",
  "id_rsa",
  ".npmrc",
  ".git/config",
]);
