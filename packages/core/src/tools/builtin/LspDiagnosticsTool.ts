/**
 * `lsp_diagnostics` — on-demand Language Server diagnostics for one file.
 *
 * Category: project • Default permission: always (read-only analysis).
 *
 * The tool routes a source file to the matching configured Language Server
 * (by file extension / language id), spawns it lazily on first use and reuses
 * the live connection for later calls, opens the document via
 * `textDocument/didOpen` and returns the diagnostics the server pushes
 * (`textDocument/publishDiagnostics`).
 *
 * It is deliberately minimal and fully defensive: when no server is configured
 * or none handles the file, it returns an empty, non-error result carrying a
 * `note`; connection/read failures likewise resolve to an empty result with a
 * `note` instead of crashing the agent loop. Live connections are torn down via
 * {@link LspDiagnosticsTool.dispose} (wired into the facade's dispose path).
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { Logger, LspServerConfig, ToolContext, ToolDefinition } from "ultracode-shared";
import { NoopLogger } from "ultracode-shared";
import { z } from "zod";
import {
  type ConnectLspOptions,
  connectLspServer,
  fileUri,
  LSP_DEFAULT_DIAGNOSTICS_WAIT_MS,
  type LspClientHandle,
  type LspDiagnostic,
  type LspDiagnosticsOptions,
} from "../../lsp/index.js";
import type { ToolRunOutcome } from "../BaseTool.js";
import { BaseTool } from "../BaseTool.js";

/** Human-readable label per LSP severity number (1=Error … 4=Hint). */
type SeverityLabel = "error" | "warning" | "information" | "hint" | "unknown";

/** One diagnostic flattened for the tool's consumers (1-based line/column). */
export interface LspDiagnosticView {
  /** Raw LSP severity number, when the server provided one. */
  severity: number | undefined;
  /** Friendly severity name derived from {@link LspDiagnosticView.severity}. */
  severityLabel: SeverityLabel;
  /** 1-based start line (LSP ranges are 0-based). */
  line: number;
  /** 1-based start column. */
  column: number;
  /** 1-based end line. */
  endLine: number;
  /** 1-based end column. */
  endColumn: number;
  /** Human-readable message. */
  message: string;
  /** Diagnostic source (e.g. `"tsc"`), when provided. */
  source?: string;
  /** Machine-readable code, when provided. */
  code?: string | number;
}

/** Counts of diagnostics by severity. */
export interface LspDiagnosticsSummary {
  errors: number;
  warnings: number;
  information: number;
  hints: number;
  /** Total number of diagnostics. */
  total: number;
}

/** Successful output of the `lsp_diagnostics` tool. */
export interface LspDiagnosticsOutput {
  /** The `file:` URI that was analysed. */
  uri: string;
  /** `true` when a configured server handled the file. */
  matched: boolean;
  /** Name of the server that handled the file, or `null` when none did. */
  server: string | null;
  /** LSP language id sent to the server, or `null` when unrouted. */
  languageId: string | null;
  /** Flattened diagnostics (empty when none / on failure). */
  diagnostics: LspDiagnosticView[];
  /** Counts by severity. */
  summary: LspDiagnosticsSummary;
  /** Set when the file was not analysed as expected (no server / failure). */
  note?: string;
}

/** Construction options for {@link LspDiagnosticsTool}. */
export interface LspDiagnosticsToolOptions {
  /** The configured language servers to route files against. */
  servers: readonly LspServerConfig[];
  /** Structured logger. */
  logger?: Logger;
  /** Environment used to launch the servers. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** How long to wait for the first diagnostics push (ms). */
  diagnosticsWaitMs?: number;
  /** Per-connect handshake timeout (ms). */
  timeoutMs?: number;
  /** Spawn primitive for the stdio transport (test seam). */
  spawnFn?: ConnectLspOptions["spawnFn"];
  /** `fs.readFile` implementation (test seam). */
  readFileImpl?: (absolutePath: string) => Promise<string>;
}

/**
 * Common file-extension → LSP language-id map. Advisory only: routing also
 * matches a server's `languages` entry directly against the raw extension, so
 * either convention (`"ts"` or `"typescript"`) in the config works.
 */
const EXT_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  py: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sh: "shellscript",
  bash: "shellscript",
  lua: "lua",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  ml: "ocaml",
  zig: "zig",
};

