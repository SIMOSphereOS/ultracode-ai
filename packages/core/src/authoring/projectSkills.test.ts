import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectSkills } from "./projectSkills.js";

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "uc-project-skills-"));
});

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/** Absolute path to the project skills root for the current tmp cwd. */
function skillsRoot(): string {
  return path.join(cwd, ".ultracode", "skills");
}

/**
 * Write a `<cwd>/.ultracode/skills/<name>/SKILL.md` file with the given raw
 * contents and return its absolute path.
 */
async function writeSkillFile(dirName: string, raw: string): Promise<string> {
  const dir = path.join(skillsRoot(), dirName);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  await fs.writeFile(file, raw, "utf8");
  return file;
}

/** A minimal, well-formed project SKILL.md body. */
function skillDoc(over: {
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
  lines.push(over.body ?? "# Body\n\nContent.");
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

describe("loadProjectSkills", () => {
  it("returns [] when the .ultracode/skills directory is missing", async () => {
    // cwd exists but has no `.ultracode` at all.
    expect(await loadProjectSkills(cwd)).toEqual([]);
  });

  it("returns [] when the skills directory exists but is empty", async () => {
    await fs.mkdir(skillsRoot(), { recursive: true });
    expect(await loadProjectSkills(cwd)).toEqual([]);
  });

  it("loads a single valid skill mapped to the product Skill type with project defaults", async () => {
    const file = await writeSkillFile(
      "clean-code",
      skillDoc({
        name: "clean-code",
        description: "Clean code standard",
        extra: "triggers:\n  - clean code\n  - refactoring",
        body: "# Clean Code\n\nSOLID rules.",
      }),
    );
    const stat = await fs.stat(file);

    const skills = await loadProjectSkills(cwd);
    expect(skills).toHaveLength(1);
    const s = skills[0]!;
    expect(s.name).toBe("clean-code");
    expect(s.description).toBe("Clean code standard");
    expect(s.triggers).toEqual(["clean code", "refactoring"]);
    // Project defaults.
    expect(s.status).toBe("active");
    expect(s.catalog).toBe("project");
    expect(s.version).toBe("0.0.0");
    expect(s.sources).toEqual([]);
    // Timestamps derive from the file mtime.
    expect(s.createdAt).toBe(stat.mtime.toISOString());
    expect(s.updatedAt).toBe(stat.mtime.toISOString());
    // Body is the markdown after the second fence.
    expect(s.body).toBe("# Clean Code\n\nSOLID rules.");
  });

  it("defaults triggers and description to empty when absent", async () => {
    await writeSkillFile("bare", skillDoc({ name: "bare" }));
    const skills = await loadProjectSkills(cwd);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.description).toBe("");
    expect(skills[0]!.triggers).toEqual([]);
  });

  it("reads an explicit version from frontmatter when present", async () => {
    await writeSkillFile(
      "versioned",
      skillDoc({ name: "versioned", description: "d", extra: "version: 2.3.4" }),
    );
    const skills = await loadProjectSkills(cwd);
    expect(skills[0]!.version).toBe("2.3.4");
  });

  it("skips a skill whose SKILL.md has no name and warns", async () => {
    const { logger, warns } = captureLogger();
    await writeSkillFile("named", skillDoc({ name: "named", description: "ok" }));
    await writeSkillFile("nameless", skillDoc({ description: "no name here" }));
    const skills = await loadProjectSkills(cwd, { logger });
    expect(skills.map((s) => s.name)).toEqual(["named"]);
    expect(warns.some((w) => w.includes("project-skill"))).toBe(true);
  });

  it("skips a directory that has no SKILL.md", async () => {
    await fs.mkdir(path.join(skillsRoot(), "empty-dir"), { recursive: true });
    await writeSkillFile("real", skillDoc({ name: "real", description: "d" }));
    const skills = await loadProjectSkills(cwd);
    expect(skills.map((s) => s.name)).toEqual(["real"]);
  });

  it("skips a corrupt SKILL.md (no frontmatter) and warns", async () => {
    const { logger, warns } = captureLogger();
    await writeSkillFile("broken", "no frontmatter at all, just prose");
    await writeSkillFile("good", skillDoc({ name: "good", description: "d" }));
    const skills = await loadProjectSkills(cwd, { logger });
    expect(skills.map((s) => s.name)).toEqual(["good"]);
    expect(warns.some((w) => w.includes("project-skill"))).toBe(true);
  });

  it("loads multiple skills in a deterministic (name-sorted) order", async () => {
    await writeSkillFile("gamma", skillDoc({ name: "gamma", description: "g" }));
    await writeSkillFile("alpha", skillDoc({ name: "alpha", description: "a" }));
    await writeSkillFile("beta", skillDoc({ name: "beta", description: "b" }));
    const skills = await loadProjectSkills(cwd);
    expect(skills.map((s) => s.name)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("ignores stray non-directory entries in the skills root", async () => {
    await fs.mkdir(skillsRoot(), { recursive: true });
    await fs.writeFile(path.join(skillsRoot(), "README.md"), "not a skill dir", "utf8");
    await writeSkillFile("real", skillDoc({ name: "real", description: "d" }));
    const skills = await loadProjectSkills(cwd);
    expect(skills.map((s) => s.name)).toEqual(["real"]);
  });

  it("preserves Unicode in name, description and body", async () => {
    await writeSkillFile(
      "unicode",
      skillDoc({
        name: "unicode",
        description: "café 日本語 🛡️",
        body: "# Körper\n\n𝕦𝕟𝕚 😀 Prüfung",
      }),
    );
    const skills = await loadProjectSkills(cwd);
    expect(skills[0]!.description).toBe("café 日本語 🛡️");
    expect(skills[0]!.body).toBe("# Körper\n\n𝕦𝕟𝕚 😀 Prüfung");
  });

  it("returns [] and does not throw when the skills root read fails (non-ENOENT)", async () => {
    const { logger, warns } = captureLogger();
    await fs.mkdir(skillsRoot(), { recursive: true });
    vi.spyOn(fs, "readdir").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const skills = await loadProjectSkills(cwd, { logger });
    vi.restoreAllMocks();
    expect(skills).toEqual([]);
    expect(warns.some((w) => w.includes("project-skill"))).toBe(true);
  });

  it("skips a SKILL.md that cannot be read and warns", async () => {
    const { logger, warns } = captureLogger();
    await writeSkillFile("unreadable", skillDoc({ name: "unreadable", description: "d" }));
    vi.spyOn(fs, "readFile").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const skills = await loadProjectSkills(cwd, { logger });
    vi.restoreAllMocks();
    expect(skills).toEqual([]);
    expect(warns.some((w) => w.includes("project-skill"))).toBe(true);
  });
});
