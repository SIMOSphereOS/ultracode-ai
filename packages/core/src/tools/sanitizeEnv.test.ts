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

  it("keeps benign system variables", () => {
    for (const key of ["PATH", "HOME", "LANG", "SystemRoot", "TEMP", "API_KEY_PATH", "TOKEN_DIR"]) {
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