/** Lower-cased file extension without the leading dot (`""` for dotfiles). */
function fileExtension(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Base name of a path (for messages). */
function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/** Map an extension onto an LSP language id (falls back to the extension). */
function languageIdFor(ext: string): string {
  return EXT_TO_LANGUAGE[ext] ?? (ext !== "" ? ext : "plaintext");
}

/** Outcome of routing a file to a server. */
interface RouteMatch {
  server: LspServerConfig;
  languageId: string;
}

/**
 * Route a file to a configured server. An explicit `languages` match wins over
 * a server without a `languages` filter (treated as a wildcard that handles any
 * file). Returns `undefined` when nothing matches.
 */
export function matchLspServer(
  servers: readonly LspServerConfig[],
  filePath: string,
): RouteMatch | undefined {
  const ext = fileExtension(filePath);
  const languageId = languageIdFor(ext);
  const lang = languageId.toLowerCase();
  let wildcard: LspServerConfig | undefined;

  for (const server of servers) {
    const langs = (server.languages ?? []).map((l) => l.toLowerCase());
    if (langs.length === 0) {
      wildcard ??= server;
      continue;
    }
    if ((ext !== "" && langs.includes(ext)) || langs.includes(lang)) {
      return { server, languageId };
    }
  }
  return wildcard !== undefined ? { server: wildcard, languageId } : undefined;
}

/** LSP severity number → friendly label. */
function severityLabel(severity: number | undefined): SeverityLabel {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "information";
    case 4:
      return "hint";
    default:
      return "unknown";
  }
}

/** Flatten a raw LSP diagnostic into the tool's view shape. */
function toView(diagnostic: LspDiagnostic): LspDiagnosticView {
  const view: LspDiagnosticView = {
    severity: diagnostic.severity,
    severityLabel: severityLabel(diagnostic.severity),
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
    endLine: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    message: diagnostic.message,
  };
  if (diagnostic.source !== undefined) view.source = diagnostic.source;
  if (diagnostic.code !== undefined) view.code = diagnostic.code;
  return view;
}

/** Count diagnostics by severity. */
function summarise(views: readonly LspDiagnosticView[]): LspDiagnosticsSummary {
  const summary: LspDiagnosticsSummary = {
    errors: 0,
    warnings: 0,
    information: 0,
    hints: 0,
    total: views.length,
  };
  for (const view of views) {
    if (view.severityLabel === "error") summary.errors += 1;
    else if (view.severityLabel === "warning") summary.warnings += 1;
    else if (view.severityLabel === "information") summary.information += 1;
    else if (view.severityLabel === "hint") summary.hints += 1;
  }
  return summary;
}

/** Build an empty (no-diagnostics) output carrying a note. */
function emptyOutput(
  uri: string,
  extra: { server?: string; languageId?: string; note: string },
): LspDiagnosticsOutput {
  return {
    uri,
    matched: extra.server !== undefined,
    server: extra.server ?? null,
    languageId: extra.languageId ?? null,
    diagnostics: [],
    summary: summarise([]),
    note: extra.note,
  };
}

/** Coerce an unknown thrown value into a message string. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const lspDiagnosticsSchema = z.object({
  path: z.string().min(1, "path must be a non-empty string"),
  text: z.string().optional(),
});

/**
 * On-demand Language Server diagnostics for a single file. Spawns/reuses one
 * server per configured entry; never throws from {@link BaseTool.run} — all
 * failure modes resolve to an empty result with an explanatory `note`.
 */
export class LspDiagnosticsTool extends BaseTool<
  typeof lspDiagnosticsSchema,
  LspDiagnosticsOutput
