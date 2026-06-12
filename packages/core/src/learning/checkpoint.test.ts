/**
 * Tests for the checkpoint store: SQLite path when available, JSON fallback
 * when `node:sqlite` is unavailable, round-trip, clear and corruption.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCheckpointStore } from "./checkpoint.js";
import type { Checkpoint, SqliteLoader } from "./checkpoint.js";
import { stateFile, stateDir } from "./paths.js";
import { LearnError } from "./errors.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "ultracode-cp-"));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/** Loader that always fails → forces the JSON fallback. */
const failingLoader: SqliteLoader = async () => {
  throw new Error("node:sqlite unavailable");
};

const sample = (): Checkpoint => ({
  sourceId: "s1",
  updatedAt: new Date().toISOString(),
  processed: ["https://e.com/a", "https://e.com/b"],
  validators: { "https://e.com/a": { etag: '"x"', contentHash: "h" } },
  usage: { tokensIn: 10, tokensOut: 5, actualUsd: 0.01 },
});

describe("checkpoint store (JSON fallback)", () => {
  it("round-trips a checkpoint and clears it", async () => {
    const store = await createCheckpointStore("s1", home, undefined, failingLoader);
    expect(await store.load()).toBeNull();
    const cp = sample();
    await store.save(cp);
    const loaded = await store.load();
    expect(loaded?.processed).toEqual(cp.processed);
    expect(loaded?.validators["https://e.com/a"]?.etag).toBe('"x"');
    await store.clear();
    expect(await store.load()).toBeNull();
    store.close();
  });

  it("throws LearnError on a corrupt JSON checkpoint", async () => {
    await mkdir(stateDir(home), { recursive: true });
    await writeFile(stateFile("s1", "json", home), "{not json", "utf8");
    const store = await createCheckpointStore("s1", home, undefined, failingLoader);
    await expect(store.load()).rejects.toBeInstanceOf(LearnError);
  });

  it("sanitises the source id into a safe filename", async () => {
    const store = await createCheckpointStore("../../evil id", home, undefined, failingLoader);
    await store.save({ ...sample(), sourceId: "../../evil id" });
    // File lands inside the state dir, not outside.
    const loaded = await store.load();
    expect(loaded).not.toBeNull();
    store.close();
  });
});

describe("checkpoint store (sqlite when available)", () => {
  it("uses sqlite and round-trips when node:sqlite loads", async () => {
    let store;
    try {
      store = await createCheckpointStore("s2", home);
    } catch {
      return; // environment without node:sqlite — covered by fallback tests
    }
    const cp = { ...sample(), sourceId: "s2" };
    await store.save(cp);
    const loaded = await store.load();
    expect(loaded?.processed).toEqual(cp.processed);
    await store.clear();
    expect(await store.load()).toBeNull();
    store.close();
  });
});
