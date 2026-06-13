/**
 * `ultracode --setup` — interactive first-run wizard.
 *
 * Asks for provider, API key (masked input, echoed as `*`), default agent and
 * theme. Provider/agent/theme are persisted through the facade's
 * ConfigManager (`set` + `save("user")`); the API key is written to
 * `~/.ultracode/.env` (keys never belong in `config.toml`, see
 * docs/GETTING-STARTED/configuration.md). The key is only ever echoed masked.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { ConfigError, USER_ENV_FILE } from "ultracode-shared";
import type { CliContext } from "../context.js";
import { safeDispose } from "../context.js";
import { ThemeManager } from "../themes/index.js";
import { resolveHome } from "../utils/resolve-home.js";
import { maskSecret } from "../utils/text.js";

/** Providers offered by the wizard. */
export const SETUP_PROVIDERS = ["mistral", "anthropic", "openai", "local"] as const;

/** Interaction surface of the wizard — injectable for tests. */
export interface SetupIO {
  /** Ask a question, echoing the user's input. */
  ask(question: string): Promise<string>;
  /** Ask a question with hidden input (echoed as `*`). */
  askMasked(question: string): Promise<string>;
  /** Write informational output. */
  write(s: string): void;
}

/**
 * Read one line from `ctx.stdin` in raw mode.
 * Handles Enter (`\r`/`\n`), backspace (`\b`/DEL) and Ctrl+C (returns "").
 * With `mask`, every typed character is echoed as `*`.
 */
function readLine(ctx: CliContext, prompt: string, mask: boolean): Promise<string> {
  ctx.stdout.write(prompt);
  const stdin = ctx.stdin;
  return new Promise((resolve) => {
    stdin.setRawMode?.(true);
    stdin.resume?.();
    let buf = "";
    const finish = (value: string): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause?.();
      ctx.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk: Buffer | string): void => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const ch of s) {
        if (ch === "\u0003") {
          finish("");
          return;
        }
        if (ch === "\r" || ch === "\n") {
          finish(buf);
          return;
        }
        if (ch === "\u007F" || ch === "\b") {
          if (buf.length > 0) {
            buf = Array.from(buf).slice(0, -1).join("");
            ctx.stdout.write("\b \b");
          }
          continue;
        }
        buf += ch;
        ctx.stdout.write(mask ? "*" : ch);
      }
    };
    stdin.on("data", onData);
  });
}

/** Default {@link SetupIO} backed by the context's stdin/stdout. */
export function createTerminalIO(ctx: CliContext): SetupIO {
  return {
    ask: (q) => readLine(ctx, q, false),
    askMasked: (q) => readLine(ctx, q, true),
    write: (s) => ctx.stdout.write(s),
  };
}

/**
 * Persist an API key into `~/.ultracode/.env` (created with mode 0600 where
 * supported). An existing entry for the same variable is replaced; other
 * lines — including `\r\n`-terminated ones — are preserved.
 *
 * @returns the absolute path of the env file.
 */
export async function writeApiKey(
  ctx: CliContext,
  provider: string,
  apiKey: string,
): Promise<string> {
  const envPath = resolveHome(USER_ENV_FILE, ctx.homedir);
  const varName = `${provider.toUpperCase()}_API_KEY`;
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  let lines: string[] = [];
  try {
    const existing = await fs.readFile(envPath, "utf8");
    lines = existing.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith(`${varName}=`));
  } catch {
    // no existing env file — start fresh
  }
  lines.push(`${varName}=${apiKey}`);
  await fs.writeFile(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  return envPath;
}

/**
 * Run the interactive setup wizard.
 *
 * @param ctx - CLI context.
 * @param io - interaction surface; defaults to a raw-mode terminal reader.
 * @throws {ConfigError} when an unknown provider is chosen.
 */
export async function runSetup(ctx: CliContext, io: SetupIO = createTerminalIO(ctx)): Promise<void> {
  io.write("UltraCode Setup\n\n");

  const provAnswer = (await io.ask(`Provider (${SETUP_PROVIDERS.join("/")}) [mistral]: `))
    .trim()
    .toLowerCase();
  const provider = provAnswer === "" ? "mistral" : provAnswer;
  if (!(SETUP_PROVIDERS as readonly string[]).includes(provider)) {
    throw new ConfigError(
      `Unknown provider "${provAnswer}". Choose one of: ${SETUP_PROVIDERS.join(", ")}`,
    );
  }

  let apiKey = "";
  if (provider !== "local") {
    apiKey = (await io.askMasked(`API key for ${provider} (input hidden, Enter to skip): `)).trim();
  }

  const agent = (await io.ask("Default agent [default]: ")).trim() || "default";

  const themes = new ThemeManager();
  const themeAnswer = (await io.ask(`Theme (${themes.list().join("/")}) [dark]: `)).trim();
  const theme = themes.has(themeAnswer) ? themes.get(themeAnswer).name : "dark";
  if (themeAnswer !== "" && !themes.has(themeAnswer)) {
    io.write(`! Unknown theme "${themeAnswer}" — falling back to "dark"\n`);
  }

  const facade = await ctx.createFacade({ cwd: ctx.cwd });
  try {
    const manager = facade.configManager;
    if (manager && typeof manager.set === "function" && typeof manager.save === "function") {
      manager.set("core.activeProvider", provider);
      manager.set("providers.default", provider);
      manager.set("core.defaultAgent", agent);
      manager.set("agents.default", agent);
      manager.set("ui.theme", theme);
      await manager.save("user");
      io.write("✓ configuration saved (user layer)\n");
    } else {
      io.write("! ConfigManager not available — provider/agent/theme were NOT persisted\n");
    }
    if (apiKey !== "") {
      const envPath = await writeApiKey(ctx, provider, apiKey);
      io.write(`✓ API key for ${provider} stored in ${envPath} (${maskSecret(apiKey)})\n`);
    }
    io.write(`\nDone. Provider: ${provider}, agent: ${agent}, theme: ${theme}\n`);
  } finally {
    await safeDispose(facade);
  }
}