> {
  readonly definition: ToolDefinition = {
    name: "lsp_diagnostics",
    description:
      "Report Language Server diagnostics (errors, warnings, hints) for a source file. " +
      "Routes the file to the matching configured language server by its extension/language " +
      "and returns the diagnostics the server publishes.",
    category: "project",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to the source file to analyse (relative to the working directory or absolute).",
        },
        text: {
          type: "string",
          description: "Optional in-memory file contents to analyse instead of reading from disk.",
        },
      },
      required: ["path"],
    },
    permission: "always",
  };
  protected readonly schema = lspDiagnosticsSchema;

  private readonly servers: readonly LspServerConfig[];
  private readonly logger: Logger;
  private readonly env: Readonly<Record<string, string | undefined>> | undefined;
  private readonly diagnosticsWaitMs: number;
  private readonly timeoutMs: number | undefined;
  private readonly spawnFn: ConnectLspOptions["spawnFn"] | undefined;
  private readonly readFileImpl: (absolutePath: string) => Promise<string>;
  /** Live connections keyed by server name; the value is the connect promise. */
  private readonly handles = new Map<string, Promise<LspClientHandle>>();
  private disposed = false;

  constructor(options: LspDiagnosticsToolOptions) {
    super();
    this.servers = options.servers;
    this.logger = options.logger ?? new NoopLogger();
    this.env = options.env;
    this.diagnosticsWaitMs = options.diagnosticsWaitMs ?? LSP_DEFAULT_DIAGNOSTICS_WAIT_MS;
    this.timeoutMs = options.timeoutMs;
    this.spawnFn = options.spawnFn;
    this.readFileImpl = options.readFileImpl ?? ((absolutePath) => readFile(absolutePath, "utf8"));
  }

  protected async run(
    args: z.output<typeof lspDiagnosticsSchema>,
    ctx: ToolContext,
  ): Promise<ToolRunOutcome<LspDiagnosticsOutput>> {
    this.throwIfAborted(ctx);
    const uri = fileUri(args.path, ctx.cwd);

    const match = matchLspServer(this.servers, args.path);
    if (match === undefined) {
      return { output: emptyOutput(uri, { note: this.noRouteNote(args.path) }) };
    }
    const { server, languageId } = match;

    let text: string;
    try {
      text = args.text ?? (await this.readFileImpl(this.absolutePath(args.path, ctx.cwd)));
    } catch (err) {
      return {
        output: emptyOutput(uri, {
          server: server.name,
          languageId,
          note: `Could not read "${args.path}": ${messageOf(err)}`,
        }),
      };
    }

    try {
      const handle = await this.getHandle(server, ctx.cwd, ctx.signal);
      await handle.openDocument(uri, languageId, text, 1);
      const waitOptions: LspDiagnosticsOptions = { timeoutMs: this.diagnosticsWaitMs };
      if (ctx.signal !== undefined) waitOptions.signal = ctx.signal;
      const diagnostics = await handle.getDiagnostics(uri, waitOptions);
      const views = diagnostics.map(toView);
      return {
        output: {
          uri,
          matched: true,
          server: server.name,
          languageId,
          diagnostics: views,
          summary: summarise(views),
        },
      };
    } catch (err) {
      // The connection failed mid-flight; drop it so a later call can retry.
      this.handles.delete(server.name);
      return {
        output: emptyOutput(uri, {
          server: server.name,
          languageId,
          note: `LSP server "${server.name}" failed: ${messageOf(err)}`,
        }),
      };
    }
  }

  /** Get the live connection for a server, connecting (and caching) on first use. */
  private getHandle(
    server: LspServerConfig,
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<LspClientHandle> {
    const existing = this.handles.get(server.name);
    if (existing !== undefined) return existing;

    const options: ConnectLspOptions = { logger: this.logger, cwd };
    if (this.env !== undefined) options.env = this.env;
    if (this.timeoutMs !== undefined) options.timeoutMs = this.timeoutMs;
    if (this.spawnFn !== undefined) options.spawnFn = this.spawnFn;
    if (signal !== undefined) options.signal = signal;

    const promise = connectLspServer(server, options).catch((err: unknown) => {
      // Never cache a rejected connection.
      this.handles.delete(server.name);
      throw err;
    });
    this.handles.set(server.name, promise);
    return promise;
  }

  /** Resolve a (possibly relative) request path against the working directory. */
  private absolutePath(filePath: string, cwd: string): string {
    return isAbsolute(filePath) ? filePath : resolvePath(cwd, filePath);
  }

  /** Note explaining why a file was not routed to any server. */
  private noRouteNote(filePath: string): string {
    if (this.servers.length === 0) {
      return "No LSP server configured. Add an [[lsp_servers]] entry to enable diagnostics.";
    }
    const detected = languageIdFor(fileExtension(filePath));
    const configured = this.servers
      .map((s) => `${s.name} (${(s.languages ?? []).join(", ") || "any"})`)
      .join("; ");
    return (
      `No configured LSP server handles "${baseName(filePath)}" ` +
      `(detected language "${detected}"). Configured servers: ${configured}.`
    );
  }

  /** Dispose every live connection. Best-effort; never throws. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const pending = [...this.handles.values()];
    this.handles.clear();
    await Promise.all(
      pending.map(async (promise) => {
        try {
          const handle = await promise;
          await handle.dispose();
        } catch (err) {
          this.logger.debug("LSP diagnostics tool: dispose of a handle failed", {
            error: messageOf(err),
          });
        }
      }),
    );
  }
}
