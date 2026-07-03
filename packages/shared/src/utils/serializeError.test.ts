import { describe, expect, it } from "vitest";
import { ConfigError, ProviderError } from "../errors.js";
import { serializeError } from "./serializeError.js";

describe("serializeError", () => {
  it("delegates to UltraCodeError.toJSON", () => {
    const e = new ConfigError("bad", { details: { k: 1 } });
    const out = serializeError(e);
    expect(out).toMatchObject({ name: "ConfigError", code: "CONFIG_ERROR", message: "bad" });
    expect(out.details).toEqual({ k: 1 });
  });

  it("preserves provider-specific details", () => {
    const e = new ProviderError("x", { provider: "mistral", retryable: true });
    const out = serializeError(e);
    expect(out.details).toMatchObject({ provider: "mistral", retryable: true });
  });

  it("handles a plain Error", () => {
    const out = serializeError(new Error("plain"));
    expect(out).toMatchObject({ name: "Error", message: "plain", code: "ERROR" });
    expect(typeof out.stack).toBe("string");
  });

  it("reads a code property off a plain Error if present", () => {
    const e = Object.assign(new Error("io"), { code: "ENOENT" });
    expect(serializeError(e).code).toBe("ENOENT");
  });

  it("handles string throws", () => {
    expect(serializeError("boom")).toMatchObject({ name: "Error", message: "boom", code: "ERROR" });
  });

  it("handles error-shaped plain objects", () => {
    const out = serializeError({ name: "Custom", message: "oops", code: "X1", stack: "s" });
    expect(out).toMatchObject({ name: "Custom", message: "oops", code: "X1", stack: "s" });
  });

  it("handles primitives and nullish values without throwing", () => {
    expect(serializeError(undefined)).toMatchObject({ message: "undefined", code: "ERROR" });
    expect(serializeError(null)).toMatchObject({ message: "null", code: "ERROR" });
    expect(serializeError(42)).toMatchObject({ message: "42", code: "ERROR" });
    expect(serializeError(true)).toMatchObject({ message: "true", code: "ERROR" });
  });

  it("handles a plain object without message via JSON stringify", () => {
    const out = serializeError({ a: 1, b: 2 });
    expect(out.message).toBe('{"a":1,"b":2}');
  });

  it("survives circular objects", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => serializeError(obj)).not.toThrow();
    expect(serializeError(obj).code).toBe("ERROR");
  });

  it("always yields a JSON-serialisable result", () => {
    expect(() => JSON.stringify(serializeError(new Error("x")))).not.toThrow();
  });
});
