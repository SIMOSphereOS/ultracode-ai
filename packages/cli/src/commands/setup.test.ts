import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigError, DEFAULT_CONFIG } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliContext, UltraCodeFacade } from "../context.js";
import { createTerminalIO, runSetup, type SetupIO, writeApiKey } from "./setup.js";

class FakeStdin extends EventEmitter {
  isTTY = true;
  raw = false;
  setRawMode(mode: boolean): void {
    this.raw = mode;
  }
  resume(): void {}
  pause(): void {}
}

interface ManagerMock {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function makeManager(): ManagerMock {
  const store: Record<string, unknown> = {};
  return {
    store,
    get: vi.fn((p: string) => store[p]),
    set: vi.fn((p: string, v: unknown) => {
      store[p] = v;
    }),
    validate: vi.fn(),
    save: vi.fn(async () => {}),
  };
}

function makeFacade(manager?: ManagerMock): UltraCodeFacade {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    configManager: manager,
    dispose: vi.fn(async () => {}),
  } as unknown as UltraCodeFacade;
}

function makeCtx(facade: UltraCodeFacade, homedir: string) {
  let out = "";
  const stdin = new FakeStdin();
  const ctx: CliContext = {
    cwd: homedir,
    env: {},
    homedir,
    nodeVersion: "20.0.0",
    stdout: {
      write: (s: string) => {
        out += s;
      },
      isTTY: false,
    },
    stderr: { write: () => {}, isTTY: false },
    stdin,
    createFacade: vi.fn(async () => facade),
    gitVersion: vi.fn(async () => null),
  };
  return { ctx, stdin, out: () => out };
}

/** Scripted SetupIO that replays canned answers and records output. */
function scriptedIO(
  answers: string[],
): SetupIO & { output: () => string; maskedQuestions: string[] } {
  let out = "";
  const queue = [...answers];
  const maskedQuestions: string[] = [];
  return {
    ask: async () => queue.shift() ?? "",
    askMasked: async (q: string) => {
      maskedQuestions.push(q);
      return queue.shift() ?? "";
    },
    write: (s: string) => {
      out += s;
    },
    output: () => out,
    maskedQuestions,
  };
}

let tmp: string | undefined;
afterEach(async () => {
  if (tmp !== undefined)
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  tmp = undefined;
});

describe("runSetup", () => {
  it("persists provider/agent/theme via the ConfigManager and writes the key file", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const manager = makeManager();
    const facade = makeFacade(manager);
    const { ctx } = makeCtx(facade, tmp);
    const io = scriptedIO(["mistral", "sk-1234567890abc", "build", "dracula"]);

    await runSetup(ctx, io);

    expect(manager.store["core.activeProvider"]).toBe("mistral");
    expect(manager.store["providers.default"]).toBe("mistral");
    expect(manager.store["core.defaultAgent"]).toBe("build");
    expect(manager.store["agents.default"]).toBe("build");
    expect(manager.store["ui.theme"]).toBe("dracula");
    expect(manager.save).toHaveBeenCalledWith("user");

    const envFile = path.join(tmp, ".ultracode", ".env");
    const content = await fs.readFile(envFile, "utf8");
    expect(content).toContain("MISTRAL_API_KEY=sk-1234567890abc");

    // The key never appears unmasked in wizard output.
    expect(io.output()).not.toContain("sk-1234567890abc");
    expect(io.output()).toContain("sk-***");
    expect(facade.dispose).toHaveBeenCalled();
  });

  it("uses defaults for empty answers (mistral/default/dark) and skips empty key", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const manager = makeManager();
    const { ctx } = makeCtx(makeFacade(manager), tmp);
    const io = scriptedIO(["", "", "", ""]);

    await runSetup(ctx, io);

    expect(manager.store["core.activeProvider"]).toBe("mistral");
    expect(manager.store["ui.theme"]).toBe("dark");
    await expect(fs.access(path.join(tmp, ".ultracode", ".env"))).rejects.toThrow();
  });

  it("rejects unknown providers with ConfigError", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx } = makeCtx(makeFacade(makeManager()), tmp);
    await expect(runSetup(ctx, scriptedIO(["frobnicate"]))).rejects.toBeInstanceOf(ConfigError);
  });

  it("does not ask for an API key for the local provider", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx } = makeCtx(makeFacade(makeManager()), tmp);
    const io = scriptedIO(["local", "", ""]);
    await runSetup(ctx, io);
    expect(io.maskedQuestions).toHaveLength(0);
  });

  it("falls back to dark for unknown themes with a warning", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const manager = makeManager();
    const { ctx } = makeCtx(makeFacade(manager), tmp);
    const io = scriptedIO(["local", "", "solarized"]);
    await runSetup(ctx, io);
    expect(manager.store["ui.theme"]).toBe("dark");
    expect(io.output()).toContain('Unknown theme "solarized"');
  });

  it("warns instead of failing when no ConfigManager is available", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx } = makeCtx(makeFacade(undefined), tmp);
    const io = scriptedIO(["local", "", ""]);
    await runSetup(ctx, io);
    expect(io.output()).toContain("ConfigManager not available");
  });
});

