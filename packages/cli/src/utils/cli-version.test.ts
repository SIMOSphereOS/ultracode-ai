import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCliVersion } from "./cli-version.js";

describe("getCliVersion", () => {
  it("returns the version from the CLI's own package.json", () => {
    const pkgPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    expect(getCliVersion()).toBe(pkg.version);
  });

  it("returns a semver-shaped string", () => {
    expect(getCliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
