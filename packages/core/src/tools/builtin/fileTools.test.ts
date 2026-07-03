import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "ultracode-shared";
import { NoopLogger, ValidationError } from "ultracode-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeleteFileTool } from "./DeleteFileTool.js";
import { EditTool } from "./EditTool.js";
import { ReadTool } from "./ReadTool.js";
import { WriteFileTool } from "./WriteFileTool.js";

let root: string;

function ctx(extra: Partial<ToolContext> = {}): ToolContext {
  return { cwd: root, env: {}, logger: new NoopLogger(), ...extra };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "uc-file-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe("ReadTool", () => {
  const tool = new ReadTool();

  it("reads a file completely", async () => {
    await fs.writeFile(path.join(root, "a.txt"), "line1\nline2\nline3");
    const result = await tool.execute(tool.validate({ file_path: "a.txt" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.content).toBe("line1\nline2\nline3");
    expect(result.output.totalLines).toBe(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("applies offset and limit (1-based lines)", async () => {
    await fs.writeFile(path.join(root, "n.txt"), "1\n2\n3\n4\n5");
    const result = await tool.execute(
      tool.validate({ file_path: "n.txt", offset: 2, limit: 2 }),
      ctx(),
    );
    expect(result.output.content).toBe("2\n3");
    expect(result.output.lineCount).toBe(2);
  });

  it("tolerates CRLF line endings", async () => {
    await fs.writeFile(path.join(root, "crlf.txt"), "a\r\nb\r\nc");
    const result = await tool.execute(
      tool.validate({ file_path: "crlf.txt", offset: 2, limit: 1 }),
      ctx(),
    );
    expect(result.output.content).toBe("b");
    expect(result.output.totalLines).toBe(3);
  });

  it("returns empty content for an offset past the end", async () => {
    await fs.writeFile(path.join(root, "s.txt"), "only");
    const result = await tool.execute(tool.validate({ file_path: "s.txt", offset: 99 }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.content).toBe("");
    expect(result.output.lineCount).toBe(0);
  });

  it("reads empty files", async () => {
    await fs.writeFile(path.join(root, "empty.txt"), "");
    const result = await tool.execute(tool.validate({ file_path: "empty.txt" }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.content).toBe("");
  });

  it("rejects binary files via the NUL-byte heuristic", async () => {
    await fs.writeFile(path.join(root, "bin.dat"), Buffer.from([1, 2, 0, 4, 5]));
    const result = await tool.execute(tool.validate({ file_path: "bin.dat" }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("binary");
  });

  it("enforces the size limit", async () => {
    const small = new ReadTool({ maxFileBytes: 1024 });
    await fs.writeFile(path.join(root, "big.txt"), "y".repeat(2048));
    const result = await small.execute(small.validate({ file_path: "big.txt" }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("too large");
  });

  it("reads >=1 MB files within the default limit", async () => {
    const content = `${"emoji 🚀 line\n".repeat(80_000)}end`; // > 1 MB
    await fs.writeFile(path.join(root, "huge.txt"), content);
    const result = await tool.execute(
      tool.validate({ file_path: "huge.txt", offset: 80_001, limit: 1 }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.content).toBe("end");
  });

  it("handles unicode file names and content", async () => {
    const name = "ünïcôdé-📄.txt";
    await fs.writeFile(path.join(root, name), "héllo 🌍");
    const result = await tool.execute(tool.validate({ file_path: name }), ctx());
    expect(result.ok).toBe(true);
    expect(result.output.content).toBe("héllo 🌍");
  });

  it("fails on missing files and directories", async () => {
    const missing = await tool.execute(tool.validate({ file_path: "nope.txt" }), ctx());
    expect(missing.ok).toBe(false);

    await fs.mkdir(path.join(root, "dir"));
    const dir = await tool.execute(tool.validate({ file_path: "dir" }), ctx());
    expect(dir.ok).toBe(false);
    expect(dir.error?.message).toContain("directory");
  });

  it("blocks path traversal", async () => {
    const result = await tool.execute(tool.validate({ file_path: "../../../etc/passwd" }), ctx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_ERROR");
    expect(result.error?.message).toContain("outside");
  });

  it("denies reading files on the read-deny list (exfiltration guard)", async () => {
    const guarded = new ReadTool({ readDeny: [".env", ".pem", "id_rsa", ".git/config"] });
    await fs.writeFile(path.join(root, ".env"), "SECRET=1");
    await fs.writeFile(path.join(root, "server.pem"), "----KEY----");
    await fs.writeFile(path.join(root, "id_rsa"), "----PRIV----");
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, ".git", "config"), "[core]");

    for (const target of [".env", "server.pem", "id_rsa", ".git/config"]) {
      const result = await guarded.execute(guarded.validate({ file_path: target }), ctx());
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
    }

    // unprotected sibling still reads
    await fs.writeFile(path.join(root, "notes.txt"), "ok");
    const ok = await guarded.execute(guarded.validate({ file_path: "notes.txt" }), ctx());
    expect(ok.ok).toBe(true);
    expect(ok.output.content).toBe("ok");
  });

  it("read-deny does not over-match similar names", async () => {
    const guarded = new ReadTool({ readDeny: [".env", "id_rsa"] });
    await fs.writeFile(path.join(root, "x.environment"), "ok");
    await fs.writeFile(path.join(root, "id_rsa.pub"), "public");
    const env = await guarded.execute(guarded.validate({ file_path: "x.environment" }), ctx());
    expect(env.ok).toBe(true);
    const pub = await guarded.execute(guarded.validate({ file_path: "id_rsa.pub" }), ctx());
    expect(pub.ok).toBe(true);
  });

  it("throws ValidationError on invalid argument types", () => {
    expect(() => tool.validate({ file_path: 42 })).toThrow(ValidationError);
    expect(() => tool.validate({})).toThrow(ValidationError);
    expect(() => tool.validate({ file_path: "x", offset: 0 })).toThrow(ValidationError);
    expect(() => tool.validate(null)).toThrow(ValidationError);
  });
});

describe("WriteFileTool", () => {
  const tool = new WriteFileTool();

  it("creates files including parent directories", async () => {
    const result = await tool.execute(
      tool.validate({ path: path.join("deep", "er", "f.txt"), content: "hi" }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    const written = await fs.readFile(path.join(root, "deep", "er", "f.txt"), "utf8");
    expect(written).toBe("hi");
  });

  it("overwrites existing files atomically (no temp residue)", async () => {
    await fs.writeFile(path.join(root, "f.txt"), "old");
    const result = await tool.execute(
      tool.validate({ path: "f.txt", content: "new content" }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "f.txt"), "utf8")).toBe("new content");
    const leftovers = (await fs.readdir(root)).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("writes >=1 MB unicode content correctly", async () => {
    const content = "🧪äöü".repeat(300_000); // > 1 MB code units
    const result = await tool.execute(tool.validate({ path: "big.txt", content }), ctx());
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "big.txt"), "utf8")).toBe(content);
    expect(result.output.bytesWritten).toBe(Buffer.byteLength(content, "utf8"));
  });

  it("denies protected extensions and dotfile names", async () => {
    const guarded = new WriteFileTool({ protectedExtensions: [".env", ".toml"] });
    for (const target of [".env", "secrets.env", "config.toml", "sub/x.TOML"]) {
      const result = await guarded.execute(guarded.validate({ path: target, content: "x" }), ctx());
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
    }
    // unprotected sibling extension still works
    const ok = await guarded.execute(
      guarded.validate({ path: "x.environment", content: "x" }),
      ctx(),
    );
    expect(ok.ok).toBe(true);
  });

  it("denies path-suffix protected entries (e.g. .git/config)", async () => {
    const guarded = new WriteFileTool({ protectedExtensions: [".git/config", "id_rsa"] });
    for (const target of [".git/config", path.join("sub", ".git", "config"), "id_rsa"]) {
      const result = await guarded.execute(guarded.validate({ path: target, content: "x" }), ctx());
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
    }
    // a plain config (not under .git) is fine
    const ok = await guarded.execute(guarded.validate({ path: "config", content: "x" }), ctx());
    expect(ok.ok).toBe(true);
  });

  it("blocks writes outside the sandbox", async () => {
    const result = await tool.execute(
      tool.validate({ path: "../escape.txt", content: "x" }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("outside");
  });

  it("throws ValidationError for missing content", () => {
    expect(() => tool.validate({ path: "a.txt" })).toThrow(ValidationError);
    expect(() => tool.validate({ path: "", content: "x" })).toThrow(ValidationError);
  });
});

describe("EditTool", () => {
  const tool = new EditTool();

  it("replaces a unique string", async () => {
    await fs.writeFile(path.join(root, "e.txt"), "hello world");
    const result = await tool.execute(
      tool.validate({ file_path: "e.txt", old_string: "world", new_string: "🌍" }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.replacements).toBe(1);
    expect(await fs.readFile(path.join(root, "e.txt"), "utf8")).toBe("hello 🌍");
  });

  it("fails when old_string is missing", async () => {
    await fs.writeFile(path.join(root, "e.txt"), "abc");
    const result = await tool.execute(
      tool.validate({ file_path: "e.txt", old_string: "zzz", new_string: "x" }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("not found");
  });

  it("fails when old_string is ambiguous without replace_all", async () => {
    await fs.writeFile(path.join(root, "e.txt"), "dup dup dup");
    const result = await tool.execute(
      tool.validate({ file_path: "e.txt", old_string: "dup", new_string: "x" }),
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("3 times");
  });

  it("replaces all occurrences with replace_all", async () => {
    await fs.writeFile(path.join(root, "e.txt"), "a-b-a-b-a");
    const result = await tool.execute(
      tool.validate({ file_path: "e.txt", old_string: "a", new_string: "Z", replace_all: true }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.output.replacements).toBe(3);
    expect(await fs.readFile(path.join(root, "e.txt"), "utf8")).toBe("Z-b-Z-b-Z");
  });

  it("handles $-patterns in new_string literally", async () => {
    await fs.writeFile(path.join(root, "e.txt"), "find me");
    await tool.execute(
      tool.validate({ file_path: "e.txt", old_string: "me", new_string: "$& $1 $'" }),
      ctx(),
    );
    expect(await fs.readFile(path.join(root, "e.txt"), "utf8")).toBe("find $& $1 $'");
  });

  it("preserves CRLF content around the edit", async () => {
    await fs.writeFile(path.join(root, "crlf.txt"), "a\r\nTARGET\r\nc");
    const result = await tool.execute(
      tool.validate({ file_path: "crlf.txt", old_string: "TARGET", new_string: "b" }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "crlf.txt"), "utf8")).toBe("a\r\nb\r\nc");
  });

  it("fails on identical old/new strings and missing files", async () => {
    await fs.writeFile(path.join(root, "e.txt"), "x");
    const same = await tool.execute(
      tool.validate({ file_path: "e.txt", old_string: "x", new_string: "x" }),
      ctx(),
    );
    expect(same.ok).toBe(false);

    const missing = await tool.execute(
      tool.validate({ file_path: "missing.txt", old_string: "a", new_string: "b" }),
      ctx(),
    );
    expect(missing.ok).toBe(false);
  });

  it("rejects empty old_string at validation time", () => {
    expect(() => tool.validate({ file_path: "f", old_string: "", new_string: "x" })).toThrow(
      ValidationError,
    );
  });

  it("denies editing protected extensions and dotfile names", async () => {
    const guarded = new EditTool({ protectedExtensions: [".env", ".toml"] });
    await fs.writeFile(path.join(root, ".env"), "SECRET=old");
    await fs.writeFile(path.join(root, "config.toml"), "k = 'old'");
    for (const target of [".env", "config.toml"]) {
      const result = await guarded.execute(
        guarded.validate({ file_path: target, old_string: "old", new_string: "new" }),
        ctx(),
      );
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
    }
    // protected file is left untouched
    expect(await fs.readFile(path.join(root, ".env"), "utf8")).toBe("SECRET=old");

    // unprotected sibling extension still edits
    await fs.writeFile(path.join(root, "x.environment"), "old");
    const ok = await guarded.execute(
      guarded.validate({ file_path: "x.environment", old_string: "old", new_string: "new" }),
      ctx(),
    );
    expect(ok.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "x.environment"), "utf8")).toBe("new");
  });

  it("denies editing path-suffix protected entries (e.g. .git/config)", async () => {
    const guarded = new EditTool({ protectedExtensions: [".git/config", "id_rsa"] });
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, ".git", "config"), "[core]\n\told = 1");
    await fs.writeFile(path.join(root, "id_rsa"), "----OLD KEY----");
    for (const target of [".git/config", "id_rsa"]) {
      const result = await guarded.execute(
        guarded.validate({ file_path: target, old_string: "old", new_string: "new" }),
        ctx(),
      );
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_PERMISSION_DENIED");
    }
    // a plain config (not under .git) is fine
    await fs.writeFile(path.join(root, "config"), "old");
    const ok = await guarded.execute(
      guarded.validate({ file_path: "config", old_string: "old", new_string: "new" }),
      ctx(),
    );
    expect(ok.ok).toBe(true);
  });

  it("without a protectedExtensions list, edits any file (opt-out)", async () => {
    const open = new EditTool();
    await fs.writeFile(path.join(root, ".env"), "SECRET=old");
    const result = await open.execute(
      open.validate({ file_path: ".env", old_string: "old", new_string: "new" }),
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(root, ".env"), "utf8")).toBe("SECRET=new");
  });
});

describe("DeleteFileTool", () => {
  const tool = new DeleteFileTool();

  it("deletes a file", async () => {
    await fs.writeFile(path.join(root, "gone.txt"), "x");
    const result = await tool.execute(tool.validate({ path: "gone.txt" }), ctx());
    expect(result.ok).toBe(true);
    await expect(fs.stat(path.join(root, "gone.txt"))).rejects.toThrow();
  });

  it("fails on missing files, directories and traversal", async () => {
    expect((await tool.execute(tool.validate({ path: "nope" }), ctx())).ok).toBe(false);

    await fs.mkdir(path.join(root, "d"));
    const dir = await tool.execute(tool.validate({ path: "d" }), ctx());
    expect(dir.ok).toBe(false);
    expect(dir.error?.message).toContain("directory");

    const out = await tool.execute(tool.validate({ path: "../oops" }), ctx());
    expect(out.ok).toBe(false);
  });
});
