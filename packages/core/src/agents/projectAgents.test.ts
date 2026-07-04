import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectAgents } from "./projectAgents.js";

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "uc-project-agents-"));
});

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/** Absolute path to the project agents root for the current tmp cwd. */
function agentsRoot(): string {
  return path.join(cwd, ".ultracode", "agents");
}

/**
 * Write a `<cwd>/.ultracode/agents/<fileName>` file with the given raw contents
 * and return its absolute path. The agents layout is flat: one markdown file
 * per agent.
 */
async function writeAgentFile(fileName: string, raw: string): Promise<string> {
  await fs.mkdir(agentsRoot(), { recursive: true });
  const file = path.join(agentsRoot(), fileName);
  await fs.writeFile(file, raw, "utf8");
  return file;
}

/** A minimal, well-formed project agent markdown document. */
function agentDoc(over: {
  name?: string;
  description?: string;
  extra?: string;
  body?: string;
}): string {
  const lines = ["---"];
  if (over.name !== undefined) lines.push(`name: ${over.name}`);
  if (over.description !== undefined) lines.push(`description: ${over.description}`);
  if (over.extra !== undefined) lines.push(over.extra);
  lines.push("---");
  lines.push("");
  lines.push(over.body ?? "# Agent\n\nInstructions.");
  return `${lines.join("\n")}\n`;
}

function captureLogger(): { logger: Logger; warns: string[] } {
  const warns: string[] = [];
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (msg) => warns.push(msg),
    error: () => undefined,
  };
  return { logger, warns };
}

describe("loadProjectAgents", () => {
  it("returns [] when the .ultracode/agents directory is missing", async () => {
    // cwd exists but has no `.ultracode` at all.
    expect(await loadProjectAgents(cwd)).toEqual([]);
  });

  it("returns [] when the agents directory exists but is empty", async () => {
    await fs.mkdir(agentsRoot(), { recursive: true });
    expect(await loadProjectAgents(cwd)).toEqual([]);
  });

  it("builds a custom AgentDefinition from a valid agent file with the body as systemPrompt", async () => {
    await writeAgentFile(
      "reviewer.md",
      agentDoc({
        name: "reviewer",
        description: "Reviews code changes",
        body: "# Reviewer\n\nDu prüfst Diffs auf Fehler.",
      }),
    );

    const agents = await loadProjectAgents(cwd);
    expect(agents).toHaveLength(1);
    const a = agents[0]!;
    expect(a.name).toBe("reviewer");
    expect(a.description).toBe("Reviews code changes");
    expect(a.type).toBe("custom");
    // The markdown body after the frontmatter becomes the inline system prompt.
    expect(a.systemPrompt).toBe("# Reviewer\n\nDu prüfst Diffs auf Fehler.");
  });

  it("defaults description to an empty string when absent", async () => {
    await writeAgentFile("bare.md", agentDoc({ name: "bare" }));
    const agents = await loadProjectAgents(cwd);
    expect(agents).toHaveLength(1);
    expect(agents[0]!.description).toBe("");
    expect(agents[0]!.type).toBe("custom");
  });

  it("skips a file whose frontmatter has no name and warns", async () => {
    const { logger, warns } = captureLogger();
    await writeAgentFile("named.md", agentDoc({ name: "named", description: "ok" }));
    await writeAgentFile("nameless.md", agentDoc({ description: "no name here" }));
    const agents = await loadProjectAgents(cwd, { logger });
    expect(agents.map((a) => a.name)).toEqual(["named"]);
    expect(warns.some((w) => w.includes("project-agent"))).toBe(true);
  });

  it("skips a corrupt file (no frontmatter) and warns", async () => {
    const { logger, warns } = captureLogger();
    await writeAgentFile("broken.md", "no frontmatter at all, just prose");
    await writeAgentFile("good.md", agentDoc({ name: "good", description: "d" }));
    const agents = await loadProjectAgents(cwd, { logger });
    expect(agents.map((a) => a.name)).toEqual(["good"]);
    expect(warns.some((w) => w.includes("project-agent"))).toBe(true);
  });

  it("loads all agents name-sorted, ignoring non-.md files and sub-directories", async () => {
    await writeAgentFile("gamma.md", agentDoc({ name: "gamma", description: "g" }));
    await writeAgentFile("alpha.md", agentDoc({ name: "alpha", description: "a" }));
    await writeAgentFile("beta.md", agentDoc({ name: "beta", description: "b" }));
    // Stray non-markdown file and a sub-directory must be ignored.
    await fs.writeFile(path.join(agentsRoot(), "README.txt"), "not an agent", "utf8");
    await fs.mkdir(path.join(agentsRoot(), "nested.md"), { recursive: true });

    const agents = await loadProjectAgents(cwd);
    expect(agents.map((a) => a.name)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("collapses a list-valued frontmatter field to its first entry", async () => {
    await writeAgentFile(
      "listy.md",
      agentDoc({ extra: "name:\n  - primary\n  - secondary", description: "d" }),
    );
    const agents = await loadProjectAgents(cwd);
    expect(agents).toHaveLength(1);
    expect(agents[0]!.name).toBe("primary");
  });

  it("preserves Unicode in name, description and systemPrompt", async () => {
    await writeAgentFile(
      "unicode.md",
      agentDoc({
        name: "unicode",
        description: "café 日本語 🛡️",
        body: "# Körper\n\n𝕦𝕟𝕚 😀 Prüfung",
      }),
    );
    const agents = await loadProjectAgents(cwd);
    expect(agents[0]!.description).toBe("café 日本語 🛡️");
    expect(agents[0]!.systemPrompt).toBe("# Körper\n\n𝕦𝕟𝕚 😀 Prüfung");
  });

  it("returns [] and does not throw when the agents root read fails (non-ENOENT)", async () => {
    const { logger, warns } = captureLogger();
    await fs.mkdir(agentsRoot(), { recursive: true });
    vi.spyOn(fs, "readdir").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const agents = await loadProjectAgents(cwd, { logger });
    vi.restoreAllMocks();
    expect(agents).toEqual([]);
    expect(warns.some((w) => w.includes("project-agent"))).toBe(true);
  });

  it("skips an agent file that cannot be read and warns", async () => {
    const { logger, warns } = captureLogger();
    await writeAgentFile("unreadable.md", agentDoc({ name: "unreadable", description: "d" }));
    vi.spyOn(fs, "readFile").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const agents = await loadProjectAgents(cwd, { logger });
    vi.restoreAllMocks();
    expect(agents).toEqual([]);
    expect(warns.some((w) => w.includes("project-agent"))).toBe(true);
  });
});
