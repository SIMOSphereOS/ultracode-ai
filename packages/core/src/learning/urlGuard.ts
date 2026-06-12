/**
 * SSRF / fetch guard for the native crawler.
 *
 * Every URL the crawler is about to fetch — robots.txt, sitemap roots, sitemap
 * index shards and pages — must pass {@link assertFetchAllowed} first. The guard
 * enforces four layers:
 *
 * 1. **Scheme** — only `http`/`https` (reuses {@link normalizeUrl}).
 * 2. **Host scoping** — the target must be the same host as `sourceUrl` or be
 *    listed in `allowHosts`. This stops a robots/sitemap directive from
 *    redirecting the crawl onto an arbitrary third-party host.
 * 3. **Private-IP literals** — host literals that resolve into
 *    loopback/private/link-local/metadata ranges (IPv4 and IPv6, incl.
 *    IPv4-mapped) are rejected. `allowPrivate` lifts this for tests/embedding.
 * 4. **DNS rebinding (opt-in)** — when a `dnsLookup` resolver is supplied, a
 *    non-IP-literal host is resolved and every returned address is checked
 *    against the same ranges; a lookup failure blocks the fetch.
 *
 * The guard is pure/deterministic except for the optional DNS step (injected),
 * so it is fully unit-testable without touching the network.
 *
 * @packageDocumentation
 */

import { lookup as dnsLookupCb } from "node:dns";

import { LearnError } from "./errors.js";
import {
  BLOCKED_IPV4_RANGES,
  BLOCKED_IPV6_RANGES,
  DEFAULT_ALLOW_PRIVATE,
} from "./defaults.js";
import { normalizeUrl, sameHost } from "./url.js";

/** Result of a {@link isFetchAllowed} check. */
export interface FetchAllowDecision {
  /** Whether the URL may be fetched. */
  ok: boolean;
  /** Machine-readable reason when `ok === false`. */
  reason?: string;
}

/** A `dns.lookup(..., { all: true })`-shaped resolver (injected for testability). */
export type DnsLookupAll = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/**
 * Default DNS resolver backed by `node:dns` `lookup(host, { all: true })`,
 * resolving both A and AAAA records. Pass this as `dnsLookup` to enable the
 * DNS-rebinding protection layer in production; tests inject a fake instead so
 * no real network lookup occurs.
 */
export const nodeDnsLookupAll: DnsLookupAll = (hostname: string) =>
  new Promise((resolve, reject) => {
    dnsLookupCb(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses as Array<{ address: string; family: number }>);
    });
  });

/** Options governing {@link isFetchAllowed} / {@link assertFetchAllowed}. */
export interface FetchGuardOptions {
  /** The origin URL the crawl was scoped to (host-scoping anchor). */
  sourceUrl: string;
  /** Extra hosts allowed beyond `sourceUrl`'s host. */
  allowHosts?: string[];
  /** Allow private/loopback/link-local/metadata IPs (tests/embedding only). */
  allowPrivate?: boolean;
  /** Optional DNS resolver enabling rebinding protection for non-literal hosts. */
  dnsLookup?: DnsLookupAll;
}

/**
 * Decide whether `url` is safe to fetch under the SSRF policy.
 *
 * Synchronous when no `dnsLookup` is provided; the DNS-rebinding layer makes the
 * full check async via {@link isFetchAllowedAsync}. This sync entry point omits
 * the DNS layer (literal-IP and host-scoping checks still apply).
 *
 * @param url - The absolute URL about to be fetched.
 * @param opts - Guard options (source host, allow-list, private flag).
 * @returns `{ ok }` with a `reason` when blocked.
 */
export function isFetchAllowed(url: string, opts: FetchGuardOptions): FetchAllowDecision {
  return evaluateScopeAndLiterals(url, opts);
}

/**
 * Async variant of {@link isFetchAllowed} that additionally performs the
 * DNS-rebinding check when `opts.dnsLookup` is supplied. A DNS failure blocks.
 *
 * @param url - The absolute URL about to be fetched.
 * @param opts - Guard options (may include a `dnsLookup` resolver).
 */
