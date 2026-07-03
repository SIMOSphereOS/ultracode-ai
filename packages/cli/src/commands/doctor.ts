/**
 * `ultracode doctor [--json]`
 *
 * Fully offline environment check: Node version, git availability, config
 * directory writability, config validity, API-key presence (masked — the key
 * value is never printed) and terminal capabilities. Critical failures set
 * exit code 1.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import type { Command } from "commander";
import { serializeError, USER_CONFIG_DIR } from "ultracode-shared";
import type { CliContext } from "../context.js";
import { safeDispose } from "../context.js";
import { resolveHome } from "../utils/resolve-home.js";
import { maskSecret } from "../utils/text.js";

/** Result of a single doctor check. */
export interface DoctorCheck {
  /** Stable check identifier. */
  name: string;
  /** Whether the check passed. */
  ok: boolean;
  /** Whether a failure of this check is fatal (drives the exit code). */
  critical: boolean;
  /** Human-readable detail (secrets always masked). */
  detail: string;
}

/** Aggregated doctor report. `ok` is false iff a *critical* check failed. */
export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

/** Injectable dependencies for {@link collectDoctorReport} (offline by design). */
export interface DoctorDeps {
  /** Node.js version string, e.g. `"20.11.1"`. */
  nodeVersion: string;
  /** Environment snapshot for API-key/colour checks. */
  env: NodeJS.ProcessEnv;
  /** Whether stdout is an interactive terminal. */
  isTTY: boolean;
  /** Resolve `git --version`, `null` when git is missing. */
  gitVersion(): Promise<string | null>;
  /** Resolved user config directory. */
  configDir: string;
  /** Probe write access; resolves `true` or an error description. */
  checkWritable(dir: string): Promise<true | string>;
  /** Load + validate the configuration (throws on failure). */
  loadConfig(): Promise<void>;
}

/** Environment variables checked for API-key presence. */
export const API_KEY_VARS = [
  "MISTRAL_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ULTRACODE_API_KEY",
] as const;

/** Minimum supported Node.js major version. */
export const MIN_NODE_MAJOR = 22;

/**
 * Minimum supported Node.js minor version *within* {@link MIN_NODE_MAJOR}.
 * A newer major satisfies the requirement regardless of its minor; only the
 * boundary major is gated on this minor. Mirrors the `engines.node`
 * (`>=22.13.0`) declared by every workspace package.
 */
export const MIN_NODE_MINOR = 13;

