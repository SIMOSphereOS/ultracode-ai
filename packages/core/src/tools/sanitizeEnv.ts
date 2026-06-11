/**
 * Credential sanitization for `system`-category tools.
 *
 * Any tool that spawns a child process and feeds its output back to the LLM
 * (above all {@link BashTool}) is an exfiltration channel for secrets that
 * happen to live in the environment it inherits. {@link sanitizeEnv} strips
 * known credential variables from an environment snapshot before it is handed
 * to such a process.
 *
 * The default environment handed to tools is `process.env` **minus** these
 * credentials (defence in depth: even when an embedder forgets to scope
 * `options.env`, secrets never reach a shell child whose stdout the model can
 * read).
 *
 * This is pure (no I/O), synchronous and cross-platform; benign system
 * variables (`PATH`, `HOME`, `LANG`, `SystemRoot`, `TEMP`, …) are preserved.
 */

/**
 * Variable-name patterns treated as secrets. Matched case-insensitively against
 * the *whole* key. Suffix anchors (`$`) so e.g. `MY_API_KEY` is dropped but a
 * harmless `API_KEY_PATH` would not be (it does not end in the secret token).
 */
const SECRET_KEY_PATTERN = /(_API_KEY|_TOKEN|_SECRET|PASSWORD|CREDENTIAL)$/i;

/**
 * `true` when `key` names a credential that must never reach a child process.
 *
 * A key is a secret when it matches {@link SECRET_KEY_PATTERN} or appears in
 * the explicit `extraSecretKeys` denylist (case-insensitive), which carries the
 * provider keys assembled by the config loader (`config.providers.apiKeys`).
 */
export function isSecretEnvKey(key: string, extraSecretKeys?: ReadonlySet<string>): boolean {
  if (SECRET_KEY_PATTERN.test(key)) return true;
  if (extraSecretKeys !== undefined && extraSecretKeys.size > 0) {
    return extraSecretKeys.has(key.toUpperCase());
  }
  return false;
}

/**
 * Return a copy of `env` with all credential variables removed.
 *
 * @param env - source environment (e.g. `ctx.env`, ultimately `process.env`).
 * @param extraSecretKeys - additional exact key names to drop (upper-cased),
 *   typically the configured provider API-key variable names plus their
 *   `ULTRACODE_`-prefixed aliases.
 */
export function sanitizeEnv(
  env: Readonly<Record<string, string | undefined>>,
  extraSecretKeys?: ReadonlySet<string>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    if (isSecretEnvKey(key, extraSecretKeys)) continue;
    out[key] = env[key];
  }
  return out;
}
