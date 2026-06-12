import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter, splitDocument } from "./frontmatter.js";
import type { Skill } from "./types.js";

function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    name: "dora-compliance",
    description: "DORA operational resilience guidance.",
    version: "1.0.0",
    catalog: "compliance",
    triggers: ["DORA", "operational resilience"],
    sources: ["https://example.test/dora"],
    status: "active",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    body: "# DORA\n\nBody text.",
    ...over,
  };
}

describe("frontmatter round-trip", () => {
  it("serializes and parses back identically", () => {
    const skill = makeSkill();
    const round = parseFrontmatter(serializeFrontmatter(skill));
    expect(round).toEqual(skill);
  });

  it("preserves Unicode/emoji/CJK in fields and body", () => {
    const skill = makeSkill({
      description: "Conformité DORA — 日本語 résilience 🛡️",
      triggers: ["résilience opérationnelle", "运营弹性", "🛡️ DORA"],
      body: "# 概要\n\nSürﬁce — café ☕ 𝕦𝕟𝕚𝕔𝕠𝕕𝕖 surrogate 😀",
    });
    const round = parseFrontmatter(serializeFrontmatter(skill));
    expect(round).toEqual(skill);
  });

  it("round-trips an empty body and empty source list", () => {
    const skill = makeSkill({ body: "", sources: [] });
    const round = parseFrontmatter(serializeFrontmatter(skill));
    expect(round?.body).toBe("");
    expect(round?.sources).toEqual([]);
  });

  it("round-trips optional tools", () => {
    const skill = makeSkill({ tools: ["read", "grep"] });
    const round = parseFrontmatter(serializeFrontmatter(skill));
    expect(round?.tools).toEqual(["read", "grep"]);
  });

  it("quotes tricky scalar values (leading dash, colon-space)", () => {
    const skill = makeSkill({ description: "- dash: and colon value " });
    const serialized = serializeFrontmatter(skill);
    const round = parseFrontmatter(serialized);
    expect(round?.description).toBe("- dash: and colon value ");
  });

  it("handles CRLF line endings", () => {
    const skill = makeSkill();
    const crlf = serializeFrontmatter(skill).replace(/\n/g, "\r\n");
    const round = parseFrontmatter(crlf);
    expect(round?.name).toBe(skill.name);
    expect(round?.triggers).toEqual(skill.triggers);
  });

  it("tolerates a UTF-8 BOM before the fence", () => {
    const skill = makeSkill();
    const withBom = `﻿${serializeFrontmatter(skill)}`;
    expect(parseFrontmatter(withBom)?.name).toBe(skill.name);
  });
});

describe("frontmatter corruption tolerance", () => {
  it("returns null for content with no frontmatter fence", () => {
    expect(parseFrontmatter("just some markdown, no frontmatter")).toBeNull();
  });

  it("returns null for an unclosed frontmatter block", () => {
    expect(parseFrontmatter("---\nname: x\nversion: 1.0.0")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const doc = "---\nname: x\ncatalog: c\nstatus: active\n---\nbody";
    expect(parseFrontmatter(doc)).toBeNull();
  });

  it("returns null for empty and whitespace-only input", () => {
    expect(parseFrontmatter("")).toBeNull();
    expect(parseFrontmatter("   \n\n  ")).toBeNull();
  });

  it("never throws on a >=1MB garbage input", () => {
    const huge = "x".repeat(1_100_000);
    expect(() => parseFrontmatter(huge)).not.toThrow();
    expect(parseFrontmatter(huge)).toBeNull();
  });

  it("falls back to draft status for an unknown status value", () => {
    const skill = makeSkill();
    const doc = serializeFrontmatter(skill).replace("status: active", "status: bogus");
    expect(parseFrontmatter(doc)?.status).toBe("draft");
  });

  it("splitDocument returns null for non-string input", () => {
    // @ts-expect-error deliberate misuse
    expect(splitDocument(42)).toBeNull();
  });

  it("parses inline flow lists", () => {
    const skill = makeSkill();
    const doc = serializeFrontmatter(skill).replace(
      /triggers:\n  - DORA\n  - operational resilience/,
      "triggers: [DORA, operational resilience]",
    );
    expect(parseFrontmatter(doc)?.triggers).toEqual(["DORA", "operational resilience"]);
  });
});
