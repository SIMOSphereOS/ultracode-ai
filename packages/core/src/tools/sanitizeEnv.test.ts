import { describe, expect, it } from "vitest";

import { isSecretEnvKey, sanitizeEnv } from "./sanitizeEnv.js";

describe("isSecretEnvKey", () => {
  it("matches credential suffixes case-insensitively", () => {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "MISTRAL_API_KEY",
      "GITHUB_TOKEN",
      "my_token",
      "DB_PASSWORD",
      "SOME_SECRET",
      "AWS_SECRET",
      "VAULT_CREDENTIAL",
    ]) {
      expect(isSecretEnvKey(key)).toBe(true);
    }
  });

  it("covers both singular and plural CREDENTIALS (GCP style)", () => {
    // N1 regression: GOOGLE_APPLICATION_CREDENTIALS ends in the plural form.
    expect(isSecretEnvKey("GOOGLE_APPLICATION_CREDENTIALS")).toBe(true);
    expect(isSecretEnvKey("GOOGLE_CREDENTIALS")).toBe(true);
    expect(isSecretEnvKey("AZURE_CREDENTIAL")).toBe(true);
  });

  it("strips key-suffixed credentials the old suffix anchor leaked (P1 regression)", () => {
    // These all end in `_KEY` / are bare tokens and were KEPT by the previous
    // suffix-anchored /(_API_KEY|_TOKEN|_SECRET|PASSWORD|CREDENTIALS?)$/ pattern,
    // reaching the model via the bash tool's child stdout.
    for (const key of [
      "AWS_SECRET_ACCESS_KEY",
      "SSH_PRIVATE_KEY",
      "SECRET_KEY",
      "API_KEY",
      "ACCESS_KEY",
      "GCP_PRIVATE_KEY",
      "AZURE_ACCESS_KEY",
      "ENCRYPTION_KEY",
      "SIGNING_KEY",
      // bare / contains forms
      "SECRET",
      "TOKEN",
      "PASSWORD",
      // camelCase forms
      "awsSecretAccessKey",
      "sshPrivateKey",
    ]) {
      expect(isSecretEnvKey(key)).toBe(true);
    }
  });

  it("strips ID/NAME-suffixed keys that carry a standalone secret token (Vault AppRole)", () => {
    // The trailing ID/NAME reference carve-out must yield to an explicit secret
    // token: Vault AppRole `SECRET_ID` / `SECRET_NAME` are real credentials.
    for (const key of [
      "SECRET_ID",
      "SECRET_NAME",
      "VAULT_SECRET_ID",
      "APPROLE_SECRET_ID",
      "secret_id",
      "secretId",
    ]) {
      expect(isSecretEnvKey(key)).toBe(true);
    }
  });

  it("keeps benign credential-pointer vars even though they end in ID/NAME-like refs", () => {
    // Regression: pointers to a secret (not the secret itself) stay KEPT —
    // strong reference suffixes (PATH/DIR/FILE/URL/URI) always hold, and ID/NAME
    // refs without a standalone secret token stay (e.g. PROVIDER_NAME).
    for (const key of [
      "API_KEY_PATH",
      "TOKEN_DIR",
      "TOKEN_ENDPOINT_URL",
      "AWS_SHARED_CREDENTIALS_FILE",
      "SECRET_KEY_FILE",
      "PROVIDER_NAME",
      "USER_NAME",
      "REQUEST_ID",
    ]) {
      expect(isSecretEnvKey(key)).toBe(false);
    }
  });

  it("keeps benign system variables and credential references (no over-match)", () => {
    for (const key of [
      "PATH",
      "HOME",
      "LANG",
      "SystemRoot",
      "TEMP",
      // references to a secret (path/dir/file/url/name) — not the secret itself
      "API_KEY_PATH",
      "TOKEN_DIR",
      "AWS_SHARED_CREDENTIALS_FILE",
      "SECRET_KEY_FILE",
      "PASSWORD_POLICY_URL",
      "TOKEN_ENDPOINT_URL",
      // secret-looking substrings inside larger words must NOT match
      "KEYBOARD",
      "TOKENIZER",
      "KEYCHAIN_ROOT",
      "MONKEY",
    ]) {
      expect(isSecretEnvKey(key)).toBe(false);
    }
  });

  it("drops keys in the explicit denylist (upper-cased exact match)", () => {
    const extra = new Set(["MY_CUSTOM_PROVIDER", "ULTRACODE_MY_CUSTOM_PROVIDER"]);
    expect(isSecretEnvKey("MY_CUSTOM_PROVIDER", extra)).toBe(true);
    expect(isSecretEnvKey("my_custom_provider", extra)).toBe(true);
    expect(isSecretEnvKey("UNRELATED", extra)).toBe(false);
  });
});

describe("sanitizeEnv", () => {
  it("removes credentials while preserving everything else", () => {
    const out = sanitizeEnv({
      ANTHROPIC_API_KEY: "sk-secret",
      GOOGLE_APPLICATION_CREDENTIALS: "/path/creds.json",
      PATH: "/usr/bin",
      HOME: "/home/u",
      UC_BENIGN: "visible",
    });
    expect(out).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(out).not.toHaveProperty("GOOGLE_APPLICATION_CREDENTIALS");
    expect(out.PATH).toBe("/usr/bin");
    expect(out.HOME).toBe("/home/u");
    expect(out.UC_BENIGN).toBe("visible");
  });

  it("returns a fresh copy and never mutates the source", () => {
    const src = { ANTHROPIC_API_KEY: "x", PATH: "/bin" } as const;
    const out = sanitizeEnv(src);
    expect(out).not.toBe(src);
    expect(src.ANTHROPIC_API_KEY).toBe("x");
  });

  it("applies the extra denylist (provider keys)", () => {
    const out = sanitizeEnv({ MY_PROVIDER: "k", PATH: "/bin" }, new Set(["MY_PROVIDER"]));
    expect(out).not.toHaveProperty("MY_PROVIDER");
    expect(out.PATH).toBe("/bin");
  });

  it("handles an empty environment", () => {
    expect(sanitizeEnv({})).toEqual({});
  });
});
