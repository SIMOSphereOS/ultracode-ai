import type { ChildProcess } from "node:child_process";
import type { LspServerConfig, ToolContext } from "ultracode-shared";
import { NoopLogger, ValidationError } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeChild, defaultResponder, type FakeChild } from "../../lsp/testutil.test.js";
import { LspDiagnosticsTool, matchLspServer } from "./LspDiagnosticsTool.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const TS_SERVER: LspServerConfig = {
  name: "ts",
  command: "fake-ts-lsp",
  args: ["--stdio"],
  languages: ["ts", "tsx"],
};

const DIAG = {
  range: { start: { line: 4, character: 6 }, end: { line: 4, character: 9 } },
  severity: 1,
  message: "Type error",
  source: "ts",
};

const WARN_DIAG = {
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  severity: 2,
  message: "Unused variable",
};

/** A ToolContext for a fixed working directory. */
function ctx(cwd = "/proj"): ToolContext {
  return { cwd, env: {}, logger: new NoopLogger() };
}

/** spawnFn that returns a fresh fake child per call, backed by `responder`. */
function fakeSpawn(makeChild: () => FakeChild): ReturnType<typeof vi.fn> {
  return vi.fn(() => makeChild() as unknown as ChildProcess);
}

describe("matchLspServer (routing)", () => {
  it("routes by file extension and derives the LSP language id", () => {
    const match = matchLspServer([TS_SERVER], "src/a.ts");
    expect(match?.server.name).toBe("ts");
    expect(match?.languageId).toBe("typescript");
  });

  it("matches a server whose languages carry the language id, not the extension", () => {
    const server: LspServerConfig = { name: "py", command: "pylsp", languages: ["python"] };
    const match = matchLspServer([server], "app/main.py");
    expect(match?.server.name).toBe("py");
    expect(match?.languageId).toBe("python");
  });

  it("returns undefined when no server handles the extension", () => {
    expect(matchLspServer([TS_SERVER], "notes.md")).toBeUndefined();
  });

  it("returns undefined when no servers are configured", () => {
    expect(matchLspServer([], "a.ts")).toBeUndefined();
  });

  it("treats a server without a languages filter as a wildcard", () => {
    const wildcard: LspServerConfig = { name: "any", command: "generic-lsp" };
    const match = matchLspServer([wildcard], "weird.xyz");
    expect(match?.server.name).toBe("any");
  });

  it("prefers an explicit language match over a wildcard server", () => {
    const wildcard: LspServerConfig = { name: "any", command: "generic-lsp" };
    const match = matchLspServer([wildcard, TS_SERVER], "a.ts");
    expect(match?.server.name).toBe("ts");
  });
});

describe("LspDiagnosticsTool.validate", () => {
  it("rejects a missing/empty path with ValidationError", () => {
    const tool = new LspDiagnosticsTool({ servers: [TS_SERVER] });
    expect(() => tool.validate({})).toThrow(ValidationError);
    expect(() => tool.validate({ path: "" })).toThrow(ValidationError);
    expect(tool.validate({ path: "a.ts" })).toEqual({ path: "a.ts" });
  });
});

