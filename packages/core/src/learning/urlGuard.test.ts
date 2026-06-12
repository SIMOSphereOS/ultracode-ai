/**
 * Unit tests for the SSRF / fetch guard ({@link urlGuard}).
 *
 * These hit the verbatim vulnerable surface: a robots/sitemap-advertised URL on
 * a metadata/private host must be rejected, cross-host targets must be blocked,
 * the IPv4/IPv6 range table (incl. `::ffff:`-mapped and `0.0.0.0`) must classify
 * correctly, and DNS-rebinding (resolved-IP) must block when a resolver is wired.
 */

import { describe, expect, it, vi } from "vitest";

import {
  assertFetchAllowed,
  isBlockedIp,
  isFetchAllowed,
  isFetchAllowedAsync,
} from "./urlGuard.js";
import type { DnsLookupAll } from "./urlGuard.js";
import { LearnError } from "./errors.js";

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
    const d = await isFetchAllowedAsync("https://docs.example.com/x", { sourceUrl: SOURCE, dnsLookup });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("dns-lookup-failed");
  });

  it("allows when DNS resolves only to public addresses", async () => {
    const dnsLookup: DnsLookupAll = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const d = await isFetchAllowedAsync("https://docs.example.com/x", { sourceUrl: SOURCE, dnsLookup });
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
