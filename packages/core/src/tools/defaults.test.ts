import { describe, expect, it } from "vitest";

import { DEFAULT_PROTECTED_EXTENSIONS, DEFAULT_READ_DENY } from "./defaults.js";

describe("tool security defaults", () => {
  it("ships the documented safe-by-default protected extensions", () => {
    expect([...DEFAULT_PROTECTED_EXTENSIONS]).toEqual([
      ".env",
      ".pem",
      ".key",
      "id_rsa",
      ".npmrc",
      ".git/config",
    ]);
  });

  it("ships a read-deny list covering the same sensitive files", () => {
    for (const entry of [".env", ".pem", ".key", "id_rsa", ".npmrc", ".git/config"]) {
      expect(DEFAULT_READ_DENY).toContain(entry);
    }
  });

  it("entries are lower-cased so case-insensitive matching is exact", () => {
    for (const list of [DEFAULT_PROTECTED_EXTENSIONS, DEFAULT_READ_DENY]) {
      for (const entry of list) {
        expect(entry).toBe(entry.toLowerCase());
      }
    }
  });

  it("default lists are frozen (immutable shared constants)", () => {
    expect(Object.isFrozen(DEFAULT_PROTECTED_EXTENSIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_READ_DENY)).toBe(true);
  });
});