export async function isFetchAllowedAsync(
  url: string,
  opts: FetchGuardOptions,
): Promise<FetchAllowDecision> {
  const base = evaluateScopeAndLiterals(url, opts);
  if (!base.ok) return base;

  const allowPrivate = opts.allowPrivate ?? DEFAULT_ALLOW_PRIVATE;
  if (allowPrivate || !opts.dnsLookup) return base;

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: "unparseable-url" };
  }
  // Literal IPs were already range-checked synchronously; only resolve names.
  if (classifyHost(host) !== "name") return base;

  let records: Array<{ address: string; family: number }>;
  try {
    records = await opts.dnsLookup(host);
  } catch {
    return { ok: false, reason: "dns-lookup-failed" };
  }
  if (records.length === 0) return { ok: false, reason: "dns-no-records" };
  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      return { ok: false, reason: `resolved-private-ip:${rec.address}` };
    }
  }
  return { ok: true };
}

/**
 * Assert `url` is fetchable; throw {@link LearnError} otherwise. Async so the
 * DNS-rebinding layer can run when a resolver is configured.
 *
 * @param url - The absolute URL about to be fetched.
 * @param opts - Guard options.
 * @throws {LearnError} when the URL violates the SSRF policy.
 */
export async function assertFetchAllowed(url: string, opts: FetchGuardOptions): Promise<void> {
  const decision = await isFetchAllowedAsync(url, opts);
  if (!decision.ok) {
    throw new LearnError(`Blocked fetch (SSRF guard): ${decision.reason}`, {
      details: { url, reason: decision.reason, sourceUrl: opts.sourceUrl },
    });
  }
}

/* --------------------------- internals ----------------------------------- */

/** Scheme + host-scoping + literal-IP range checks (no DNS). */
function evaluateScopeAndLiterals(url: string, opts: FetchGuardOptions): FetchAllowDecision {
  // (1) Scheme: normalizeUrl returns null for non-http(s) / unparseable.
  if (normalizeUrl(url, undefined, "") === null) {
    return { ok: false, reason: "non-http-or-unparseable" };
  }

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: "unparseable-url" };
  }

  // (2) Host scoping: same host as the source, or explicitly allow-listed.
  const allowHosts = (opts.allowHosts ?? []).map((h) => h.toLowerCase());
  const scoped = sameHost(url, opts.sourceUrl) || allowHosts.includes(host);
  if (!scoped) {
    return { ok: false, reason: "cross-host" };
  }

  // (3) Private-IP literals.
  const allowPrivate = opts.allowPrivate ?? DEFAULT_ALLOW_PRIVATE;
  if (!allowPrivate && classifyHost(host) !== "name" && isBlockedIp(host)) {
    return { ok: false, reason: "private-ip-literal" };
  }

  return { ok: true };
}

/** Whether a host literal/string is an IPv4 literal, IPv6 literal, or a name. */
function classifyHost(host: string): "ipv4" | "ipv6" | "name" {
  // URL hostnames wrap IPv6 in brackets.
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (parseIpv4(h) !== null) return "ipv4";
  if (h.includes(":") && parseIpv6(h) !== null) return "ipv6";
  return "name";
}

/**
 * Whether an IP address string falls inside any blocked range.
 *
 * IPv4-mapped IPv6 addresses (`::ffff:a.b.c.d`) are unwrapped and checked as
 * IPv4 first so a mapped loopback is caught.
 */
export function isBlockedIp(address: string): boolean {
  const addr = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;

  const v4 = parseIpv4(addr);
  if (v4 !== null) {
    return inAnyRangeV4(v4);
  }

  const v6 = parseIpv6(addr);
  if (v6 !== null) {
    const mapped = mappedV4(v6);
    if (mapped !== null) return inAnyRangeV4(mapped);
    return inAnyRangeV6(v6);
  }
  return false;
}

