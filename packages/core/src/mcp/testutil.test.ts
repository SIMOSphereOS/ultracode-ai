/**
 * Shared test helpers for the MCP suites.
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
} from "./jsonRpc.js";
import { JSONRPC_VERSION } from "./jsonRpc.js";
import type { McpRequestOptions, McpTransport } from "./transport.js";

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

/** Responder: given a request/notification, return the response lines to emit. */
export type FakeResponder = (message: IncomingMessage) => JsonRpcResponseMessage[];

/**
 * A default MCP server responder: answers `initialize`, `tools/list` and
 * `tools/call`. Notifications produce no reply.
 */
export function defaultResponder(
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>,
  callResult: (name: string, args: unknown) => JsonRpcResponseMessage["result"],
): FakeResponder {
  return (message) => {
    if (!("id" in message)) return [];
    const id = message.id;
    const ok = (result: unknown): JsonRpcResponseMessage[] => [
      { jsonrpc: JSONRPC_VERSION, id, result },
    ];
    switch (message.method) {
      case "initialize":
        return ok({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "fake-server", version: "0.0.1" },
        });
      case "tools/list":
        return ok({ tools });
      case "tools/call": {
        const params = message.params as { name: string; arguments: unknown };
        return ok(callResult(params.name, params.arguments));
      }
      default:
        return [
          { jsonrpc: JSONRPC_VERSION, id, error: { code: -32601, message: "Method not found" } },
        ];
    }
  };
}

/** A fake `ChildProcess` good enough for {@link StdioTransport}. */
export interface FakeChild extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  pid?: number;
  kill(signal?: string): boolean;
  /** Test helper: emit a raw line on stdout. */
  emitLine(line: string): void;
}

/** Options controlling the fake child's spawn behaviour. */
export interface FakeChildOptions {
  /** Emit `error` (not `spawn`) to simulate a failed launch. */
  spawnError?: Error;
  /** Skip auto-emitting `spawn` (test drives lifecycle manually). */
  noAutoSpawn?: boolean;
}

/**
 * Build a fake child that runs `responder` against every newline-delimited JSON
 * message written to its stdin, writing the responses back on stdout. Emits
 * `spawn` on the next tick unless configured otherwise.
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
  emitter.emitLine = (line: string): void => {
    emitter.stdout.write(`${line}\n`);
  };

  let buffer = "";
  emitter.stdin.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line === "") continue;
      let parsed: IncomingMessage;
      try {
        parsed = JSON.parse(line) as IncomingMessage;
      } catch {
        continue;
      }
      for (const response of responder(parsed)) {
        emitter.stdout.write(`${JSON.stringify(response)}\n`);
      }
    }
  });

  if (options.spawnError !== undefined) {
    setImmediate(() => emitter.emit("error", options.spawnError));
  } else if (options.noAutoSpawn !== true) {
    setImmediate(() => emitter.emit("spawn"));
  }
  return emitter;
}

/** A scripted {@link McpTransport} for exercising {@link McpClient} in isolation. */
export class ScriptedTransport implements McpTransport {
  started = false;
  closed = false;
  readonly requests: JsonRpcRequestMessage[] = [];
  readonly notifications: JsonRpcNotificationMessage[] = [];

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
    _options?: McpRequestOptions,
  ): Promise<JsonRpcResponseMessage> {
    this.requests.push(message);
    return this.responder(message);
  }

  notify(message: JsonRpcNotificationMessage): Promise<void> {
    this.notifications.push(message);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

describe("mcp testutil", () => {
  it("fake child echoes an initialize response", async () => {
    const child = createFakeChild(defaultResponder([], () => ({ content: [] })));
    const lines: string[] = [];
    child.stdout.on("data", (c: Buffer) => lines.push(c.toString("utf8")));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })}\n`);
    await new Promise((resolve) => setImmediate(resolve));
    expect(lines.join("")).toContain("fake-server");
  });
});
