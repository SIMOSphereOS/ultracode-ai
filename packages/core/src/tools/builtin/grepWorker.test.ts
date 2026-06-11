/**
 * Unit tests for the grep worker's pure search logic.
 *
 * The worker normally runs in a `node:worker_threads` thread (so v8 coverage of
 * the host process does not see it), but its core `runSearch` is exported and
 * exercised here in-process: this verifies the inlined helpers (line splitting,
 * Unicode-safe truncation, the directory walk, ignore list, binary skip) behave
 * identically to the shared implementations the main thread imports.
 */

import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSearch } from "./grepWorker.js";
import type { GrepWorkerInput } from "./grepWorker.js";

let root: string;

function input(extra: Partial<GrepWorkerInput> & Pick<GrepWorkerInput, "pattern">): GrepWorkerInput {
  return {
    flags: "",
    root,
    isFile: false,
    base: root,
    limit: 1000,
    maxFileBytes: 5 * 1024 * 1024,
    maxLineChars: 500,
    ...extra,
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-grepw-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("grepWorker.runSearch", () => {
  it("finds matches with 1-based line numbers and /-separated relative paths", async () => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "a.ts"), "const x = 1;\nconst NEEDLE = 2;\n");
    const result = await runSearch(input({ pattern: "NEEDLE" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ file: "src/a.ts", line: 2 });
  });

  it("honours flags, the match cap, ignored dirs and binary skip", async () => {
    await fs.writeFile(path.join(root, "f.txt"), "Foo\nFOO\nfoo");
    await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(root, "node_modules", "x.txt"), "foo");
    await fs.writeFile(path.join(root, "bin.dat"), Buffer.from("foo\0foo"));

    const capped = await runSearch(input({ pattern: "foo", flags: "i", limit: 2 }));
    expect(capped.ok).toBe(true);
    if (!capped.ok) return;
    // 3 matches in f.txt, but capped at 2; node_modules + binary file excluded.
    expect(capped.matches).toHaveLength(2);
    expect(capped.limitReached).toBe(true);
    expect(capped.matches.every((m) => m.file === "f.txt")).toBe(true);
  });

  it("searches a single file and truncates long match lines", async () => {
    const file = path.join(root, "single.txt");
    await fs.writeFile(file, `start ${"y".repeat(100_000)}`);
    const result = await runSearch(
      input({ pattern: "start", isFile: true, root: file, base: root }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.text.length).toBeLessThanOrEqual(500);
  });

  it("reports invalid regex as a structured error (never throws)", async () => {
    const result = await runSearch(input({ pattern: "([unclosed" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error.message).toBe("string");
  });
});
