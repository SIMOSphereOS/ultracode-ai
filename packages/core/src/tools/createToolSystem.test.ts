import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolContext, UltraCodeConfig } from "ultracode-shared";
import { DEFAULT_CONFIG, EventBus, NoopLogger } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToolSystem } from "./createToolSystem.js";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

function makeConfig(mutate?: (c: UltraCodeConfig) => void): UltraCodeConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  mutate?.(config);
  return config;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-system-"));
});

afterEach(async () => {
  // maxRetries handles Windows EBUSY: a just-killed bash process tree can still
  // briefly hold the temp cwd open when teardown runs.
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("createToolSystem", () => {
  it("registers all built-in tools", () => {
    const { registry } = createToolSystem(makeConfig(), new NoopLogger());
    expect(registry.list().map((d) => d.name)).toEqual([
      "bash",
      "delete_file",
      "dependencies",
      "edit",
      "git_diff",
      "git_log",
      "git_status",
      "glob",
      "grep",
      "project_status",
      "read",
      "todo",
      "write_file",
    ]);
  });

  it("assigns categories and default permissions per the architecture table", () => {
    const { registry } = createToolSystem(makeConfig(), new NoopLogger());
    const byName = Object.fromEntries(registry.list().map((d) => [d.name, d]));

    for (const file of ["read", "write_file", "edit", "delete_file"]) {
      expect(byName[file]).toMatchObject({ category: "file", permission: "ask" });
    }
    for (const search of ["grep", "glob"]) {
      expect(byName[search]).toMatchObject({ category: "search", permission: "always" });
    }
    for (const system of ["bash", "git_status", "git_diff", "git_log"]) {
      expect(byName[system]).toMatchObject({ category: "system", permission: "ask" });
    }
    for (const project of ["project_status", "dependencies"]) {
      expect(byName[project]).toMatchObject({ category: "project", permission: "always" });
    }
    expect(byName["todo"]).toMatchObject({ category: "utility", permission: "always" });
  });

  it("executes read end-to-end through the executor (ask → confirm)", async () => {
    await fs.writeFile(path.join(root, "hello.txt"), "hallo welt");
    const events = new EventBus();
    const emitted: string[] = [];
    events.on("tool.executed", (e) => emitted.push(`${e.toolName}:${String(e.ok)}`));

    const { executor } = createToolSystem(makeConfig(), new NoopLogger(), events);
    const result = await executor.execute<{ content: string }>(
      "read",
      { file_path: "hello.txt" },
      ctx({ confirm: async () => true }),
    );
    expect(result.ok).toBe(true);
    expect(result.output.content).toBe("hallo welt");
    expect(emitted).toEqual(["read:true"]);
  });

  it("denies file tools without a confirm channel (default ask)", async () => {
    await fs.writeFile(path.join(root, "hello.txt"), "x");
    const { executor } = createToolSystem(makeConfig(), new NoopLogger());
    const result = await executor.execute("read", { file_path: "hello.txt" }, ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("applies perTool config: protectedExtensions, maxMatches, allowedDirs", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "uc-allowed-"));
    try {
      await fs.writeFile(path.join(outside, "shared.txt"), "extern");
      await fs.writeFile(path.join(root, "data.txt"), "m\nm\nm\nm\nm");

      const config = makeConfig((c) => {
        c.tools.perTool["write_file"] = {
          permission: "always",
          protectedExtensions: [".env"],
        };
        c.tools.perTool["grep"] = { maxMatches: 2 };
        c.tools.perTool["read"] = { permission: "always", allowedDirs: [outside] };
      });
      const { executor } = createToolSystem(config, new NoopLogger());

      // write_file: protected extension denied, permission override works
      const blocked = await executor.execute(
        "write_file",
        { path: "secrets.env", content: "x" },
        ctx(),
      );
      expect(blocked.ok).toBe(false);
      expect(blocked.error?.code).toBe("TOOL_PERMISSION_DENIED");

      const allowed = await executor.execute("write_file", { path: "ok.txt", content: "x" }, ctx());
      expect(allowed.ok).toBe(true);

      // grep: maxMatches cap from config
      const grep = await executor.execute<{ count: number; limitReached: boolean }>(
        "grep",
        { pattern: "m" },
        ctx(),
      );
      expect(grep.ok).toBe(true);
      expect(grep.output.count).toBe(2);
      expect(grep.output.limitReached).toBe(true);

      // read: allowedDirs grants access outside cwd
      const read = await executor.execute<{ content: string }>(
        "read",
        { file_path: path.join(outside, "shared.txt") },
        ctx(),
      );
      expect(read.ok).toBe(true);
      expect(read.output.content).toBe("extern");
    } finally {
      await fs.rm(outside, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("first run (no override) denies writing .env and reading id_rsa (safe defaults)", async () => {
    const { executor } = createToolSystem(makeConfig(), new NoopLogger());

    // write_file: default protected_extensions blocks .env out of the box.
    const write = await executor.execute(
      "write_file",
      { path: ".env", content: "SECRET=1" },
      ctx({ confirm: async () => true }),
    );
    expect(write.ok).toBe(false);
    expect(write.error?.code).toBe("TOOL_PERMISSION_DENIED");

    // read: default read-deny blocks id_rsa even though the file exists.
    await fs.writeFile(path.join(root, "id_rsa"), "----PRIVATE KEY----");
    const read = await executor.execute(
      "read",
      { file_path: "id_rsa" },
      ctx({ confirm: async () => true }),
    );
    expect(read.ok).toBe(false);
    expect(read.error?.code).toBe("TOOL_PERMISSION_DENIED");

    // edit: default protected_extensions blocks editing an existing .git/config
    // out of the box (the write tool already protects it — so must edit).
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, ".git", "config"), "[core]\n\tbare = false");
    const edit = await executor.execute(
      "edit",
      { file_path: ".git/config", old_string: "false", new_string: "true" },
      ctx({ confirm: async () => true }),
    );
    expect(edit.ok).toBe(false);
    expect(edit.error?.code).toBe("TOOL_PERMISSION_DENIED");
    expect(await fs.readFile(path.join(root, ".git", "config"), "utf8")).toContain("bare = false");

    // benign files are unaffected by the defaults.
    const ok = await executor.execute(
      "write_file",
      { path: "ok.txt", content: "hi" },
      ctx({ confirm: async () => true }),
    );
    expect(ok.ok).toBe(true);
  });

  it("an explicit empty override opts out of the safe defaults", async () => {
    const config = makeConfig((c) => {
      c.tools.perTool["write_file"] = { permission: "always", protectedExtensions: [] };
      c.tools.perTool["read"] = { permission: "always", readDeny: [] };
      c.tools.perTool["edit"] = { permission: "always", protectedExtensions: [] };
    });
    const { executor } = createToolSystem(config, new NoopLogger());

    const write = await executor.execute("write_file", { path: ".env", content: "x=old" }, ctx());
    expect(write.ok).toBe(true);

    await fs.writeFile(path.join(root, "id_rsa"), "data");
    const read = await executor.execute<{ content: string }>(
      "read",
      { file_path: "id_rsa" },
      ctx(),
    );
    expect(read.ok).toBe(true);
    expect(read.output.content).toBe("data");

    // edit: empty override opts the edit tool out of the protected-file guard.
    const edit = await executor.execute<{ replacements: number }>(
      "edit",
      { file_path: ".env", old_string: "old", new_string: "new" },
      ctx(),
    );
    expect(edit.ok).toBe(true);
    expect(await fs.readFile(path.join(root, ".env"), "utf8")).toBe("x=new");
  });

  it("honours tools.disabled for built-ins", async () => {
    const config = makeConfig((c) => {
      c.tools.disabled = ["bash"];
    });
    const { executor } = createToolSystem(config, new NoopLogger());
    const result = await executor.execute(
      "bash",
      { command: "echo hi" },
      ctx({ confirm: async () => true }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
  });

  it("end-to-end: timeout from perTool config kills a long-running bash command", async () => {
    const config = makeConfig((c) => {
      c.tools.perTool["bash"] = { permission: "always", timeout: 0.3 };
    });
    const { executor } = createToolSystem(config, new NoopLogger());
    const started = Date.now();
    const result = await executor.execute(
      "bash",
      { command: `"${process.execPath}" -e "setTimeout(()=>{},10000)"` },
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(8000);
  }, 15_000);
});