/** Test an IPv4 (as a uint32) against every blocked IPv4 range. */
function inAnyRangeV4(value: number): boolean {
  for (const [net, prefix] of BLOCKED_IPV4_RANGES) {
    const netVal = parseIpv4(net);
    if (netVal === null) continue;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((value & mask) >>> 0 === (netVal & mask) >>> 0) return true;
  }
  return false;
}

/** Test an IPv6 (as eight 16-bit groups) against every blocked IPv6 range. */
function inAnyRangeV6(value: number[]): boolean {
  for (const [net, prefix] of BLOCKED_IPV6_RANGES) {
    const netVal = parseIpv6(net);
    if (netVal === null) continue;
    if (matchPrefixV6(value, netVal, prefix)) return true;
  }
  return false;
}

/** Compare two IPv6 group arrays over the leading `prefix` bits. */
function matchPrefixV6(a: number[], b: number[], prefix: number): boolean {
  let bits = prefix;
  for (let i = 0; i < 8 && bits > 0; i++) {
    const take = Math.min(16, bits);
    const mask = take === 0 ? 0 : (0xffff << (16 - take)) & 0xffff;
    if ((a[i]! & mask) !== (b[i]! & mask)) return false;
    bits -= take;
  }
  return true;
}

/**
 * Parse an IPv4 dotted-quad into a uint32, or `null` when not a valid IPv4.
 * Only canonical decimal dotted-quad is accepted (no octal/hex/short forms);
 * those non-canonical forms are treated as names and caught by host-scoping/DNS.
 */
function parseIpv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

/** Parse an IPv6 literal into eight 16-bit groups, or `null` when invalid. */
function parseIpv6(s: string): number[] | null {
  // Reject embedded zone id and surrounding brackets handled by caller.
  if (s.length === 0 || s.indexOf("%") !== -1) return null;

  // Split off an optional embedded IPv4 tail (e.g. ::ffff:127.0.0.1).
  let head = s;
  let tailGroups: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const tail = lastColon === -1 ? "" : s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) return null;
    tailGroups = [(v4 >>> 16) & 0xffff, v4 & 0xffff];
    head = s.slice(0, lastColon); // keep trailing ':' context for "::"
    if (head.endsWith(":")) head += ":"; // preserve "::" boundary marker
  }

  const doubleColon = head.indexOf("::");
  let groups: string[];
  if (doubleColon !== -1) {
    if (head.indexOf("::", doubleColon + 1) !== -1) return null; // only one "::"
    const before = head.slice(0, doubleColon).split(":").filter((p) => p.length > 0);
    const after = head.slice(doubleColon + 2).split(":").filter((p) => p.length > 0);
    const explicit = before.length + after.length + tailGroups.length;
    if (explicit > 8) return null;
    const fill = 8 - explicit;
    groups = [...before, ...Array(fill).fill("0"), ...after];
    const nums = groups.map(hex16);
    if (nums.some((n) => n === null)) return null;
    return [...(nums as number[]), ...tailGroups].slice(0, 8);
  }

  groups = head.split(":").filter((p) => p.length > 0);
  const nums = groups.map(hex16);
  if (nums.some((n) => n === null)) return null;
  const all = [...(nums as number[]), ...tailGroups];
  if (all.length !== 8) return null;
  return all;
}

/** Parse a 1–4 digit hex group into a number, or `null` when invalid. */
function hex16(s: string): number | null {
  if (!/^[0-9a-fA-F]{1,4}$/.test(s)) return null;
  return parseInt(s, 16);
}

/**
 * When an IPv6 group array is an IPv4-mapped address (`::ffff:a.b.c.d`), return
 * the embedded IPv4 as a uint32; otherwise `null`.
 */
function mappedV4(groups: number[]): number | null {
  for (let i = 0; i < 5; i++) if (groups[i] !== 0) return null;
  if (groups[5] !== 0xffff) return null;
  return (((groups[6]! << 16) >>> 0) | groups[7]!) >>> 0;
}
