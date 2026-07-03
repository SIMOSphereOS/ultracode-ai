/**
 * Tests for {@link SourceLibrary}: seeding, add/remove/get, atomic TOML
 * round-trip and corruption handling.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LearnError } from "./errors.js";
import { learningDir, sourcesFile } from "./paths.js";
import { SEED_SOURCES, SourceLibrary } from "./SourceLibrary.js";
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
    // Assert against SEED_SOURCES (not a hard-coded id list) so that adding a
    // new default seed does NOT force a test change.
    const seedIds = SEED_SOURCES.map((s) => s.id);
    expect(list.map((s) => s.id)).toEqual(expect.arrayContaining(seedIds));
    expect(list).toHaveLength(SEED_SOURCES.length);
    for (const s of list) {
      expect(s.schedule).toBe("on-demand");
    }
    // Seeds are persisted to disk.
    const onDisk = sourcesFile(home);
    const lib2 = new SourceLibrary(home);
    expect((await lib2.list()).length).toBe(SEED_SOURCES.length);
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
    await expect(lib.add({ id: "", url: "x", catalog: "c" } as LearnSource)).rejects.toBeInstanceOf(
      LearnError,
    );
    await expect(lib.add({ id: "a", url: "", catalog: "c" } as LearnSource)).rejects.toBeInstanceOf(
      LearnError,
    );
  });

  it("accepts a normal https URL at add time", async () => {
    const lib = new SourceLibrary(home);
    const src: LearnSource = {
      id: "ok",
      url: "https://docs.example.com/guide",
      type: "web-docs",
      catalog: "ok",
      schedule: "on-demand",
      localeDefault: "de-de",
    };
    await expect(lib.add(src)).resolves.toBeUndefined();
    expect(await lib.get("ok")).toMatchObject({ id: "ok", url: "https://docs.example.com/guide" });
  });

  it("rejects a non-http(s) (file://) URL at add time, before it enters the library", async () => {
    const lib = new SourceLibrary(home);
    const src = {
      id: "evil-file",
      url: "file:///etc/passwd",
      type: "web-docs",
      catalog: "evil",
      schedule: "on-demand",
      localeDefault: "de-de",
    } as LearnSource;
    await expect(lib.add(src)).rejects.toBeInstanceOf(LearnError);
    // The rejected source must NOT have been persisted.
    expect(await lib.get("evil-file")).toBeNull();
  });

  it("rejects a private-host (SSRF) URL at add time", async () => {
    const lib = new SourceLibrary(home);
    const loopback = {
      id: "ssrf-loopback",
      url: "http://127.0.0.1/admin",
      type: "web-docs",
      catalog: "evil",
      schedule: "on-demand",
      localeDefault: "de-de",
    } as LearnSource;
    const metadata = {
      id: "ssrf-metadata",
      url: "http://169.254.169.254/latest/meta-data/",
      type: "web-docs",
      catalog: "evil",
      schedule: "on-demand",
      localeDefault: "de-de",
    } as LearnSource;
    await expect(lib.add(loopback)).rejects.toBeInstanceOf(LearnError);
    await expect(lib.add(metadata)).rejects.toBeInstanceOf(LearnError);
    expect(await lib.get("ssrf-loopback")).toBeNull();
    expect(await lib.get("ssrf-metadata")).toBeNull();
  });

  it("throws LearnError on corrupt TOML", async () => {
    await mkdir(learningDir(home), { recursive: true });
    await writeFile(sourcesFile(home), "this is = = not toml [[[", "utf8");
    const lib = new SourceLibrary(home);
    await expect(lib.list()).rejects.toBeInstanceOf(LearnError);
  });
});
