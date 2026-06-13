import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "ultracode-shared";
import { SkillRegistry } from "./SkillRegistry.js";
import { AuthoringError } from "./errors.js";
import { serializeFrontmatter } from "./frontmatter.js";
import type { Skill } from "./types.js";

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "uc-authoring-reg-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    name: "topic-a",
    description: "Desc A",
    version: "1.0.0",
    catalog: "cat1",
    triggers: ["a"],
    sources: ["s"],
    status: "active",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    body: "Body A",
    ...over,
  };
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

describe("SkillRegistry", () => {
  it("returns empty when the root does not exist", async () => {
    const reg = new SkillRegistry(home);
    expect(await reg.load()).toEqual([]);
    expect(await reg.get("anything")).toBeNull();
    expect(await reg.list()).toEqual([]);
  });

  it("saves and loads a skill round-trip", async () => {
    const reg = new SkillRegistry(home);
    const skill = makeSkill();
    await reg.save(skill);
    const loaded = await reg.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(skill);
    expect(await reg.get("topic-a")).toEqual(skill);
  });

  it("writes to ~/.ultracode/skills/<catalog>/<name>.md", async () => {
    const reg = new SkillRegistry(home);
    await reg.save(makeSkill());
    const file = path.join(home, ".ultracode", "skills", "cat1", "topic-a.md");
    const raw = await fs.readFile(file, "utf8");
    expect(raw).toContain("name: topic-a");
  });

  it("lists frontmatter (no body) and filters by catalog", async () => {
    const reg = new SkillRegistry(home);
    await reg.save(makeSkill({ name: "a", catalog: "cat1" }));
    await reg.save(makeSkill({ name: "b", catalog: "cat2" }));
    const all = await reg.list();
    expect(all).toHaveLength(2);
    expect(all[0]).not.toHaveProperty("body");
    const cat2 = await reg.list("cat2");
    expect(cat2.map((s) => s.name)).toEqual(["b"]);
  });

  it("tolerates corrupt files: warns and skips", async () => {
    const { logger, warns } = captureLogger();
    const reg = new SkillRegistry(home, logger);
    await reg.save(makeSkill({ name: "good" }));
    const dir = path.join(home, ".ultracode", "skills", "cat1");
    await fs.writeFile(path.join(dir, "broken.md"), "not frontmatter at all", "utf8");
    const loaded = await reg.load();
    expect(loaded.map((s) => s.name)).toEqual(["good"]);
    expect(warns).toContain("authoring.skill.corrupt");
  });

  it("ignores non-markdown files", async () => {
    const reg = new SkillRegistry(home);
    await reg.save(makeSkill());
    const dir = path.join(home, ".ultracode", "skills", "cat1");
    await fs.writeFile(path.join(dir, "notes.txt"), "ignore me", "utf8");
    expect(await reg.load()).toHaveLength(1);
  });

  it("rejects unsafe identifiers on save", async () => {
    const reg = new SkillRegistry(home);
    await expect(reg.save(makeSkill({ name: "../evil" }))).rejects.toBeInstanceOf(AuthoringError);
    await expect(reg.save(makeSkill({ catalog: "a/b" }))).rejects.toBeInstanceOf(AuthoringError);
  });

  it("rejects the reserved traversal segments '.'/'..' and writes nothing above root", async () => {
    const reg = new SkillRegistry(home);
    const skillsRoot = path.join(home, ".ultracode", "skills");
    // PoC: SAFE_SEGMENT (/^[A-Za-z0-9._-]+$/) admits '..' as a charset, which
    // would resolve to ~/.ultracode/<name>.md — ABOVE the skills root.
    for (const bad of ["..", ".", "a/.."]) {
      await expect(reg.save(makeSkill({ catalog: bad }))).rejects.toBeInstanceOf(AuthoringError);
      await expect(reg.save(makeSkill({ name: bad }))).rejects.toBeInstanceOf(AuthoringError);
    }
    // The traversal target that the PoC would have created must NOT exist.
    await expect(
      fs.readFile(path.join(home, ".ultracode", "topic-a.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.readFile(path.join(home, ".ultracode", "innocent.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    // The skills root itself was never populated with an escaping entry.
    const rootExists = await fs
      .readdir(skillsRoot)
      .then((e) => e)
      .catch(() => []);
    expect(rootExists).not.toContain("..");
  });

  it("still accepts a normal catalog after the traversal guard", async () => {
    const reg = new SkillRegistry(home);
    await reg.save(makeSkill({ catalog: "azure", name: "blob-storage" }));
    const file = path.join(home, ".ultracode", "skills", "azure", "blob-storage.md");
    expect(await fs.readFile(file, "utf8")).toContain("name: blob-storage");
  });

  it("persists Unicode content faithfully", async () => {
    const reg = new SkillRegistry(home);
    const skill = makeSkill({ description: "café 日本語 🛡️", body: "𝕦𝕟𝕚 😀 surrogate" });
    await reg.save(skill);
    expect(await reg.get("topic-a")).toEqual(skill);
  });

  it("get returns null for empty name without touching disk", async () => {
    const reg = new SkillRegistry(home);
    expect(await reg.get("")).toBeNull();
  });

  it("get returns null for a non-existent skill among existing ones", async () => {
    const reg = new SkillRegistry(home);
    await reg.save(makeSkill({ name: "present" }));
    expect(await reg.get("absent")).toBeNull();
  });

  it("get returns null for a non-string name without touching disk", async () => {
    const reg = new SkillRegistry(home);
    // @ts-expect-error deliberate misuse: a non-string name short-circuits.
    expect(await reg.get(123)).toBeNull();
  });

  it("loads across multiple catalogs and filters list per catalog", async () => {
    const reg = new SkillRegistry(home);
    await reg.save(makeSkill({ name: "a", catalog: "alpha" }));
    await reg.save(makeSkill({ name: "b", catalog: "beta" }));
    await reg.save(makeSkill({ name: "c", catalog: "beta" }));
    const all = await reg.load();
    expect(all.map((s) => s.name).sort()).toEqual(["a", "b", "c"]);
    expect((await reg.list("beta")).map((s) => s.name).sort()).toEqual(["b", "c"]);
    expect(await reg.list("absent")).toEqual([]);
  });

  it("skips an empty catalog directory and a partially-corrupt one", async () => {
    const { logger, warns } = captureLogger();
    const reg = new SkillRegistry(home, logger);
    await reg.save(makeSkill({ name: "good", catalog: "cat1" }));
    const skillsRoot = path.join(home, ".ultracode", "skills");
    // An empty catalog dir contributes nothing.
    await fs.mkdir(path.join(skillsRoot, "empty"), { recursive: true });
    // A catalog with a markdown file whose frontmatter is invalid (missing
    // required fields) is warned about and skipped.
    const partial = path.join(skillsRoot, "cat1");
    await fs.writeFile(
      path.join(partial, "invalid.md"),
      "---\nname: x\nstatus: active\n---\nbody",
      "utf8",
    );
    const loaded = await reg.load();
    expect(loaded.map((s) => s.name)).toEqual(["good"]);
    expect(warns).toContain("authoring.skill.corrupt");
  });

  it("warns and skips when a catalog dir cannot be read (readdir fails)", async () => {
    const { logger, warns } = captureLogger();
    const reg = new SkillRegistry(home, logger);
    await reg.save(makeSkill({ name: "ok" }));
    const real = fs.readdir.bind(fs);
    let call = 0;
    vi.spyOn(fs, "readdir").mockImplementation((async (
      dir: Parameters<typeof fs.readdir>[0],
      opts?: Parameters<typeof fs.readdir>[1],
    ) => {
      call += 1;
      // Call 1: listDirs(root) (withFileTypes) → real result so a catalog is
      // discovered. Call 2: the per-catalog readdir → fail (non-ENOENT).
      if (call === 1) return real(dir as never, opts as never);
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    }) as never);
    const loaded = await reg.load();
    vi.restoreAllMocks();
    expect(loaded).toEqual([]);
    expect(warns).toContain("authoring.skill.readdir-failed");
  });

  it("warns and skips when a markdown file cannot be read (readFile fails)", async () => {
    const { logger, warns } = captureLogger();
    const reg = new SkillRegistry(home, logger);
    await reg.save(makeSkill({ name: "ok" }));
    vi.spyOn(fs, "readFile").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    const loaded = await reg.load();
    vi.restoreAllMocks();
    expect(loaded).toEqual([]);
    expect(warns).toContain("authoring.skill.read-failed");
  });

  it("wraps a non-ENOENT failure enumerating the skills root", async () => {
    const reg = new SkillRegistry(home);
    vi.spyOn(fs, "readdir").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
    await expect(reg.load()).rejects.toBeInstanceOf(AuthoringError);
    vi.restoreAllMocks();
  });

  it("wraps a filesystem failure during save in an AuthoringError", async () => {
    const reg = new SkillRegistry(home);
    vi.spyOn(fs, "writeFile").mockRejectedValue(
      Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }),
    );
    await expect(reg.save(makeSkill())).rejects.toBeInstanceOf(AuthoringError);
    vi.restoreAllMocks();
    // No partial temp file is left behind after the cleanup path runs.
    const dir = path.join(home, ".ultracode", "skills", "cat1");
    const leftover = await fs.readdir(dir).catch(() => [] as string[]);
    expect(leftover.filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
