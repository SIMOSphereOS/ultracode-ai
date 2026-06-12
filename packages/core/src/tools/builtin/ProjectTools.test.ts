import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoopLogger } from "@ultracode/shared";
import type { ToolContext } from "@ultracode/shared";
import { DependenciesTool, ProjectStatusTool } from "./ProjectTools.js";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-proj-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("ProjectStatusTool", () => {
  const tool = new ProjectStatusTool();

  it("summarises a package.json project", async () => {
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "demo",
        version: "1.2.3",
        scripts: { build: "tsc", test: "vitest run" },
        dependencies: { zod: "^3.0.0" },
        devDependencies: { vitest: "^2.0.0", typescript: "^5.0.0" },
      }),
    );
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.detected).toBe(true);
    const p = result.output.projects[0];
    expect(p).toMatchObject({
      kind: "node",
      name: "demo",
      version: "1.2.3",
      dependencyCount: 1,
      devDependencyCount: 2,
    });
    expect(p?.scripts).toEqual({ build: "tsc", test: "vitest run" });
  });

  it("summarises pyproject.toml (PEP 621) projects", async () => {
    await fs.writeFile(
      path.join(root, "pyproject.toml"),
      [
        "[project]",
        'name = "pydemo"',
        'version = "0.9.0"',
        'dependencies = ["requests>=2.0", "pydantic"]',
      ].join("\n"),
    );
    const result = await tool.execute(tool.validate({}), ctx());
    const p = result.output.projects[0];
    expect(p?.kind).toBe("python");
    expect(p?.name).toBe("pydemo");
    expect(p?.dependencyCount).toBe(2);
  });

  it("summarises Cargo.toml projects", async () => {
    await fs.writeFile(
      path.join(root, "Cargo.toml"),
      [
        "[package]",
        'name = "rustdemo"',
        'version = "0.1.0"',
        "[dependencies]",
        'serde = { version = "1.0", features = ["derive"] }',
        'tokio = "1"',
        "[dev-dependencies]",
        'criterion = "0.5"',
      ].join("\n"),
    );
    const result = await tool.execute(tool.validate({}), ctx());
    const p = result.output.projects[0];
    expect(p?.kind).toBe("rust");
    expect(p?.name).toBe("rustdemo");
    expect(p?.dependencyCount).toBe(2);
    expect(p?.devDependencyCount).toBe(1);
  });

  it("detects multiple manifests side by side", async () => {
    await fs.writeFile(path.join(root, "package.json"), "{}");
    await fs.writeFile(path.join(root, "Cargo.toml"), '[package]\nname = "x"');
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.output.projects).toHaveLength(2);
  });

  it("returns detected:false when nothing is found", async () => {
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.detected).toBe(false);
    expect(result.output.projects).toEqual([]);
  });

  it("fails with a result on corrupt manifests", async () => {
    await fs.writeFile(path.join(root, "package.json"), "{ not json !!!");
    const broken = await tool.execute(tool.validate({}), ctx());
    expect(broken.ok).toBe(false);
    expect(broken.error?.message).toContain("Invalid JSON");

    await fs.unlink(path.join(root, "package.json"));
    await fs.writeFile(path.join(root, "Cargo.toml"), "[package\nbroken =");
    const badToml = await tool.execute(tool.validate({}), ctx());
    expect(badToml.ok).toBe(false);
    expect(badToml.error?.message).toContain("Invalid TOML");
  });

  it("blocks paths outside the sandbox", async () => {
    const result = await tool.execute(tool.validate({ path: "../.." }), ctx());
    expect(result.ok).toBe(false);
  });
});

describe("DependenciesTool", () => {
  const tool = new DependenciesTool();

  it("lists dependencies with dev flags and sources", async () => {
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        dependencies: { zod: "^3.0.0" },
        devDependencies: { vitest: "^2.0.0" },
      }),
    );
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.count).toBe(2);
    expect(result.output.dependencies).toContainEqual({
      name: "zod",
      version: "^3.0.0",
      dev: false,
      source: "package.json",
    });
    expect(result.output.dependencies).toContainEqual({
      name: "vitest",
      version: "^2.0.0",
      dev: true,
      source: "package.json",
    });
  });

  it("returns an empty list when no manifest exists", async () => {
    const result = await tool.execute(tool.validate({}), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.count).toBe(0);
  });
});
