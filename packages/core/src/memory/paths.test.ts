import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveHome } from "./paths.js";

describe("resolveHome", () => {
  it("expands a bare '~' to the home directory", () => {
    expect(resolveHome("~")).toBe(os.homedir());
  });

  it("expands '~/sub/dir' with platform-native joining", () => {
    expect(resolveHome("~/a/b")).toBe(path.join(os.homedir(), "a/b"));
  });

  it("expands Windows-style '~\\sub'", () => {
    expect(resolveHome("~\\a\\b")).toBe(path.join(os.homedir(), "a\\b"));
  });

  it("leaves '~user' style paths untouched", () => {
    expect(resolveHome("~other/x")).toBe("~other/x");
  });

  it("leaves absolute and relative paths untouched", () => {
    const abs = path.resolve(os.tmpdir(), "x");
    expect(resolveHome(abs)).toBe(abs);
    expect(resolveHome("relative/path")).toBe("relative/path");
    expect(resolveHome("")).toBe("");
  });

  it("handles unicode path segments", () => {
    expect(resolveHome("~/Üml🚀ut/データ")).toBe(path.join(os.homedir(), "Üml🚀ut/データ"));
  });
});
