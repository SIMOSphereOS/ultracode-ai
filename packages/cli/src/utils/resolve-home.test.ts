import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { resolveHome } from "./resolve-home.js";

describe("resolveHome", () => {
  const home = path.join(os.tmpdir(), "fake-home");

  it("expands a bare ~", () => {
    expect(resolveHome("~", home)).toBe(home);
  });

  it("expands ~/ prefixed paths with platform separators", () => {
    expect(resolveHome("~/.ultracode/config.toml", home)).toBe(
      path.join(home, ".ultracode", "config.toml"),
    );
  });

  it("expands ~\\ prefixed (Windows-style) paths", () => {
    expect(resolveHome("~\\.ultracode", home)).toBe(path.join(home, ".ultracode"));
  });

  it("leaves absolute paths untouched", () => {
    const abs = path.resolve(os.tmpdir(), "x");
    expect(resolveHome(abs, home)).toBe(abs);
  });

  it("leaves relative paths untouched", () => {
    expect(resolveHome("a/b", home)).toBe("a/b");
  });

  it("does not expand ~user style paths", () => {
    expect(resolveHome("~root/x", home)).toBe("~root/x");
  });

  it("defaults to os.homedir()", () => {
    expect(resolveHome("~")).toBe(os.homedir());
  });

  it("handles unicode path segments", () => {
    expect(resolveHome("~/données/🚀", home)).toBe(path.join(home, "données", "🚀"));
  });
});