/** Default writability probe: mkdir -p, then create + delete a marker file. */
export async function defaultCheckWritable(dir: string): Promise<true | string> {
  const marker = path.join(dir, `.ultracode-doctor-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(marker, "doctor", "utf8");
    await fs.unlink(marker);
    return true;
  } catch (err) {
    return serializeError(err).message;
  }
}

/** Build the production {@link DoctorDeps} from a {@link CliContext}. */
export function makeDefaultDoctorDeps(ctx: CliContext): DoctorDeps {
  return {
    nodeVersion: ctx.nodeVersion,
    env: ctx.env,
    isTTY: ctx.stdout.isTTY === true,
    gitVersion: () => ctx.gitVersion(),
    configDir: resolveHome(USER_CONFIG_DIR, ctx.homedir),
    checkWritable: defaultCheckWritable,
    loadConfig: async () => {
      const facade = await ctx.createFacade({ cwd: ctx.cwd });
      await safeDispose(facade);
    },
  };
}

/** Run all doctor checks. Never throws — failures become `ok: false` checks. */
export async function collectDoctorReport(deps: DoctorDeps): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // 1. Node.js version (critical)
  const [majorRaw, minorRaw] = deps.nodeVersion.split(".");
  const major = Number.parseInt(majorRaw ?? "", 10);
  const minor = Number.parseInt(minorRaw ?? "", 10);
  const required = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;
  // A newer major always qualifies; the boundary major additionally requires
  // minor >= MIN_NODE_MINOR (an unparseable minor on the boundary major fails).
  const nodeOk =
    Number.isFinite(major) &&
    (major > MIN_NODE_MAJOR ||
      (major === MIN_NODE_MAJOR && Number.isFinite(minor) && minor >= MIN_NODE_MINOR));
  checks.push({
    name: "node",
    ok: nodeOk,
    critical: true,
    detail: nodeOk
      ? `Node.js v${deps.nodeVersion} (>= ${required} required)`
      : `Node.js v${deps.nodeVersion} is not supported — version ${required} or newer is required`,
  });

  // 2. git availability (non-critical)
  let git: string | null = null;
  try {
    git = await deps.gitVersion();
  } catch {
    git = null;
  }
  checks.push({
    name: "git",
    ok: git !== null,
    critical: false,
    detail: git !== null ? git : "git not found in PATH — versioning features are unavailable",
  });

  // 3. config directory writable (critical)
  let writable: true | string;
  try {
    writable = await deps.checkWritable(deps.configDir);
  } catch (err) {
    writable = serializeError(err).message;
  }
  checks.push({
    name: "config-dir",
    ok: writable === true,
    critical: true,
    detail:
      writable === true
        ? `config directory writable: ${deps.configDir}`
        : `config directory not writable (${deps.configDir}): ${writable}`,
  });

  // 4. configuration loads + validates (critical)
  try {
    await deps.loadConfig();
    checks.push({
      name: "config",
      ok: true,
      critical: true,
      detail: "configuration loaded and validated",
    });
  } catch (err) {
    const s = serializeError(err);
    checks.push({
      name: "config",
      ok: false,
      critical: true,
      detail: `configuration invalid: ${s.message}`,
    });
  }

  // 5. API keys (presence only, masked; non-critical)
  const present = API_KEY_VARS.filter((k) => {
    const v = deps.env[k];
    return typeof v === "string" && v.trim() !== "";
  });
  checks.push({
    name: "api-keys",
    ok: present.length > 0,
    critical: false,
    detail:
      present.length > 0
        ? present.map((k) => `${k}=${maskSecret(deps.env[k] ?? "")}`).join(", ")
        : "no API keys found in the environment — run `ultracode --setup`",
  });

  // 6. terminal capabilities (informational, non-critical)
  const colorHints: string[] = [];
  if (deps.env["NO_COLOR"] !== undefined) colorHints.push("colors disabled (NO_COLOR)");
  if (deps.env["TERM"] === "dumb") colorHints.push("TERM=dumb");
  checks.push({
    name: "terminal",
    ok: deps.isTTY,
    critical: false,
    detail: deps.isTTY
      ? `interactive TTY available${colorHints.length > 0 ? ` — ${colorHints.join(", ")}` : ""}`
      : "stdout is not a TTY — interactive mode unavailable (use `run -p`)",
  });

  const ok = checks.every((c) => c.ok || !c.critical);
  return { ok, checks };
}

/** Render a {@link DoctorReport} as a ✓/✗ checklist. */
export function renderDoctorReport(report: DoctorReport): string {
  const lines = ["UltraCode Doctor"];
  for (const c of report.checks) {
    lines.push(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  }
  lines.push(report.ok ? "✓ all critical checks passed" : "✗ critical problems found");
  return `${lines.join("\n")}\n`;
}

/** Register the `doctor` command on `program`. */
export function registerDoctorCommand(program: Command, ctx: CliContext): void {
  program
    .command("doctor")
    .description("check the local environment (offline) and report problems")
    .option("--json", "output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const report = await collectDoctorReport(makeDefaultDoctorDeps(ctx));
      if (opts.json) {
        ctx.stdout.write(`${JSON.stringify(report)}\n`);
      } else {
        ctx.stdout.write(renderDoctorReport(report));
      }
      if (!report.ok) process.exitCode = 1;
    });
}