describe("LspDiagnosticsTool.execute", () => {
  it("routes, opens the document and returns mapped diagnostics (text supplied)", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(defaultResponder([DIAG])));
    const tool = new LspDiagnosticsTool({
      servers: [TS_SERVER],
      spawnFn,
      diagnosticsWaitMs: 1_000,
    });

    const result = await tool.execute({ path: "src/a.ts", text: "let x: number = 'y';" }, ctx());
    expect(result.ok).toBe(true);
    const output = result.output;
    expect(output.matched).toBe(true);
    expect(output.server).toBe("ts");
    expect(output.languageId).toBe("typescript");
    expect(output.diagnostics).toHaveLength(1);
    // LSP ranges are 0-based; the view exposes 1-based line/column.
    expect(output.diagnostics[0]).toMatchObject({
      severityLabel: "error",
      line: 5,
      column: 7,
      message: "Type error",
      source: "ts",
    });
    expect(output.summary).toMatchObject({ errors: 1, warnings: 0, total: 1 });
    expect(output.note).toBeUndefined();

    await tool.dispose();
  });

  it("reuses one connection across calls (spawns the server once)", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(defaultResponder([WARN_DIAG])));
    const tool = new LspDiagnosticsTool({
      servers: [TS_SERVER],
      spawnFn,
      diagnosticsWaitMs: 1_000,
    });

    await tool.execute({ path: "a.ts", text: "one" }, ctx());
    await tool.execute({ path: "b.ts", text: "two" }, ctx());
    expect(spawnFn).toHaveBeenCalledTimes(1);

    await tool.dispose();
  });

  it("reads the file from disk via readFileImpl when text is omitted", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(defaultResponder([DIAG])));
    const readFileImpl = vi.fn(async () => "source from disk");
    const tool = new LspDiagnosticsTool({
      servers: [TS_SERVER],
      spawnFn,
      diagnosticsWaitMs: 1_000,
      readFileImpl,
    });

    const result = await tool.execute({ path: "a.ts" }, ctx("/proj"));
    expect(readFileImpl).toHaveBeenCalledWith("/proj/a.ts");
    expect(result.output.diagnostics).toHaveLength(1);

    await tool.dispose();
  });

  it("returns a non-error, empty result with a note when no server handles the file", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(defaultResponder([])));
    const tool = new LspDiagnosticsTool({ servers: [TS_SERVER], spawnFn });

    const result = await tool.execute({ path: "readme.md", text: "# hi" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output.matched).toBe(false);
    expect(result.output.server).toBeNull();
    expect(result.output.diagnostics).toEqual([]);
    expect(result.output.note).toMatch(/No configured LSP server handles/);
    // Nothing was spawned for an unroutable file.
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("notes that no server is configured when the list is empty", async () => {
    const tool = new LspDiagnosticsTool({ servers: [] });
    const result = await tool.execute({ path: "a.ts", text: "x" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output.matched).toBe(false);
    expect(result.output.note).toMatch(/No LSP server configured/);
  });

  it("is defensive: a failed spawn yields an empty result with a note (never throws)", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(() => [], { spawnError: new Error("ENOENT") }));
    const tool = new LspDiagnosticsTool({
      servers: [TS_SERVER],
      spawnFn,
      diagnosticsWaitMs: 200,
    });

    const result = await tool.execute({ path: "a.ts", text: "x" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output.matched).toBe(true);
    expect(result.output.diagnostics).toEqual([]);
    expect(result.output.note).toMatch(/failed/);

    await tool.dispose();
  });

  it("is defensive: a read failure yields an empty result with a note", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(defaultResponder([])));
    const readFileImpl = vi.fn(async () => {
      throw new Error("ENOENT: no such file");
    });
    const tool = new LspDiagnosticsTool({ servers: [TS_SERVER], spawnFn, readFileImpl });

    const result = await tool.execute({ path: "ghost.ts" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output.diagnostics).toEqual([]);
    expect(result.output.note).toMatch(/Could not read/);
    // The server is never spawned when the document text cannot be read.
    expect(spawnFn).not.toHaveBeenCalled();

    await tool.dispose();
  });

  it("returns empty (no note) when the server publishes no diagnostics", async () => {
    const spawnFn = fakeSpawn(() => createFakeChild(defaultResponder([])));
    const tool = new LspDiagnosticsTool({
      servers: [TS_SERVER],
      spawnFn,
      diagnosticsWaitMs: 1_000,
    });

    const result = await tool.execute({ path: "clean.ts", text: "const ok = 1;" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.output.matched).toBe(true);
    expect(result.output.diagnostics).toEqual([]);
    expect(result.output.note).toBeUndefined();

    await tool.dispose();
  });
});

describe("LspDiagnosticsTool.dispose", () => {
  it("tears down live connections and is idempotent", async () => {
    const child = createFakeChild(defaultResponder([DIAG]));
    const killSpy = vi.spyOn(child, "kill");
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const tool = new LspDiagnosticsTool({
      servers: [TS_SERVER],
      spawnFn,
      diagnosticsWaitMs: 1_000,
    });

    await tool.execute({ path: "a.ts", text: "x" }, ctx());
    await tool.dispose();
    await tool.dispose();
    expect(killSpy).toHaveBeenCalled();
  });

  it("never throws even when there is nothing to dispose", async () => {
    const tool = new LspDiagnosticsTool({ servers: [TS_SERVER] });
    await expect(tool.dispose()).resolves.toBeUndefined();
  });
});
