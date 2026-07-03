/**
 * Unit tests for the SSRF / fetch guard ({@link urlGuard}).
 *
 * These hit the verbatim vulnerable surface: a robots/sitemap-advertised URL on
 * a metadata/private host must be rejected, cross-host targets must be blocked,
 * the IPv4/IPv6 range table (incl. `::ffff:`-mapped and `0.0.0.0`) must classify
 * correctly, and DNS-rebinding (resolved-IP) must block when a resolver is wired.
 */

import { describe, expect, it, vi } from "vitest";
import { LearnError } from "./errors.js";
import type { DnsLookupAll } from "./urlGuard.js";
import {
  assertFetchAllowed,
  isBlockedIp,
  isFetchAllowed,
  isFetchAllowedAsync,
} from "./urlGuard.js";

const SOURCE = "https://docs.example.com/de-de/azure/";

describe("isBlockedIp range table", () => {
  it("blocks IPv4 loopback / private / link-local / metadata / unspecified", () => {
    for (const ip of [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "169.254.0.1",
      "0.0.0.0",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("does not block ordinary public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "11.0.0.1", "192.169.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback / unique-local / link-local and ::ffff:-mapped private v4", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:127.0.0.1", // mapped loopback
      "::ffff:169.254.169.254", // mapped metadata
      "::ffff:10.0.0.5",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("does not block public IPv6 / mapped public v4", () => {
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("returns false for a non-IP string (neither v4 nor v6)", () => {
    // Exercises the final `return false` when parseIpv4 and parseIpv6 both fail.
    expect(isBlockedIp("not-an-ip")).toBe(false);
    expect(isBlockedIp("example.com")).toBe(false);
    expect(isBlockedIp("")).toBe(false);
  });

  it("classifies a fully-expanded IPv6 literal without '::' shorthand", () => {
    // No double-colon path: parseIpv6 takes the 8-group branch (lines 293-299).
    expect(isBlockedIp("0000:0000:0000:0000:0000:0000:0000:0001")).toBe(true); // ::1 expanded
    expect(isBlockedIp("fe80:0000:0000:0000:0000:0000:0000:0001")).toBe(true); // link-local
    expect(isBlockedIp("2001:4860:4860:0000:0000:0000:0000:8888")).toBe(false); // public, expanded
  });

  it("rejects malformed IPv6 (too many groups / bad hextet / multiple '::')", () => {
    // Each of these must parse to null → isBlockedIp returns false.
    expect(isBlockedIp("1:2:3:4:5:6:7:8:9")).toBe(false); // 9 groups, no "::"
    expect(isBlockedIp("gggg::1")).toBe(false); // non-hex hextet
    expect(isBlockedIp("12345::1")).toBe(false); // 5-digit hextet
    expect(isBlockedIp("1::2::3")).toBe(false); // two "::"
    expect(isBlockedIp("fe80::1%eth0")).toBe(false); // zone id rejected
  });

  it("handles bracketed IPv6 literals and an embedded-IPv4 tail", () => {
    expect(isBlockedIp("[::1]")).toBe(true); // brackets stripped
    expect(isBlockedIp("::ffff:1.2.3")).toBe(false); // malformed v4 tail → null
  });
});

describe("isFetchAllowed scoping + literals", () => {
  it("blocks a non-http(s) scheme", () => {
    expect(isFetchAllowed("file:///etc/passwd", { sourceUrl: SOURCE }).ok).toBe(false);
    expect(isFetchAllowed("ftp://docs.example.com/x", { sourceUrl: SOURCE }).ok).toBe(false);
  });

  it("blocks a cross-host target not on the allow-list", () => {
    const d = isFetchAllowed("https://evil.example.org/x", { sourceUrl: SOURCE });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("cross-host");
  });

  it("allows same-host targets", () => {
    expect(isFetchAllowed("https://docs.example.com/map.xml", { sourceUrl: SOURCE }).ok).toBe(true);
  });

  it("allows an explicitly allow-listed host", () => {
    const d = isFetchAllowed("https://cdn.example.net/map.xml", {
      sourceUrl: SOURCE,
      allowHosts: ["cdn.example.net"],
    });
    expect(d.ok).toBe(true);
  });

  it("blocks a same-host metadata/private IP literal when allowPrivate is false", () => {
    // sourceUrl IS the metadata host → host-scoping passes, but IP-literal blocks.
    const d = isFetchAllowed("http://169.254.169.254/latest/meta-data/", {
      sourceUrl: "http://169.254.169.254/",
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("private-ip-literal");
  });

  it("allows a private IP literal when allowPrivate is true", () => {
    const d = isFetchAllowed("http://10.0.0.5/x", {
      sourceUrl: "http://10.0.0.5/",
      allowPrivate: true,
    });
    expect(d.ok).toBe(true);
  });
});

describe("isFetchAllowedAsync DNS rebinding", () => {
  it("blocks a public-looking host that resolves to a private IP", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]);
    const d = await isFetchAllowedAsync("https://docs.example.com/x", {
      sourceUrl: SOURCE,
      dnsLookup,
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toContain("resolved-private-ip");
    expect(dnsLookup).toHaveBeenCalledWith("docs.example.com");
  });

  it("blocks when DNS resolution fails", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    const d = await isFetchAllowedAsync("https://docs.example.com/x", {
      sourceUrl: SOURCE,
      dnsLookup,
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("dns-lookup-failed");
  });

  it("allows when DNS resolves only to public addresses", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const d = await isFetchAllowedAsync("https://docs.example.com/x", {
      sourceUrl: SOURCE,
      dnsLookup,
    });
    expect(d.ok).toBe(true);
  });

  it("does not perform DNS for an IP-literal host (already range-checked)", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const d = await isFetchAllowedAsync("https://docs.example.com/x", {
      sourceUrl: SOURCE,
      allowPrivate: true,
      dnsLookup,
    });
    // allowPrivate short-circuits DNS entirely.
    expect(d.ok).toBe(true);
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("blocks when DNS resolves to zero records", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => []);
    const d = await isFetchAllowedAsync("https://docs.example.com/x", {
      sourceUrl: SOURCE,
      dnsLookup,
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("dns-no-records");
  });

  it("returns the sync decision unchanged when no resolver is configured", async () => {
    // No dnsLookup → the async path returns the base scope decision.
    const d = await isFetchAllowedAsync("https://docs.example.com/x", { sourceUrl: SOURCE });
    expect(d.ok).toBe(true);
  });

  it("propagates a blocked sync decision without invoking DNS", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const d = await isFetchAllowedAsync("https://evil.example.org/x", {
      sourceUrl: SOURCE,
      dnsLookup,
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("cross-host");
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("skips DNS for an allow-listed IP-literal host that is public", async () => {
    // classifyHost(host) !== "name" → DNS layer is skipped, base decision returned.
    const dnsLookup: DnsLookupAll = vi.fn(async () => [{ address: "10.0.0.1", family: 4 }]);
    const d = await isFetchAllowedAsync("https://8.8.8.8/x", {
      sourceUrl: "https://8.8.8.8/",
      dnsLookup,
    });
    expect(d.ok).toBe(true);
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("resolves multiple records and blocks if any is private", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const d = await isFetchAllowedAsync("https://docs.example.com/x", {
      sourceUrl: SOURCE,
      dnsLookup,
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toContain("resolved-private-ip");
  });
});

describe("assertFetchAllowed", () => {
  it("throws LearnError on a blocked target", async () => {
    await expect(
      assertFetchAllowed("http://169.254.169.254/x", { sourceUrl: SOURCE }),
    ).rejects.toBeInstanceOf(LearnError);
  });

  it("resolves for an allowed target", async () => {
    await expect(
      assertFetchAllowed("https://docs.example.com/a", { sourceUrl: SOURCE }),
    ).resolves.toBeUndefined();
  });
});
