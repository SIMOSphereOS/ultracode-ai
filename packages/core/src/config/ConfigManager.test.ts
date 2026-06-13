import * as os from "node:os";
import * as path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "ultracode-shared";
import type { Logger } from "ultracode-shared";
import { ConfigManager, loadConfig } from "./ConfigManager.js";
import { parseTomlSource, tomlToOverlay } from "./mapping.js";

/** Collects log lines per level for assertions. */
function collectingLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (msg) => warnings.push(msg),
    error: () => undefined,
  };
  return { logger, warnings };
}

describe("ConfigManager", () => {
  let homeDir: string;
  let cwd: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(os.tmpdir(), "ultracode-home-"));
    cwd = await mkdtemp(path.join(os.tmpdir(), "ultracode-cwd-"));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  async function writeUserConfig(toml: string): Promise<void> {
    await mkdir(path.join(homeDir, ".ultracode"), { recursive: true });
    await writeFile(path.join(homeDir, ".ultracode", "config.toml"), toml, "utf8");
  }

  async function writeProjectConfig(rel: string[], toml: string): Promise<void> {
    const file = path.join(cwd, ...rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, toml, "utf8");
  }

  function manager(extra: ConstructorParameters<typeof ConfigManager>[0] = {}): ConfigManager {
    return new ConfigManager({ cwd, homeDir, env: {}, ...extra });
  }

  describe("load", () => {
    it("yields the defaults when no files exist (missing files are no error)", async () => {
      const config = await manager().load();
      expect(config.core.activeModel).toBe("mistral-large");
      expect(config.ui.theme).toBe("dark");
      expect(config.providers.apiKeys).toEqual({});
    });

    it("treats an empty config file as no-op", async () => {
      await writeUserConfig("");
      const config = await manager().load();
      expect(config.core.maxTokens).toBe(32000);
    });

    it("applies layer priority: defaults < user < project < profile < env < overrides", async () => {
      await writeUserConfig(
        '[core]\nlanguage = "user"\nmax_tokens = 1\ntemperature = 0.1\ndefault_agent = "user"\n[ui]\ntheme = "light"\n',
      );
      await writeProjectConfig(
        [".ultracode", "config.toml"],
        '[core]\nmax_tokens = 2\ntemperature = 0.2\ndefault_agent = "project"\n',
      );
      await mkdir(path.join(homeDir, ".ultracode", "profiles"), { recursive: true });
      await writeFile(
        path.join(homeDir, ".ultracode", "profiles", "work.toml"),
        '[core]\ntemperature = 0.3\ndefault_agent = "profile"\n',
        "utf8",
      );
      const config = await manager({
        profile: "work",
        env: { ULTRACODE_CORE__DEFAULT_AGENT: "env" },
        overrides: { core: { activeModel: "override-model" } },
      }).load();

      expect(config.core.language).toBe("user"); // only user layer sets it
      expect(config.core.maxTokens).toBe(2); // project > user
      expect(config.core.temperature).toBe(0.3); // profile > project
      expect(config.core.defaultAgent).toBe("env"); // env > profile
      expect(config.core.activeModel).toBe("override-model"); // overrides > env
      expect(config.ui.theme).toBe("light");
    });

    it("uses the first existing project config candidate", async () => {
      await writeProjectConfig([".vibe", "config.toml"], "[core]\nmax_tokens = 111\n");
      await writeProjectConfig([".ultracode.toml"], "[core]\nmax_tokens = 222\n");
      const config = await manager().load();
      expect(config.core.maxTokens).toBe(111); // .vibe wins over .ultracode.toml
    });

    it("loads API keys from ~/.ultracode/.env, real env wins", async () => {
      await mkdir(path.join(homeDir, ".ultracode"), { recursive: true });
      await writeFile(
        path.join(homeDir, ".ultracode", ".env"),
        "MISTRAL_API_KEY=sk-from-dotenv\nOPENAI_API_KEY=sk-openai\n",
        "utf8",
      );
      const config = await manager({ env: { MISTRAL_API_KEY: "sk-from-env" } }).load();
      expect(config.providers.apiKeys["mistral"]).toBe("sk-from-env");
      expect(config.providers.apiKeys["openai"]).toBe("sk-openai");
    });

    it("throws ConfigError with line info for broken TOML", async () => {
      await writeUserConfig("[core]\nmax_tokens = = broken\n");
      let caught: unknown;
      try {
        await manager().load();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as ConfigError).message).toMatch(/line 2/);
      expect((caught as ConfigError).message).toContain("config.toml");
    });

    it("throws ConfigError for an unknown profile", async () => {
      await expect(manager({ profile: "nope" }).load()).rejects.toThrow(ConfigError);
      await expect(manager({ profile: "nope" }).load()).rejects.toThrow(/nope/);
    });

    it("rejects malicious profile names fail-fast", async () => {
      await expect(manager({ profile: "../escape" }).load()).rejects.toThrow(ConfigError);
    });

    it("warns about unknown keys but keeps loading", async () => {
      const { logger, warnings } = collectingLogger();
      await writeUserConfig("[core]\nshiny_new_option = true\nmax_tokens = 7\n");
      const config = await manager({ logger }).load();
      expect(config.core.maxTokens).toBe(7);
      expect(warnings.some((w) => w.includes("core.shiny_new_option"))).toBe(true);
    });

    it("rejects invalid merged values via ConfigError with path", async () => {
      await writeUserConfig("[core]\ntemperature = 3.5\n");
      await expect(manager().load()).rejects.toThrow(/core\.temperature/);
    });

    it("is immune to prototype pollution via TOML keys", async () => {
      await writeUserConfig('[__proto__]\npolluted = "yes"\n[core]\nmax_tokens = 9\n');
      const config = await manager().load();
      expect(config.core.maxTokens).toBe(9);
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(config, "__proto__")).toBe(false);
    });

    it("handles a huge (>= 1 MB) config file", async () => {
      const big = "🦊x".repeat(300_000);
      await writeUserConfig(`[agents.big]\nsystem_prompt_id = "${big}"\n`);
      const config = await manager().load();
      expect(config.agents.agents["big"]?.systemPromptId).toBe(big);
    });
  });

  describe("get/set", () => {
    it("reads values via dotted paths in snake_case or camelCase", async () => {
      const m = manager();
      await m.load();
      expect(m.get("core.max_tokens")).toBe(32000);
      expect(m.get("core.maxTokens")).toBe(32000);
      expect(m.get("providers.local.endpoint")).toBe("http://localhost:11434");
      expect(m.get("does.not.exist")).toBeUndefined();
    });

    it("set validates and commits", async () => {
      const m = manager();
      await m.load();
      m.set("core.temperature", 0.05);
      expect(m.config.core.temperature).toBe(0.05);
      m.set("tools.perTool.write_file.permission", "never");
      expect(m.config.tools.perTool["write_file"]?.permission).toBe("never");
    });

    it("set with an invalid value throws ConfigError and keeps the old state", async () => {
      const m = manager();
      await m.load();
      expect(() => m.set("core.temperature", 9)).toThrow(/core\.temperature/);
      expect(m.config.core.temperature).toBe(0.7);
      expect(() => m.set("ui.theme", "neon-zebra")).toThrow(ConfigError);
      expect(() => m.set("core.maxTokens", "lots")).toThrow(ConfigError);
    });

    it("rejects invalid paths", async () => {
      const m = manager();
      await m.load();
      expect(() => m.set("", 1)).toThrow(ConfigError);
      expect(() => m.set("core..debug", true)).toThrow(ConfigError);
      expect(() => m.set("__proto__.x", 1)).toThrow(ConfigError);
      expect(() => m.set("core.language.deeper", 1)).toThrow(ConfigError);
    });

    it("config getter throws before load()", () => {
      expect(() => manager().config).toThrow(ConfigError);
    });
  });

  describe("save / exportToml / importToml", () => {
    it("saves atomically to user scope and the result is reloadable", async () => {
      const m = manager();
      await m.load();
      m.set("core.default_agent", "review");
      const file = await m.save("user");
      expect(file).toBe(path.join(homeDir, ".ultracode", "config.toml"));
      const reloaded = await manager().load();
      expect(reloaded.core.defaultAgent).toBe("review");
    });

    it("saves to project scope at .ultracode/config.toml", async () => {
      const m = manager();
      await m.load();
      m.set("ui.theme", "monokai");
      const file = await m.save("project");
      expect(file).toBe(path.join(cwd, ".ultracode", "config.toml"));
      const text = await readFile(file, "utf8");
      expect(text).toContain('theme = "monokai"');
    });

    it("rejects invalid scopes", async () => {
      const m = manager();
      await m.load();
      await expect(m.save("global" as unknown as "user")).rejects.toThrow(ConfigError);
    });

    it("never persists API keys via save or exportToml", async () => {
      const m = manager({ env: { MISTRAL_API_KEY: "sk-very-secret" } });
      await m.load();
      expect(m.config.providers.apiKeys["mistral"]).toBe("sk-very-secret");
      const file = await m.save("user");
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("sk-very-secret");
      expect(m.exportToml()).not.toContain("sk-very-secret");
    });

    it("importToml merges and validates; bad input keeps the old state", async () => {
      const m = manager();
      await m.load();
      m.importToml('[core]\nmax_tokens = 777\n[ui]\ntheme = "dracula"\n');
      expect(m.config.core.maxTokens).toBe(777);
      expect(m.config.ui.theme).toBe("dracula");

      expect(() => m.importToml("not == toml")).toThrow(ConfigError);
      expect(() => m.importToml("[core]\ntemperature = 42\n")).toThrow(/core\.temperature/);
      expect(m.config.core.maxTokens).toBe(777); // unchanged after failures
    });

    it("export → import round-trips", async () => {
      const m = manager();
      await m.load();
      m.set("tools.perTool.grep.maxMatches", 42);
      const toml = m.exportToml();
      const m2 = manager();
      await m2.load();
      m2.importToml(toml);
      expect(m2.config).toEqual(m.config);
    });
  });

  describe("validate / redacted", () => {
    it("validate reports ok for a loaded config", async () => {
      const m = manager();
      await m.load();
      expect(m.validate()).toEqual({ valid: true, errors: [] });
    });

    it("validate reports not-loaded before load()", () => {
      expect(manager().validate().valid).toBe(false);
    });

    it("redacted masks every *_api_key / apiKey field but keeps the original intact", async () => {
      await writeUserConfig('[providers]\nanthropic_api_key = "sk-ant-123"\n');
      const m = manager({ env: { MISTRAL_API_KEY: "sk-mst-456" } });
      await m.load();
      const red = m.redacted();
      expect(red.providers.apiKeys).toEqual({
        anthropic: "***REDACTED***",
        mistral: "***REDACTED***",
      });
      // original untouched
      expect(m.config.providers.apiKeys["mistral"]).toBe("sk-mst-456");
      expect(JSON.stringify(red)).not.toContain("sk-ant-123");
      expect(JSON.stringify(red)).not.toContain("sk-mst-456");
    });

    it("redacted does not mask apiKeyEnv (an env-var name, not a secret)", async () => {
      const m = manager({
        overrides: {
          mcpServers: [
            { name: "b", transport: "http", url: "http://x", apiKeyEnv: "BROWSER_API_KEY" },
          ],
        },
      });
      await m.load();
      expect(m.redacted().mcpServers[0]?.apiKeyEnv).toBe("BROWSER_API_KEY");
    });
  });

  describe("error simulation", () => {
    it("wraps unreadable config files in ConfigError (path is a directory)", async () => {
      // `config.toml` exists but is a directory → EISDIR on read.
      await mkdir(path.join(homeDir, ".ultracode", "config.toml"), { recursive: true });
      await expect(manager().load()).rejects.toThrow(ConfigError);
    });

    it("a corrupt .env never crashes the load", async () => {
      await mkdir(path.join(homeDir, ".ultracode"), { recursive: true });
      await writeFile(
        path.join(homeDir, ".ultracode", ".env"),
        "  garbage == \nMISTRAL_API_KEY=sk-ok\n",
        "utf8",
      );
      const config = await manager().load();
      expect(config.providers.apiKeys["mistral"]).toBe("sk-ok");
    });
  });
});

