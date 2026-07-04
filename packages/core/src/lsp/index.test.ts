import type { ChildProcess } from "node:child_process";
import type { LspServerConfig } from "ultracode-shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectDiagnostics, connectLspServer, fileUri, LspError } from "./index.js";
import { createFakeChild, defaultResponder, type FakeChild } from "./testutil.test.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const CONFIG: LspServerConfig = {
  name: "ts",
  command: "fake-lsp",
  args: ["--stdio"],
  languages: ["ts", "tsx"],
};

const DIAG = {
  range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
  severity: 1,
  message: "Type error",
  source: "ts",
};

/** Wire a fake child and return the spawnFn to inject. */
function withChild(child: FakeChild): { spawnFn: ReturnType<typeof vi.fn> } {
  return { spawnFn: vi.fn(() => child as unknown as ChildProcess) };
}

describe("connectLspServer", () => {
  it("spawns, handshakes and returns a handle; getDiagnostics collects pushes", async () => {
    const child = createFakeChild(defaultResponder([DIAG]));
    const { spawnFn } = withChild(child);
    const handle = await connectLspServer(CONFIG, { spawnFn, cwd: "/proj", timeoutMs: 1_000 });

    expect(handle.serverName).toBe("ts");
    expect(handle.rootUri).toBe(fileUri("/proj"));

    await handle.openDocument("file:///proj/a.ts", "typescript", "let x: number = 'y';");
    const diagnostics = await handle.getDiagnostics("file:///proj/a.ts", { timeoutMs: 1_000 });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toBe("Type error");

    await handle.dispose();
  });

  it("uses config.rootUri when provided", async () => {
    const child = createFakeChild(defaultResponder([]));
    const { spawnFn } = withChild(child);
    const handle = await connectLspServer(
      { ...CONFIG, rootUri: "file:///custom/root" },
      { spawnFn },
    );
    expect(handle.rootUri).toBe("file:///custom/root");
    await handle.dispose();
  });

  it("rejects with LspError when the command is missing", async () => {
    const err = await connectLspServer({ name: "x", command: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
    expect((err as LspError).message).toMatch(/requires a "command"/);
  });

  it("rejects with LspError and releases the process when spawn fails", async () => {
    const child = createFakeChild(() => [], { spawnError: new Error("ENOENT") });
    const { spawnFn } = withChild(child);
    const err = await connectLspServer(CONFIG, { spawnFn }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LspError);
  });
});

describe("collectDiagnostics", () => {
  it("connects, opens the file and returns pushed diagnostics (text supplied)", async () => {
    const child = createFakeChild(defaultResponder([DIAG]));
    const { spawnFn } = withChild(child);
    const result = await collectDiagnostics(
      CONFIG,
      { filePath: "/proj/a.ts", languageId: "typescript", text: "let x: number = 'y';" },
      { spawnFn, cwd: "/proj", diagnosticsWaitMs: 1_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.uri).toBe(fileUri("/proj/a.ts"));
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toBe("Type error");
  });

  it("reads text from disk via the injected readFile when text is omitted", async () => {
    const child = createFakeChild(defaultResponder([DIAG]));
    const { spawnFn } = withChild(child);
    const readFileImpl = vi.fn(async () => "source from disk");
    const result = await collectDiagnostics(
      CONFIG,
      { filePath: "/proj/a.ts", languageId: "typescript" },
      { spawnFn, cwd: "/proj", diagnosticsWaitMs: 1_000, readFileImpl },
    );
    expect(readFileImpl).toHaveBeenCalledWith("/proj/a.ts");
    expect(result.diagnostics).toHaveLength(1);
  });

  it("is defensive: returns an error and empty diagnostics when connect fails", async () => {
    const child = createFakeChild(() => [], { spawnError: new Error("ENOENT") });
    const { spawnFn } = withChild(child);
    const result = await collectDiagnostics(
      CONFIG,
      { filePath: "/proj/a.ts", languageId: "typescript", text: "x" },
      { spawnFn, cwd: "/proj", diagnosticsWaitMs: 200 },
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("is defensive: returns an error when neither filePath nor uri is given", async () => {
    const result = await collectDiagnostics(CONFIG, { languageId: "typescript" });
    expect(result.diagnostics).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("returns empty (no error) when the server pushes no diagnostics", async () => {
    const child = createFakeChild(defaultResponder([]));
    const { spawnFn } = withChild(child);
    const result = await collectDiagnostics(
      CONFIG,
      { uri: "file:///proj/a.ts", languageId: "typescript", text: "ok" },
      { spawnFn, cwd: "/proj", diagnosticsWaitMs: 1_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });
});

describe("fileUri", () => {
  it("builds an absolute file URI and resolves relative paths against cwd", () => {
    expect(fileUri("/abs/a.ts")).toBe("file:///abs/a.ts");
    expect(fileUri("rel/a.ts", "/base")).toBe("file:///base/rel/a.ts");
  });
});
