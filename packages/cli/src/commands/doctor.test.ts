import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "@ultracode/shared";
import {
  collectDoctorReport,
  defaultCheckWritable,
  renderDoctorReport,
  type DoctorDeps,
} from "./doctor.js";

function makeDeps(over: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    nodeVersion: "20.11.1",
    env: {},
    isTTY: true,
    gitVersion: async () => "git version 2.43.0",
    configDir: path.join(os.tmpdir(), "ultracode-doctor-na"),
    checkWritable: async () => true,
    loadConfig: async () => {},
    ...over,
  };
}

function check(report: Awaited<ReturnType<typeof collectDoctorReport>>, name: string) {
  const c = report.checks.find((x) => x.name === name);
  if (!c) throw new Error(`check ${name} missing`);
  return c;
}

describe("collectDoctorReport — node version", () => {
  it("fails critically on Node 18", async () => {
    const report = await collectDoctorReport(makeDeps({ nodeVersion: "18.19.0" }));
    expect(check(report, "node").ok).toBe(false);
    expect(check(report, "node").critical).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("passes on Node 20 (boundary)", async () => {
    const report = await collectDoctorReport(makeDeps({ nodeVersion: "20.0.0" }));
    expect(check(report, "node").ok).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("passes on Node 22", async () => {
    const report = await collectDoctorReport(makeDeps({ nodeVersion: "22.4.1" }));
    expect(check(report, "node").ok).toBe(true);
  });

  it("fails gracefully on an unparseable version", async () => {
    const report = await collectDoctorReport(makeDeps({ nodeVersion: "weird" }));
    expect(check(report, "node").ok).toBe(false);
  });
});

describe("collectDoctorReport — git", () => {
  it("reports missing git as ✗ but not critical", async () => {
    const report = await collectDoctorReport(makeDeps({ gitVersion: async () => null }));
    const git = check(report, "git");
    expect(git.ok).toBe(false);
    expect(git.critical).toBe(false);
    expect(report.ok).toBe(true); // everything critical still passes
  });

  it("survives a throwing gitVersion probe", async () => {
    const report = await collectDoctorReport(
      makeDeps({
        gitVersion: async () => {
          throw new Error("spawn EPERM");
        },
      }),
    );
    expect(check(report, "git").ok).toBe(false);
  });
});

describe("collectDoctorReport — config dir / config", () => {
  it("fails critically when the config dir is not writable", async () => {
    const report = await collectDoctorReport(
      makeDeps({ checkWritable: async () => "EACCES: permission denied" }),
    );
    expect(check(report, "config-dir").ok).toBe(false);
    expect(report.ok).toBe(false);
    expect(check(report, "config-dir").detail).toContain("EACCES");
  });

  it("fails critically when the config cannot be loaded", async () => {
    const report = await collectDoctorReport(
      makeDeps({
        loadConfig: async () => {
          throw new ConfigError("temperature must be between 0 and 1");
        },
      }),
    );
    const cfg = check(report, "config");
    expect(cfg.ok).toBe(false);
    expect(cfg.detail).toContain("temperature must be between 0 and 1");
    expect(report.ok).toBe(false);
  });
});

describe("collectDoctorReport — api keys & terminal", () => {
  it("masks present API keys and never leaks the value", async () => {
    const report = await collectDoctorReport(
      makeDeps({ env: { MISTRAL_API_KEY: "sk-supersecret-123456" } }),
    );
    const keys = check(report, "api-keys");
    expect(keys.ok).toBe(true);
    expect(keys.detail).toContain("MISTRAL_API_KEY=sk-***");
    expect(JSON.stringify(report)).not.toContain("sk-supersecret-123456");
    expect(renderDoctorReport(report)).not.toContain("sk-supersecret-123456");
  });

  it("hints at --setup when no keys are present", async () => {
    const report = await collectDoctorReport(makeDeps({ env: {} }));
    const keys = check(report, "api-keys");
    expect(keys.ok).toBe(false);
    expect(keys.critical).toBe(false);
    expect(keys.detail).toContain("--setup");
  });

  it("ignores empty-string keys", async () => {
    const report = await collectDoctorReport(makeDeps({ env: { OPENAI_API_KEY: "   " } }));
    expect(check(report, "api-keys").ok).toBe(false);
  });

  it("reports a non-TTY terminal without failing the report", async () => {
    const report = await collectDoctorReport(makeDeps({ isTTY: false }));
    expect(check(report, "terminal").ok).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("mentions NO_COLOR when set", async () => {
    const report = await collectDoctorReport(makeDeps({ env: { NO_COLOR: "1" } }));
    expect(check(report, "terminal").detail).toContain("NO_COLOR");
  });
});

describe("renderDoctorReport", () => {
  it("renders a ✓/✗ checklist with a summary line", async () => {
    const report = await collectDoctorReport(makeDeps({ gitVersion: async () => null }));
    const text = renderDoctorReport(report);
    expect(text).toContain("UltraCode Doctor");
    expect(text).toContain("✓ node:");
    expect(text).toContain("✗ git:");
    expect(text).toContain("✓ all critical checks passed");
  });
});

describe("defaultCheckWritable", () => {
  let tmp: string | undefined;

  afterEach(async () => {
    if (tmp !== undefined) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    tmp = undefined;
  });

  it("returns true for a writable directory (and creates it)", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-doctor-"));
    const dir = path.join(tmp, "nested", "config");
    await expect(defaultCheckWritable(dir)).resolves.toBe(true);
    const left = await fs.readdir(dir);
    expect(left).toEqual([]); // marker file cleaned up
  });

  it("returns an error message when the path cannot be created", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "uc-doctor-"));
    const file = path.join(tmp, "a-file");
    await fs.writeFile(file, "x", "utf8");
    const result = await defaultCheckWritable(path.join(file, "sub"));
    expect(typeof result).toBe("string");
  });
});
