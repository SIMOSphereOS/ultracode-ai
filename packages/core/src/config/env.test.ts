import { describe, expect, it } from "vitest";
import { envToOverlay, parseDotEnv } from "./env.js";

describe("parseDotEnv", () => {
  it("parses simple KEY=VALUE pairs", () => {
    expect(parseDotEnv("A=1\nB=two")).toEqual({ A: "1", B: "two" });
  });

  it("tolerates CRLF line endings and blank lines", () => {
    expect(parseDotEnv("A=1\r\n\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
  });

  it("skips comments and supports inline comments on unquoted values", () => {
    const out = parseDotEnv("# header\nA=1 # trailing\n  # indented comment\nB=2");
    expect(out).toEqual({ A: "1", B: "2" });
  });

  it("supports double quotes with escapes and single quotes verbatim", () => {
    const out = parseDotEnv('A="line1\\nline2"\nB=\'lit # not comment\'\nC="tab\\there"');
    expect(out).toEqual({ A: "line1\nline2", B: "lit # not comment", C: "tab\there" });
  });

  it("keeps # inside quoted values", () => {
    expect(parseDotEnv('KEY="abc#def"')).toEqual({ KEY: "abc#def" });
  });

  it("supports the export prefix", () => {
    expect(parseDotEnv("export MISTRAL_API_KEY=sk-123")).toEqual({
      MISTRAL_API_KEY: "sk-123",
    });
  });

  it("skips malformed lines instead of failing", () => {
    const out = parseDotEnv("NOEQUALS\n=novalue\n1BAD=x\nGOOD=1\nwhite space=2");
    expect(out).toEqual({ GOOD: "1" });
  });

  it("returns an empty object for empty input", () => {
    expect(parseDotEnv("")).toEqual({});
  });

  it("ignores prototype-pollution keys", () => {
    const out = parseDotEnv("__proto__=evil\nconstructor=evil\nOK=1");
    expect(Object.keys(out)).toEqual(["OK"]);
    expect(({} as Record<string, unknown>)["evil"]).toBeUndefined();
  });

  it("handles huge (>= 1 MB) input", () => {
    const huge = Array.from({ length: 50_000 }, (_, i) => `KEY_${i}=value_${i}`).join("\n");
    expect(huge.length).toBeGreaterThan(1_000_000);
    const out = parseDotEnv(huge);
    expect(Object.keys(out)).toHaveLength(50_000);
    expect(out["KEY_49999"]).toBe("value_49999");
  });

  it("preserves unicode and emoji values", () => {
    expect(parseDotEnv('K="ä🦊\\n𐍈"')).toEqual({ K: "ä🦊\n𐍈" });
  });
});

describe("envToOverlay", () => {
  const noWarn = (): void => undefined;

  it("maps provider API keys into providers.apiKeys", () => {
    const overlay = envToOverlay(
      {
        MISTRAL_API_KEY: "sk-m",
        ANTHROPIC_API_KEY: "sk-a",
        OPENAI_API_KEY: "sk-o",
      },
      noWarn,
    ) as { providers?: { apiKeys?: Record<string, string> } };
    expect(overlay.providers?.apiKeys).toEqual({
      mistral: "sk-m",
      anthropic: "sk-a",
      openai: "sk-o",
    });
  });

  it("maps the documented shortcuts", () => {
    const overlay = envToOverlay(
      {
        ULTRACODE_DEBUG: "true",
        ULTRACODE_THEME: "dracula",
        ULTRACODE_PROVIDER: "anthropic",
        ULTRACODE_MODEL: "claude-x",
      },
      noWarn,
    );
    expect(overlay).toEqual({
      core: { debug: true, activeProvider: "anthropic", activeModel: "claude-x" },
      ui: { theme: "dracula" },
    });
  });

  it("parses boolean spellings for ULTRACODE_DEBUG and warns on garbage", () => {
    expect(envToOverlay({ ULTRACODE_DEBUG: "0" }, noWarn)).toEqual({
      core: { debug: false },
    });
    const warnings: string[] = [];
    const overlay = envToOverlay({ ULTRACODE_DEBUG: "banana" }, (m) => warnings.push(m));
    expect(overlay).toEqual({});
    expect(warnings.some((w) => w.includes("ULTRACODE_DEBUG"))).toBe(true);
  });

  it("maps generic ULTRACODE_<SECTION>__<KEY> with type coercion", () => {
    const overlay = envToOverlay(
      {
        ULTRACODE_CORE__MAX_TOKENS: "4096",
        ULTRACODE_CORE__TEMPERATURE: "0.2",
        ULTRACODE_SESSIONS__ENABLE_PERSISTENCE: "false",
        ULTRACODE_PROVIDERS__PROXY__URL: "http://proxy:8080",
      },
      noWarn,
    );
    expect(overlay).toEqual({
      core: { maxTokens: 4096, temperature: 0.2 },
      sessions: { enablePersistence: false },
      providers: { proxy: { url: "http://proxy:8080" } },
    });
  });

  it("splits comma lists for array-typed slots", () => {
    const overlay = envToOverlay(
      { ULTRACODE_TOOLS__DISABLED: "bash, write_file ,," },
      noWarn,
    );
    expect(overlay).toEqual({ tools: { disabled: ["bash", "write_file"] } });
  });

  it("warns on unknown paths and unknown ULTRACODE_* names", () => {
    const warnings: string[] = [];
    const overlay = envToOverlay(
      {
        ULTRACODE_NOPE__KEY: "x",
        ULTRACODE_CORE__DOES_NOT_EXIST: "x",
        ULTRACODE_LONELY: "x",
      },
      (m) => warnings.push(m),
    );
    expect(overlay).toEqual({});
    expect(warnings).toHaveLength(3);
  });

  it("ignores unrelated environment variables", () => {
    expect(envToOverlay({ PATH: "/usr/bin", HOME: "/root" }, noWarn)).toEqual({});
  });

  it("warns when a numeric slot receives a non-number", () => {
    const warnings: string[] = [];
    const overlay = envToOverlay({ ULTRACODE_CORE__MAX_TOKENS: "many" }, (m) =>
      warnings.push(m),
    );
    expect(overlay).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it("never writes prototype-pollution paths", () => {
    const overlay = envToOverlay({ ULTRACODE___PROTO____X: "evil" }, noWarn) as Record<
      string,
      unknown
    >;
    expect(Object.prototype.hasOwnProperty.call(overlay, "__proto__")).toBe(false);
    expect(overlay).toEqual({});
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
  });
});