describe("writeApiKey", () => {
  it("replaces an existing entry and preserves other lines (CRLF tolerant)", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx } = makeCtx(makeFacade(undefined), tmp);
    const envFile = path.join(tmp, ".ultracode", ".env");
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.writeFile(envFile, "OPENAI_API_KEY=old-key\r\nOTHER=1\r\n", "utf8");

    await writeApiKey(ctx, "openai", "new-key-123");

    const content = await fs.readFile(envFile, "utf8");
    expect(content).toContain("OPENAI_API_KEY=new-key-123");
    expect(content).toContain("OTHER=1");
    expect(content).not.toContain("old-key");
  });

  it("creates the env file and directory when absent", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx } = makeCtx(makeFacade(undefined), tmp);
    const envPath = await writeApiKey(ctx, "anthropic", "abc-123-def");
    expect(envPath).toBe(path.join(tmp, ".ultracode", ".env"));
    expect(await fs.readFile(envPath, "utf8")).toBe("ANTHROPIC_API_KEY=abc-123-def\n");
  });
});

describe("createTerminalIO", () => {
  it("echoes * for masked input and supports backspace", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx, stdin, out } = makeCtx(makeFacade(undefined), tmp);
    const io = createTerminalIO(ctx);
    const promise = io.askMasked("Key: ");
    stdin.emit("data", "abc");
    stdin.emit("data", "\u007F"); // backspace
    stdin.emit("data", "d\r");
    await expect(promise).resolves.toBe("abd");
    expect(out()).toContain("***"); // three masked chars
    expect(out()).not.toContain("abc");
  });

  it("echoes plain characters for unmasked questions", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx, stdin, out } = makeCtx(makeFacade(undefined), tmp);
    const io = createTerminalIO(ctx);
    const promise = io.ask("Agent: ");
    stdin.emit("data", Buffer.from("héllo🚀", "utf8"));
    stdin.emit("data", "\n");
    await expect(promise).resolves.toBe("héllo🚀");
    expect(out()).toContain("héllo🚀");
  });

  it("returns an empty string on Ctrl+C", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx, stdin } = makeCtx(makeFacade(undefined), tmp);
    const io = createTerminalIO(ctx);
    const promise = io.ask("Q: ");
    stdin.emit("data", "ab\u0003");
    await expect(promise).resolves.toBe("");
  });

  it("toggles raw mode around each question", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-setup-"));
    const { ctx, stdin } = makeCtx(makeFacade(undefined), tmp);
    const io = createTerminalIO(ctx);
    const promise = io.ask("Q: ");
    expect(stdin.raw).toBe(true);
    stdin.emit("data", "x\r");
    await promise;
    expect(stdin.raw).toBe(false);
  });
});
