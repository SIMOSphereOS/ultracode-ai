import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "ultracode-shared";
import {
  atomicWriteFile,
  profileFile,
  projectConfigCandidates,
  resolveHome,
  userConfigFile,
  userEnvFile,
} from "./paths.js";

const HOME = path.join("fake", "home");

describe("resolveHome", () => {
  it("expands a bare tilde", () => {
    expect(resolveHome("~", HOME)).toBe(HOME);
  });

  it("expands ~/ prefixes via path.join", () => {
    expect(resolveHome("~/.ultracode/config.toml", HOME)).toBe(
      path.join(HOME, ".ultracode", "config.toml"),
    );
  });

  it("expands ~\\ prefixes (Windows-style)", () => {
    expect(resolveHome("~\\.ultracode", HOME)).toBe(path.join(HOME, ".ultracode"));
  });

  it("leaves non-tilde and ~user paths unchanged", () => {
    expect(resolveHome("/etc/passwd", HOME)).toBe("/etc/passwd");
    expect(resolveHome("C:\\Users\\x", HOME)).toBe("C:\\Users\\x");
    expect(resolveHome("~otheruser/x", HOME)).toBe("~otheruser/x");
    expect(resolveHome("", HOME)).toBe("");
    expect(resolveHome("relative/path", HOME)).toBe("relative/path");
  });

  it("defaults to os.homedir()", () => {
    expect(resolveHome("~")).toBe(os.homedir());
  });

  it("handles unicode home directories", () => {
    const home = path.join("home", "Ünïcödé-用户-🦊");
    expect(resolveHome("~/x", home)).toBe(path.join(home, "x"));
  });
});

describe("user-level paths", () => {
  it("builds user config and .env paths inside the home dir", () => {
    expect(userConfigFile(HOME)).toBe(path.join(HOME, ".ultracode", "config.toml"));
    expect(userEnvFile(HOME)).toBe(path.join(HOME, ".ultracode", ".env"));
  });
});

describe("profileFile", () => {
  it("builds the profile path", () => {
    expect(profileFile("work", HOME)).toBe(
      path.join(HOME, ".ultracode", "profiles", "work.toml"),
    );
  });

  it("rejects traversal and separator characters", () => {
    for (const bad of ["", "../evil", "a/b", "a\\b", "x\0y", ".."]) {
      expect(() => profileFile(bad, HOME)).toThrow(ConfigError);
    }
  });
});

describe("projectConfigCandidates", () => {
  it("returns candidates in resolution order, joined via node:path", () => {
    const cwd = path.join("some", "project");
    expect(projectConfigCandidates(cwd)).toEqual([
      path.join(cwd, ".ultracode", "config.toml"),
      path.join(cwd, ".vibe", "config.toml"),
      path.join(cwd, ".ultracode.toml"),
    ]);
  });
});

describe("atomicWriteFile", () => {
  let dir: string;

  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("writes content and creates parent directories", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-paths-"));
    const file = path.join(dir, "deep", "nested", "config.toml");
    await atomicWriteFile(file, "a = 1\n");
    expect(await readFile(file, "utf8")).toBe("a = 1\n");
  });

  it("replaces existing files and leaves no temp files behind", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-paths-"));
    const file = path.join(dir, "config.toml");
    await atomicWriteFile(file, "first = true\n");
    await atomicWriteFile(file, "second = true\n");
    expect(await readFile(file, "utf8")).toBe("second = true\n");
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    expect(entries).toEqual(["config.toml"]);
  });

  it("wraps failures in ConfigError (target dir is a file)", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-paths-"));
    const blocker = path.join(dir, "blocker");
    await atomicWriteFile(blocker, "x");
    expect((await stat(blocker)).isFile()).toBe(true);
    // `blocker` is a file, so it cannot act as a parent directory.
    await expect(atomicWriteFile(path.join(blocker, "config.toml"), "y")).rejects.toThrow(
      ConfigError,
    );
  });

  it("handles large (>= 1 MB) and unicode content", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ultracode-paths-"));
    const file = path.join(dir, "big.toml");
    const big = `x = "${"ä🦊".repeat(400_000)}"\n`;
    expect(big.length).toBeGreaterThan(1_000_000);
    await atomicWriteFile(file, big);
    expect(await readFile(file, "utf8")).toBe(big);
  });
});
