import { describe, it, expect } from "vitest";
import {
  UltraCodeError,
  ConfigError,
  ProviderError,
  ToolError,
  ToolPermissionDeniedError,
  ToolTimeoutError,
  ToolNotFoundError,
  AgentError,
  SessionError,
  VersioningError,
  ValidationError,
} from "./errors.js";

describe("error hierarchy", () => {
  it("ConfigError has correct name, code, and instanceof chain", () => {
    const e = new ConfigError("bad config");
    expect(e).toBeInstanceOf(ConfigError);
    expect(e).toBeInstanceOf(UltraCodeError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ConfigError");
    expect(e.code).toBe("CONFIG_ERROR");
    expect(e.message).toBe("bad config");
  });

  it("preserves cause and details", () => {
    const cause = new Error("root");
    const e = new ConfigError("wrap", { cause, details: { key: "value" } });
    expect(e.cause).toBe(cause);
    expect(e.details).toEqual({ key: "value" });
  });

  it("captures a stack trace", () => {
    const e = new AgentError("boom");
    expect(typeof e.stack).toBe("string");
    expect(e.stack).toContain("AgentError");
  });

  describe("ProviderError", () => {
    it("carries provider metadata and defaults retryable to false", () => {
      const e = new ProviderError("rate limited", { provider: "mistral", statusCode: 429 });
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.code).toBe("PROVIDER_ERROR");
      expect(e.provider).toBe("mistral");
      expect(e.statusCode).toBe(429);
      expect(e.retryable).toBe(false);
    });

    it("honours retryable=true", () => {
      const e = new ProviderError("timeout", { provider: "openai", retryable: true });
      expect(e.retryable).toBe(true);
    });

    it("serialises provider fields into details", () => {
      const e = new ProviderError("x", { provider: "local", statusCode: 500, retryable: true });
      const json = e.toJSON();
      expect(json.details).toMatchObject({ provider: "local", statusCode: 500, retryable: true });
    });
  });

  describe("ToolError family", () => {
    it("ToolError carries toolName and default code", () => {
      const e = new ToolError("failed", { toolName: "read" });
      expect(e.code).toBe("TOOL_ERROR");
      expect(e.toolName).toBe("read");
      expect(e.name).toBe("ToolError");
    });

    it("subclasses have distinct codes and remain instanceof ToolError", () => {
      const denied = new ToolPermissionDeniedError("nope", { toolName: "bash" });
      const timeout = new ToolTimeoutError("slow", { toolName: "bash" });
      const notFound = new ToolNotFoundError("missing", { toolName: "ghost" });

      expect(denied.code).toBe("TOOL_PERMISSION_DENIED");
      expect(timeout.code).toBe("TOOL_TIMEOUT");
      expect(notFound.code).toBe("TOOL_NOT_FOUND");

      for (const e of [denied, timeout, notFound]) {
        expect(e).toBeInstanceOf(ToolError);
        expect(e).toBeInstanceOf(UltraCodeError);
      }
      expect(denied.name).toBe("ToolPermissionDeniedError");
      expect(denied.toolName).toBe("bash");
    });

    it("serialises toolName into details", () => {
      const e = new ToolTimeoutError("slow", { toolName: "bash" });
      expect(e.toJSON().details).toMatchObject({ toolName: "bash" });
    });
  });

  it("all remaining subclasses expose correct codes/names", () => {
    const cases: Array<[UltraCodeError, string, string]> = [
      [new AgentError("a"), "AGENT_ERROR", "AgentError"],
      [new SessionError("s"), "SESSION_ERROR", "SessionError"],
      [new VersioningError("v"), "VERSIONING_ERROR", "VersioningError"],
      [new ValidationError("val"), "VALIDATION_ERROR", "ValidationError"],
    ];
    for (const [err, code, name] of cases) {
      expect(err.code).toBe(code);
      expect(err.name).toBe(name);
      expect(err).toBeInstanceOf(UltraCodeError);
    }
  });

  describe("toJSON", () => {
    it("produces a JSON-safe structure", () => {
      const e = new ConfigError("msg", { details: { a: 1 } });
      const json = e.toJSON();
      expect(json.name).toBe("ConfigError");
      expect(json.message).toBe("msg");
      expect(json.code).toBe("CONFIG_ERROR");
      expect(json.details).toEqual({ a: 1 });
      // round-trips through JSON
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    it("serialises a nested UltraCodeError cause via toJSON", () => {
      const inner = new ToolError("inner", { toolName: "read" });
      const outer = new AgentError("outer", { cause: inner });
      const json = outer.toJSON();
      expect(json.cause).toMatchObject({ name: "ToolError", code: "TOOL_ERROR" });
    });

    it("serialises a plain Error cause without throwing", () => {
      const outer = new AgentError("outer", { cause: new Error("plain") });
      const json = outer.toJSON();
      expect(json.cause).toMatchObject({ name: "Error", message: "plain", code: "ERROR" });
    });

    it("passes through a primitive cause", () => {
      const outer = new AgentError("outer", { cause: "string-cause" });
      expect(outer.toJSON().cause).toBe("string-cause");
    });
  });

  it("supports being thrown and caught polymorphically", () => {
    function throwIt(): never {
      throw new ToolNotFoundError("nope", { toolName: "x" });
    }
    try {
      throwIt();
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect(err).toBeInstanceOf(UltraCodeError);
      if (err instanceof ToolError) expect(err.toolName).toBe("x");
    }
  });
});