describe("loadConfig factory", () => {
  it("returns the resolved config in one call", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "ultracode-home-"));
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ultracode-cwd-"));
    try {
      const config = await loadConfig({
        cwd,
        env: {},
        overrides: { core: { language: "de" } },
        homeDir,
      });
      expect(config.core.language).toBe("de");
      expect(config.versioning.strategy).toBe("semantic");
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("windows-style path handling", () => {
  it("builds all internal paths via node:path (no hardcoded separators)", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "ultracode-home-"));
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ultracode-cwd-"));
    try {
      // CRLF content must parse identically (Windows files).
      await mkdir(path.join(cwd, ".ultracode"), { recursive: true });
      await writeFile(
        path.join(cwd, ".ultracode", "config.toml"),
        "[core]\r\nmax_tokens = 4242\r\n",
        "utf8",
      );
      const config = await loadConfig({ cwd, env: {}, homeDir });
      expect(config.core.maxTokens).toBe(4242);
      // sanity: overlay parsing is separator-agnostic
      const overlay = tomlToOverlay(
        parseTomlSource('[sessions]\nsave_dir = "C:\\\\Users\\\\dev\\\\sessions"\n', "w"),
        () => undefined,
      );
      expect(overlay).toEqual({ sessions: { saveDir: "C:\\Users\\dev\\sessions" } });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
