/**
 * Tests for {@link SourceLibrary}: seeding, add/remove/get, atomic TOML
 * round-trip and corruption handling.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SourceLibrary, SEED_SOURCES } from "./SourceLibrary.js";
import { sourcesFile, learningDir } from "./paths.js";
import { LearnError } from "./errors.js";
import type { LearnSource } from "./types.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "ultracode-learn-"));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("SourceLibrary", () => {
  it("seeds the on-demand sources on first access", async () => {
    const lib = new SourceLibrary(home);
    const list = await lib.list();
    expect(list.map((s) => s.id).sort()).toEqual(["azure-docs", "azure-training", "pytest-docs"]);
    for (const s of list) {
      expect(s.schedule).toBe("on-demand");
    }
    // Seeds are persisted to disk.
    const onDisk = sourcesFile(home);
    const lib2 = new SourceLibrary(home);
    expect((await lib2.list()).length).toBe(3);
    expect(onDisk).toContain("sources.toml");
  });

  it("adds, gets and removes sources with atomic persistence", async () => {
    const lib = new SourceLibrary(home);
    const src: LearnSource = {
      id: "custom",
      url: "https://docs.example.com/",
      type: "web-docs",
      catalog: "custom",
      schedule: "on-demand",
      localeDefault: "de-de",
      scope: "all",
    };
    await lib.add(src);
    expect(await lib.get("custom")).toMatchObject({ id: "custom", catalog: "custom" });

    // Re-open to prove it round-tripped through TOML.
    const reopened = new SourceLibrary(home);
    expect(await reopened.get("custom")).not.toBeNull();

    expect(await lib.remove("custom")).toBe(true);
    expect(await lib.remove("custom")).toBe(false);
    expect(await lib.get("custom")).toBeNull();
  });

  it("replaces a source with the same id rather than duplicating", async () => {
    const lib = new SourceLibrary(home);
    await lib.add({ ...SEED_SOURCES[0]!, scope: "changed" });
    const all = await lib.list();
    expect(all.filter((s) => s.id === "azure-docs")).toHaveLength(1);
    expect((await lib.get("azure-docs"))?.scope).toBe("changed");
  });

  it("validates required fields", async () => {
    const lib = new SourceLibrary(home);
    await expect(lib.add({ id: "", url: "x", catalog: "c" } as LearnSource)).rejects.toBeInstanceOf(LearnError);
    await expect(lib.add({ id: "a", url: "", catalog: "c" } as LearnSource)).rejects.toBeInstanceOf(LearnError);
  });

  it("throws LearnError on corrupt TOML", async () => {
    await mkdir(learningDir(home), { recursive: true });
    await writeFile(sourcesFile(home), "this is = = not toml [[[", "utf8");
    const lib = new SourceLibrary(home);
    await expect(lib.list()).rejects.toBeInstanceOf(LearnError);
  });
});
