/**
 * Shared test helpers for the LSP suites.
 *
 * Named `*.test.ts` so it is excluded from the build (it ships no runtime code);
 * carries a smoke test so vitest accepts the file.
 */

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Logger } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import type {
  JsonRpcNotificationMessage,
  JsonRpcRequestMessage,
  JsonRpcResponseMessage,
  LspNotificationHandler,
  LspRequestOptions,
  LspTransport,
} from "./transport.js";
import { JSONRPC_VERSION, parseContentLength } from "./transport.js";

/** Logger that captures every call for assertions. */
export interface CapturedLog {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  meta?: Record<string, unknown>;
}

/** Create a capturing logger plus its buffer. */
export function captureLogger(): { logger: Logger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = [];
  const push =
    (level: CapturedLog["level"]) =>
    (msg: string, meta?: Record<string, unknown>): void => {
      const entry: CapturedLog = { level, msg };
      if (meta !== undefined) entry.meta = meta;
      logs.push(entry);
    };
  return {
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
    logs,
  };
}

/** A parsed incoming message: request (has id) or notification. */
export type IncomingMessage = JsonRpcRequestMessage | JsonRpcNotificationMessage;

/** An outgoing message the fake server emits: a response or a notification. */
export type OutgoingMessage = JsonRpcResponseMessage | JsonRpcNotificationMessage;

/** Responder: given a request/notification, return the messages to emit. */
export type FakeResponder = (message: IncomingMessage) => OutgoingMessage[];

/** Encode a message as a single `Content-Length`-framed buffer. */
export function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii");
  return Buffer.concat([header, body]);
}

/**
 * A default LSP server responder: answers `initialize` and `shutdown`, and — in
 * reply to a `textDocument/didOpen` notification — pushes a
 * `textDocument/publishDiagnostics` notification carrying `diagnostics` for the
 * opened URI.
 */
export function defaultResponder(diagnostics: unknown[]): FakeResponder {
  return (message) => {
    if ("id" in message) {
      const id = message.id;
      if (message.method === "initialize") {
        return [
          {
            jsonrpc: JSONRPC_VERSION,
            id,
            result: {
              capabilities: { textDocumentSync: 1 },
              serverInfo: { name: "fake-lsp", version: "0.0.1" },
            },
          },
        ];
      }
      if (message.method === "shutdown") {
        return [{ jsonrpc: JSONRPC_VERSION, id, result: null }];
      }
      return [
        { jsonrpc: JSONRPC_VERSION, id, error: { code: -32601, message: "Method not found" } },
      ];
    }
    if (message.method === "textDocument/didOpen") {
      const params = message.params as { textDocument?: { uri?: string } } | undefined;
      const uri = params?.textDocument?.uri ?? "file:///unknown";
      return [
        {
          jsonrpc: JSONRPC_VERSION,
          method: "textDocument/publishDiagnostics",
          params: { uri, diagnostics },
        },
      ];
    }
    return [];
  };
}

/** A fake `ChildProcess` that speaks `Content-Length`-framed JSON-RPC. */
export interface FakeChild extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  pid?: number;
  kill(signal?: string): boolean;
  /** Test helper: emit one message as a framed unit on stdout. */
  emitMessage(message: unknown): void;
  /** Test helper: emit raw bytes on stdout (to exercise partial frames). */
  emitRaw(bytes: Buffer): void;
}

/** Options controlling the fake child's spawn behaviour. */
export interface FakeChildOptions {
  /** Emit `error` (not `spawn`) to simulate a failed launch. */
  spawnError?: Error;
  /** Skip auto-emitting `spawn` (test drives lifecycle manually). */
  noAutoSpawn?: boolean;
}

/**
 * Build a fake child that runs `responder` against every framed message written
 * to its stdin, writing the responses back framed on stdout. Emits `spawn` on
 * the next tick unless configured otherwise.
 */
export function createFakeChild(
  responder: FakeResponder,
  options: FakeChildOptions = {},
): FakeChild {
  const emitter = new EventEmitter() as FakeChild;
  emitter.stdin = new PassThrough();
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  emitter.pid = 4242;
  emitter.kill = (signal?: string): boolean => {
    emitter.emit("exit", null, signal ?? "SIGTERM");
    return true;
  };
  emitter.emitMessage = (message: unknown): void => {
    emitter.stdout.write(frame(message));
  };
  emitter.emitRaw = (bytes: Buffer): void => {
    emitter.stdout.write(bytes);
  };

  let buffer = Buffer.alloc(0);
  emitter.stdin.on("data", (chunk: Buffer) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const contentLength = parseContentLength(buffer.subarray(0, headerEnd).toString("ascii"));
      const bodyStart = headerEnd + 4;
      if (contentLength === undefined) {
        buffer = buffer.subarray(bodyStart);
        continue;
      }
      const bodyEnd = bodyStart + contentLength;
      if (buffer.length < bodyEnd) break;
      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);
      let parsed: IncomingMessage;
      try {
        parsed = JSON.parse(body) as IncomingMessage;
      } catch {
        continue;
      }
      for (const out of responder(parsed)) emitter.stdout.write(frame(out));
    }
  });

  if (options.spawnError !== undefined) {
    setImmediate(() => emitter.emit("error", options.spawnError));
  } else if (options.noAutoSpawn !== true) {
    setImmediate(() => emitter.emit("spawn"));
  }
  return emitter;
}

/** A scripted {@link LspTransport} for exercising {@link LspClient} in isolation. */
export class ScriptedTransport implements LspTransport {
  started = false;
  closed = false;
  readonly requests: JsonRpcRequestMessage[] = [];
  readonly notifications: JsonRpcNotificationMessage[] = [];
  private handler: LspNotificationHandler | undefined;

  constructor(
    private readonly responder: (
      message: JsonRpcRequestMessage,
    ) => JsonRpcResponseMessage | Promise<JsonRpcResponseMessage>,
  ) {}

  start(): Promise<void> {
    this.started = true;
    return Promise.resolve();
  }

  async request(
    message: JsonRpcRequestMessage,
    _options?: LspRequestOptions,
  ): Promise<JsonRpcResponseMessage> {
    this.requests.push(message);
    return this.responder(message);
  }

  notify(message: JsonRpcNotificationMessage): Promise<void> {
    this.notifications.push(message);
    return Promise.resolve();
  }

  onNotification(handler: LspNotificationHandler): void {
    this.handler = handler;
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Test helper: simulate a server→client notification push. */
  push(method: string, params: unknown): void {
    this.handler?.(method, params);
  }
}

describe("lsp testutil", () => {
  it("fake child answers initialize with a framed response", async () => {
    const child = createFakeChild(defaultResponder([]));
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(Buffer.concat(chunks).toString("utf8")).toContain("fake-lsp");
  });
});
