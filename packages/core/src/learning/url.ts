/**
 * URL normalisation and deduplication for the native crawler.
 *
 * Normalisation makes structurally-identical doc URLs compare equal so the
 * crawler does not fetch the same page twice:
 * - locale path segment rewritten to a canonical default (e.g. `en-us` →
 *   `de-de`),
 * - trailing slash removed (except root),
 * - noise query parameters (`view`, `toc`, `tabs`, `pivots`, `branch`, …)
 *   dropped, remaining params sorted,
 * - fragment removed, host lower-cased.
 */

import { NOISE_PARAMS } from "./defaults.js";

/** Locale path segments we rewrite to `localeDefault` (BCP-47-ish `ll-cc`). */
const LOCALE_SEG = /^[a-z]{2}-[a-z]{2}$/;

/**
 * Normalise a URL for dedup and conditional-GET keying.
 *
 * @param raw - Absolute or relative URL.
 * @param base - Base URL used to resolve relative inputs.
 * @param localeDefault - Canonical locale to rewrite locale path segments to.
 * @returns The normalised absolute URL, or `null` when the input cannot be
 *   parsed or is not http(s).
 */
export function normalizeUrl(
  raw: string,
  base: string | undefined,
  localeDefault: string,
): string | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  u.hash = "";
  u.hostname = u.hostname.toLowerCase();

  // Rewrite the first locale-looking path segment to the canonical locale.
  const segments = u.pathname.split("/");
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg && LOCALE_SEG.test(seg.toLowerCase())) {
      segments[i] = localeDefault;
      break;
    }
  }
  let pathname = segments.join("/");

  // Strip a single trailing slash, except for the root path.
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  u.pathname = pathname;

  // Drop noise params; sort the rest for a stable key.
  const kept: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams) {
    if (!NOISE_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);

  return u.toString();
}

/**
 * Normalise and deduplicate a list of URLs, preserving first-seen order.
 *
 * @param urls - Raw URLs.
 * @param base - Base for relative resolution.
 * @param localeDefault - Canonical locale.
 * @returns Deduplicated, normalised URLs (invalid entries dropped).
 */
export function normalizeAndDedup(
  urls: Iterable<string>,
  base: string | undefined,
  localeDefault: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const n = normalizeUrl(raw, base, localeDefault);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Whether `url` is on the same registrable host as `base`. */
export function sameHost(url: string, base: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === new URL(base).hostname.toLowerCase();
  } catch {
    return false;
  }
}
