/**
 * Packaging / npm-publish invariants (vitest project "e2e").
 *
 * These tests do NOT build, spawn or hit the network: they only read the
 * package manifests on disk and assert the metadata required for a clean
 * `pnpm -r publish` (see `.github/workflows/publish.yml` and `VERSIONING.md`).
 *
 * They guard against regressions in the publish pipeline — missing
 * `files`/README/LICENSE, wrong `publishConfig.access`, or a stray
 * `workspace:*` specifier that would break consumers of the published tarball.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(HERE, "..");

function readManifest(pkgDir: string): Record<string, unknown> {
  const file = join(repoRoot, "packages", pkgDir, "package.json");
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

const REPO_URL = "git+https://github.com/AndreasSchwan-SIMO/UltraCode.git";

describe("packaging invariants", () => {
  const publishable: Array<{ dir: string; name: string; scoped: boolean }> = [
    { dir: "shared", name: "ultracode-shared", scoped: false },
    { dir: "core", name: "ultracode-core", scoped: false },
    { dir: "cli", name: "ultracode-ai", scoped: false },
  ];

  for (const { dir, name, scoped } of publishable) {
    describe(name, () => {
      const manifest = readManifest(dir);

      it("has the expected package name", () => {
        expect(manifest.name).toBe(name);
      });

      it("ships dist, README and LICENSE in the tarball", () => {
        const files = manifest.files as string[];
        expect(files).toContain("dist");
        expect(files).toContain("README.md");
        expect(files).toContain("LICENSE");
      });

      it("declares main and types entry points", () => {
        expect(manifest.main).toBe("./dist/index.js");
        expect(manifest.types).toBe("./dist/index.d.ts");
      });

      it("builds before publishing via prepublishOnly", () => {
        const scripts = manifest.scripts as Record<string, string>;
        expect(scripts.prepublishOnly).toBe("tsc -b");
      });

      it("points repository, homepage and bugs at the GitHub repo", () => {
        const repo = manifest.repository as { url: string; directory: string };
        expect(repo.url).toBe(REPO_URL);
        expect(repo.directory).toBe(`packages/${dir}`);
        expect(manifest.homepage).toBe(
          "https://github.com/AndreasSchwan-SIMO/UltraCode#readme",
        );
        expect(manifest.bugs).toEqual({
          url: "https://github.com/AndreasSchwan-SIMO/UltraCode/issues",
        });
      });

      if (scoped) {
        it("publishes scoped packages with public access", () => {
          expect(manifest.publishConfig).toEqual({ access: "public" });
        });
      }

      it("carries an on-disk README and LICENSE copy", () => {
        expect(existsSync(join(repoRoot, "packages", dir, "README.md"))).toBe(
          true,
        );
        expect(existsSync(join(repoRoot, "packages", dir, "LICENSE"))).toBe(true);
      });

      it("uses only the workspace:^ protocol for internal deps (no bare workspace:*)", () => {
        const deps = (manifest.dependencies ?? {}) as Record<string, string>;
        for (const [depName, range] of Object.entries(deps)) {
          if (depName.startsWith("ultracode-")) {
            // workspace:^ is rewritten to a real version by pnpm at publish
            // time; a bare workspace:* would leak into the tarball on older
            // tooling, so we forbid it explicitly.
            expect(range, `${name} -> ${depName}`).toBe("workspace:^");
          }
        }
      });
    });
  }

  it("CLI exposes the ultracode-ai bin", () => {
    const cli = readManifest("cli");
    expect(cli.bin).toEqual({ "ultracode-ai": "./dist/index.js" });
  });

  it("package LICENSE copies match the root LICENSE byte-for-byte", () => {
    const root = readFileSync(join(repoRoot, "LICENSE"), "utf8");
    for (const dir of ["shared", "core", "cli"]) {
      const copy = readFileSync(
        join(repoRoot, "packages", dir, "LICENSE"),
        "utf8",
      );
      expect(copy).toBe(root);
    }
  });
});
