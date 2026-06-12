import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@ultracode/shared";
import { SkillRegistry } from "./SkillRegistry.js";
import { createSkillInjector, SKILL_CONTEXT_HEADER } from "./SkillInjector.js";
import type { Skill } from "./types.js";

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "uc-skillinj-"));
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    name: "dora-compliance",
    description: "DORA",
    version: "1.0.0",
    catalog: "compliance",
    triggers: ["dora", "resilience"],
    sources: ["s"],
    status: "active",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    body: "DORA body content about operational resilience.",
    ...over,
  };
}

async function seed(reg: SkillRegistry, skills: Skill[]): Promise<void> {
  for (const s of skills) await reg.save(s);
}

describe("createSkillInjector", () => {
  it("returns the active skill block when a trigger matches (case-insensitive)", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [makeSkill()]);
    const inject = createSkillInjector(reg);
    const out = await inject("How do we handle DORA reporting?");
    expect(out).toContain(SKILL_CONTEXT_HEADER);
    expect(out).toContain("dora-compliance");
    expect(out).toContain("operational resilience");
  });

  it("returns '' when no trigger matches", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [makeSkill()]);
    const inject = createSkillInjector(reg);
    expect(await inject("unrelated question about weather")).toBe("");
  });

  it("returns '' when there are no active skills", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [makeSkill({ status: "draft" }), makeSkill({ name: "x", status: "deprecated" })]);
    const inject = createSkillInjector(reg);
    expect(await inject("dora resilience")).toBe("");
  });

  it("ranks by trigger score, then name, and honours maxSkills (Top-N)", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [
      makeSkill({ name: "aaa", catalog: "c", triggers: ["alpha"], body: "AAA" }),
      makeSkill({ name: "bbb", catalog: "c", triggers: ["alpha", "beta"], body: "BBB" }),
      makeSkill({ name: "ccc", catalog: "c", triggers: ["alpha"], body: "CCC" }),
    ]);
    const inject = createSkillInjector(reg, { maxSkills: 2 });
    const out = await inject("alpha beta");
    // bbb scores 2 (alpha+beta) → first; then aaa/ccc score 1, name tie-break → aaa
    const idxBBB = out.indexOf("bbb");
    const idxAAA = out.indexOf("aaa");
    expect(idxBBB).toBeGreaterThanOrEqual(0);
    expect(idxAAA).toBeGreaterThan(idxBBB);
    expect(out).not.toContain("ccc"); // dropped by Top-N=2
  });

  it("respects maxChars at a word boundary", async () => {
    const reg = new SkillRegistry(home);
    const longBody = "word ".repeat(2000).trim();
    await seed(reg, [makeSkill({ body: longBody })]);
    const inject = createSkillInjector(reg, { maxChars: 200 });
    const out = await inject("dora");
    expect(out.length).toBeLessThanOrEqual(200 + SKILL_CONTEXT_HEADER.length + 40);
    expect(out).not.toMatch(/wor$/); // not cut mid-word at the very end
  });

  it("matches unicode triggers", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [makeSkill({ name: "uni", triggers: ["café", "日本語"], body: "UNI" })]);
    const inject = createSkillInjector(reg);
    expect(await inject("etwas über café hier")).toContain("uni");
    expect(await inject("text 日本語 text")).toContain("uni");
  });

  it("multi-word triggers require all words present", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [makeSkill({ name: "mw", triggers: ["risk model"], body: "MW" })]);
    const inject = createSkillInjector(reg);
    expect(await inject("the risk model is here")).toContain("mw");
    expect(await inject("only risk mentioned")).toBe("");
  });

  it("corrupt registry is non-fatal → ''", async () => {
    const failing = {
      load: async () => {
        throw new Error("corrupt store");
      },
    } as unknown as SkillRegistry;
    const warns: string[] = [];
    const logger: Logger = {
      debug: () => {},
      info: () => {},
      warn: (m) => warns.push(m),
      error: () => {},
    };
    const inject = createSkillInjector(failing, { logger });
    expect(await inject("dora")).toBe("");
    expect(warns.some((w) => /skill-injector\.failed/.test(w))).toBe(true);
  });

  it("empty prompt → ''", async () => {
    const reg = new SkillRegistry(home);
    await seed(reg, [makeSkill()]);
    const inject = createSkillInjector(reg);
    expect(await inject("")).toBe("");
  });
});
