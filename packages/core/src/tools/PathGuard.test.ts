import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolError } from "@ultracode/shared";
import { PathGuard, isPathInside, resolveHome, resolvePath } from "./PathGuard.js";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-guard-"));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), "uc-outside-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe("resolveHome", () => {
  it("expands ~ to the home directory", () => {
    expect(resolveHome("~")).toBe(os.homedir());
    expect(resolveHome("~/x")).toBe(path.join(os.homedir(), "x"));
  });

  it("leaves other paths untouched", () => {
    expect(resolveHome("/a/b")).toBe("/a/b");
    expect(resolveHome("rel/p")).toBe("rel/p");
    expect(resolveHome("~user/x")).toBe("~user/x");
  });
});

describe("isPathInside", () => {
  it("accepts equal and nested paths", () => {
    expect(isPathInside(path.join("a", "b"), path.join("a", "b"))).toBe(true);
    expect(isPathInside(path.join("a", "b"), path.join("a", "b", "c"))).toBe(true);
  });

  it("rejects siblings and parents", () => {
    expect(isPathInside(path.join("a", "b"), path.join("a", "bc"))).toBe(false);
    expect(isPathInside(path.join("a", "b"), "a")).toBe(false);
  });
});

describe("resolvePath", () => {
  it("resolves a relative path inside cwd", async () => {
    await fs.writeFile(path.join(root, "f.txt"), "x");
    const resolved = await resolvePath(root, "f.txt");
    expect(resolved).toBe(path.join(await fs.realpath(root), "f.txt"));
  });

  it("accepts not-yet-existing targets inside cwd (write case)", async () => {
    const resolved = await resolvePath(root, path.join("new", "deep", "file.txt"));
    expect(resolved.endsWith(path.join("new", "deep", "file.txt"))).toBe(true);
  });

  it("rejects ../ traversal", async () => {
    await expect(resolvePath(root, "../../../etc/passwd")).rejects.toThrow(ToolError);
    await expect(
      resolvePath(root, `..${path.sep}..${path.sep}x`),
    ).rejects.toThrow(/outside/);
  });

  it("rejects absolute paths outside the sandbox", async () => {
    await expect(resolvePath(root, path.join(outside, "x"))).rejects.toThrow(ToolError);
  });

  it("rejects sneaky nested traversal", async () => {
    await expect(resolvePath(root, "a/b/../../../escape")).rejects.toThrow(ToolError);
  });

  it("allows paths in allowedDirs", async () => {
    await fs.writeFile(path.join(outside, "ok.txt"), "x");
    const resolved = await resolvePath(root, path.join(outside, "ok.txt"), {
      allowedDirs: [outside],
    });
    expect(resolved).toBe(path.join(await fs.realpath(outside), "ok.txt"));
  });

  it("rejects empty and NUL-containing paths", async () => {
    await expect(resolvePath(root, "")).rejects.toThrow(ToolError);
    await expect(resolvePath(root, "a\0b")).rejects.toThrow(/NUL/);
  });

  it("handles unicode and emoji path components", async () => {
    const name = "tæst-📄-файл.txt";
    await fs.writeFile(path.join(root, name), "x");
    const resolved = await resolvePath(root, name);
    expect(path.basename(resolved)).toBe(name);
  });

  it("rejects symlinks escaping the sandbox", async () => {
    const secret = path.join(outside, "secret.txt");
    await fs.writeFile(secret, "top secret");
    const link = path.join(root, "innocent.txt");
    try {
      await fs.symlink(secret, link);
    } catch {
      // Creating symlinks may require privileges (e.g. Windows) — skip.
      return;
    }
    await expect(resolvePath(root, "innocent.txt")).rejects.toThrow(/outside/);
  });

  it("rejects symlinked directories escaping the sandbox (write through link)", async () => {
    const link = path.join(root, "linkdir");
    try {
      await fs.symlink(outside, link, "dir");
    } catch {
      return; // privilege-dependent — skip
    }
    await expect(resolvePath(root, path.join("linkdir", "new.txt"))).rejects.toThrow(ToolError);
  });

  it("accepts symlinks that stay inside the sandbox", async () => {
    const target = path.join(root, "real.txt");
    await fs.writeFile(target, "x");
    const link = path.join(root, "alias.txt");
    try {
      await fs.symlink(target, link);
    } catch {
      return; // privilege-dependent — skip
    }
    const resolved = await resolvePath(root, "alias.txt");
    expect(resolved).toBe(path.join(await fs.realpath(root), "real.txt"));
  });
});

describe("PathGuard", () => {
  it("binds an allow-list and attributes errors to the tool", async () => {
    const guard = new PathGuard({ allowedDirs: [] });
    await expect(guard.resolve(root, "../x", "read")).rejects.toMatchObject({
      toolName: "read",
      code: "TOOL_ERROR",
    });
  });

  it("supports ~ in allowedDirs without crashing", async () => {
    const guard = new PathGuard({ allowedDirs: ["~/does-not-need-to-exist"] });
    await expect(guard.resolve(root, "inside.txt", "read")).resolves.toContain("inside.txt");
  });
});
