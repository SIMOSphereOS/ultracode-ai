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
 * Secret *tokens* matched on whole-token boundaries against the variable name.
 *
 * A key is split into tokens on any non-alphanumeric boundary AND on
 * lower→upper case transitions (so `accessKey` → `access`, `key`). If any of
 * these tokens — or known multi-word combinations (`ACCESS_KEY`, `PRIVATE_KEY`,
 * `SECRET_ACCESS_KEY`) — appears, the key is a secret.
 *
 * Token-boundary matching is deliberately strict so that we strip the leaky
 * cases the old suffix-anchored pattern missed (`AWS_SECRET_ACCESS_KEY` ends in
 * `_KEY`; `SSH_PRIVATE_KEY`, `SECRET_KEY`, bare `API_KEY`/`SECRET`/`TOKEN`)
 * WITHOUT over-matching innocuous names whose secret-looking substring is part
 * of a larger word: `KEYBOARD`, `TOKENIZER`, `PASSWORD_POLICY_URL`,
 * `API_KEY_PATH` (the standalone `PATH`/`DIR`/`FILE`/`URL`/`NAME` token marks
 * it as a *reference to* a secret, not the secret itself).
 */

/** Standalone tokens that unconditionally mark a key as a secret. */
const SECRET_TOKENS: ReadonlySet<string> = new Set([
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "PASSWD",
  "CREDENTIAL",
  "CREDENTIALS",
  "APIKEY", // e.g. AWS_APIKEY (single-token form)
]);

/**
 * Trailing tokens that demote an otherwise-secret key to a benign *reference*
 * (a path/handle to a credential, not the credential value itself). Mirrors the
 * old `API_KEY_PATH` / `TOKEN_DIR` carve-outs.
 *
 * Split into two strengths because not every reference suffix is equally safe:
 * `PATH`/`DIR`/`FILE`/`URL`/`URI` name a *location* of a credential and never a
 * credential themselves, so they hold unconditionally. `ID`/`NAME`, by contrast,
 * are routinely the secret itself (HashiCorp Vault AppRole `SECRET_ID`,
 * `SECRET_NAME`) — there the demotion must yield to an explicit standalone
 * secret token.
 */
const STRONG_REFERENCE_SUFFIX_TOKENS: ReadonlySet<string> = new Set([
  "PATH",
  "DIR",
  "FILE",
  "URL",
  "URI",
]);

/**
 * Weak reference suffixes (`ID`/`NAME`): they demote an otherwise-secret key to
 * a reference UNLESS the key also carries a standalone secret token (e.g.
 * `SECRET_ID` is Vault's AppRole secret, not a benign handle). Checked after
 * standalone-secret detection so the explicit secret token wins.
 */
const WEAK_REFERENCE_SUFFIX_TOKENS: ReadonlySet<string> = new Set(["NAME", "ID"]);

/**
 * Split a variable name into upper-cased tokens on non-alphanumeric boundaries
 * and camelCase humps (`accessKey` → `ACCESS`, `KEY`; `AWS_SECRET_ACCESS_KEY`
 * → `AWS`, `SECRET`, `ACCESS`, `KEY`).
 */
function tokenize(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length > 0)
    .map((t) => t.toUpperCase());
}

/**
 * `true` when `key` names a credential that must never reach a child process.
 *
 * Detection is token-boundary based (see module notes): a key is a secret when,
 * after splitting on separators and camelCase humps, it contains a standalone
 * secret token (`SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL(S)`) or a secret
 * key/token pair (`API`+`KEY`, `ACCESS`+`KEY`, `PRIVATE`+`KEY`) — unless the
 * key's final token marks it as a mere *reference* (`…_PATH`, `…_DIR`, `…_FILE`,
 * `…_URL`). A *weak* reference suffix (`…_ID`, `…_NAME`) demotes too, but only
 * when no standalone secret token is present: `SECRET_ID` / `SECRET_NAME`
 * (Vault AppRole) are stripped, while `API_KEY_PATH` / `TOKEN_DIR` stay. The
 * explicit `extraSecretKeys` denylist (case-insensitive exact match) always
 * wins; it carries the provider keys assembled by the config loader
 * (`config.providers.apiKeys`).
 */
export function isSecretEnvKey(key: string, extraSecretKeys?: ReadonlySet<string>): boolean {
  if (extraSecretKeys !== undefined && extraSecretKeys.size > 0 && extraSecretKeys.has(key.toUpperCase())) {
    return true;
  }

  const tokens = tokenize(key);
  if (tokens.length === 0) return false;

  // A strong trailing reference token (PATH/DIR/FILE/URL/URI) names a *location*
  // of a credential, never the credential itself — keep it unconditionally.
  const lastToken = tokens[tokens.length - 1];
  if (lastToken !== undefined && STRONG_REFERENCE_SUFFIX_TOKENS.has(lastToken)) return false;

  const tokenSet = new Set(tokens);

  // Standalone secret words: SECRET, TOKEN, PASSWORD, CREDENTIAL(S), APIKEY.
  // Checked BEFORE the weak ID/NAME demotion so an explicit secret token wins
  // (e.g. Vault `SECRET_ID` / `SECRET_NAME` are real credentials, not handles).
  for (const t of tokens) {
    if (SECRET_TOKENS.has(t)) return true;
  }

  // A weak trailing reference token (ID/NAME) demotes the key to a reference
  // only when it carries no standalone secret token (handled above).
  if (lastToken !== undefined && WEAK_REFERENCE_SUFFIX_TOKENS.has(lastToken)) return false;

  // Key/token pairs: a "KEY" token preceded anywhere by API / ACCESS / PRIVATE /
  // SECRET / ENCRYPTION / SIGNING is a credential (covers AWS_SECRET_ACCESS_KEY,
  // SSH_PRIVATE_KEY, GCP_ACCESS_KEY, API_KEY, bare SECRET_KEY). A bare "KEY"
  // alone (e.g. KEYBOARD already excluded by tokenization) is NOT stripped.
  if (tokenSet.has("KEY")) {
    for (const qualifier of ["API", "ACCESS", "PRIVATE", "SECRET", "ENCRYPTION", "SIGNING"]) {
      if (tokenSet.has(qualifier)) return true;
    }
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
