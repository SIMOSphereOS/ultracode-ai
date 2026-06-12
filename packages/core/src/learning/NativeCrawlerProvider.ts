/**
 * {@link NativeCrawlerProvider} — the default {@link DocIngestionProvider}.
 *
 * Dependency-free crawling:
 * - **discover**: sitemap-index / shard sitemaps first, then a Microsoft
 *   Learn-style `toc.json`, then the page itself as a single candidate. URLs
 *   are normalised, deduped, host-scoped and robots-filtered.
 * - **fetchPage**: conditional GET (`If-None-Match` / `If-Modified-Since`).
 *   `304` → `changed: false` with no body. Otherwise the body is HTML→text
 *   cleaned, SHA-256-hashed, and `changed` is set when the hash differs from
 *   the carried validator. `429`/`5xx` trigger exponential backoff (max 3
 *   attempts); persistent failures are reported as a non-`ok` {@link DocPage}.
 */

import { extractText } from "./html.js";
import { parseRobots, urlAllowed } from "./robots.js";
import type { RobotsTxt } from "./robots.js";
import { extractTocHrefs, parseSitemap } from "./sitemap.js";
import { normalizeAndDedup, normalizeUrl, sameHost } from "./url.js";
import { sha256 } from "./extract.js";
import {
  BACKOFF_FACTOR,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_LOCALE,
  DEFAULT_MAX_CANDIDATES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_SHARDS,
  DEFAULT_USER_AGENT,
} from "./defaults.js";
import type {
  DocIngestionProvider,
  DocPage,
  FetchImpl,
  IngestionContext,
  LearnSource,
  PageValidators,
} from "./types.js";

/** Options for {@link NativeCrawlerProvider}. */
export interface NativeCrawlerOptions {
  /** User-agent token used for robots matching and the `User-Agent` header. */
  userAgent?: string;
  /** Max retry attempts for `429`/`5xx` (default 3). */
  maxRetries?: number;
  /** Base backoff delay in ms (default 200). */
  backoffBaseMs?: number;
  /** Sleep function (injectable so tests don't wait). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Hard cap on candidate pages returned by `discover` (default 6000). */
  maxCandidates?: number;
  /** Cap on sitemap shards fetched during discovery (default 64). */
  maxShards?: number;
}

/** Native, dependency-free documentation crawler. */
export class NativeCrawlerProvider implements DocIngestionProvider {
  private readonly userAgent: string;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxCandidates: number;
  private readonly maxShards: number;
  /** robots.txt cache keyed by origin. */
  private readonly robotsCache = new Map<string, RobotsTxt>();

  /** @param opts - Crawler tuning options. */
  constructor(opts: NativeCrawlerOptions = {}) {
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxCandidates = opts.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
    this.maxShards = opts.maxShards ?? DEFAULT_MAX_SHARDS;
  }

  /** {@inheritDoc DocIngestionProvider.discover} */
  async discover(source: LearnSource, ctx: IngestionContext): Promise<string[]> {
    const locale = source.localeDefault || DEFAULT_LOCALE;
    const robots = await this.loadRobots(source.url, ctx);

    const candidates: string[] = [];
    const pushAllowed = (urls: string[]): void => {
      for (const u of urls) {
        if (candidates.length >= this.maxCandidates) break;
        if (sameHost(u, source.url) && urlAllowed(robots, u)) candidates.push(u);
      }
    };

    // 1. Sitemaps: robots-advertised + conventional /sitemap.xml.
    const sitemapRoots = uniqueStrings([
      ...robots.sitemaps,
      originPath(source.url, "/sitemap.xml"),
    ]);
    for (const root of sitemapRoots) {
      if (candidates.length >= this.maxCandidates) break;
      const pages = await this.crawlSitemap(root, source.url, locale, ctx);
      pushAllowed(pages);
    }

    // 2. toc.json (Microsoft Learn).
    if (candidates.length === 0) {
      const tocUrl = originPath(source.url, joinPath(pathOf(source.url), "toc.json"));
      const tocPages = await this.crawlToc(tocUrl, source.url, locale, ctx);
      pushAllowed(tocPages);
    }

    // 3. Fallback: the entry URL itself.
    if (candidates.length === 0) {
      const n = normalizeUrl(source.url, undefined, locale);
      if (n && urlAllowed(robots, n)) candidates.push(n);
    }

    return normalizeAndDedup(candidates, source.url, locale).slice(0, this.maxCandidates);
  }

  /** {@inheritDoc DocIngestionProvider.fetchPage} */
  async fetchPage(url: string, prev: PageValidators, ctx: IngestionContext): Promise<DocPage> {
    const headers: Record<string, string> = { "User-Agent": this.userAgent };
    if (prev.etag) headers["If-None-Match"] = prev.etag;
    if (prev.lastModified) headers["If-Modified-Since"] = prev.lastModified;

    let res: Awaited<ReturnType<FetchImpl>>;
    try {
      res = await this.fetchWithRetry(url, { method: "GET", headers }, ctx);
    } catch (err) {
      if (isAbort(err)) throw err;
      return { url, status: 0, changed: false };
    }

    if (res.status === 304) {
      return { url, status: 304, changed: false };
    }
    if (!res.ok) {
      return { url, status: res.status, changed: false };
    }

    let html = "";
    try {
      html = await res.text();
    } catch {
      return { url, status: res.status, changed: false };
    }
    const { title, text } = extractText(html);
    const contentHash = sha256(text);
    const changed = prev.contentHash !== contentHash;
    const lastmod = res.headers.get("last-modified") ?? undefined;
    const etag = res.headers.get("etag") ?? undefined;

    const page: DocPage = { url, status: res.status, changed, text, contentHash };
    if (title) page.title = title;
    if (lastmod) page.lastmod = lastmod;
    void etag;
    return page;
  }

  /* --------------------------------------------------------------------- */

  /** Fetch + parse a sitemap (recursing one level into index shards). */
  private async crawlSitemap(
    sitemapUrl: string,
    base: string,
    locale: string,
    ctx: IngestionContext,
  ): Promise<string[]> {
    const xml = await this.getText(sitemapUrl, ctx);
    if (xml === null) return [];
    const parsed = parseSitemap(xml);
    if (parsed.kind === "urlset") {
      return normalizeAndDedup(parsed.urls.map((u) => u.loc), base, locale);
    }
    // Index: fetch up to `maxShards` child sitemaps.
    const out: string[] = [];
    const shards = parsed.sitemaps.slice(0, this.maxShards);
    for (const shard of shards) {
      if (out.length >= this.maxCandidates) break;
      const childXml = await this.getText(shard, ctx);
      if (childXml === null) continue;
      const child = parseSitemap(childXml);
      if (child.kind === "urlset") {
        out.push(...child.urls.map((u) => u.loc));
      }
    }
    return normalizeAndDedup(out, base, locale);
  }

  /** Fetch + walk a `toc.json`, resolving hrefs against the toc URL. */
  private async crawlToc(
    tocUrl: string,
    base: string,
    locale: string,
    ctx: IngestionContext,
  ): Promise<string[]> {
    const body = await this.getText(tocUrl, ctx);
    if (body === null) return [];
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return [];
    }
    const hrefs = extractTocHrefs(json);
    return normalizeAndDedup(hrefs, tocUrl, locale).filter((u) => sameHost(u, base));
  }

  /** Load (and cache) robots.txt for a URL's origin. */
  private async loadRobots(url: string, ctx: IngestionContext): Promise<RobotsTxt> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return { rules: [], sitemaps: [], matchedAgent: false };
    }
    const cached = this.robotsCache.get(origin);
    if (cached) return cached;
    const body = await this.getText(`${origin}/robots.txt`, ctx);
    const robots = parseRobots(body ?? "", this.userAgent);
    this.robotsCache.set(origin, robots);
    return robots;
  }

  /** GET a URL's body text, returning `null` on any non-2xx / error. */
  private async getText(url: string, ctx: IngestionContext): Promise<string | null> {
    try {
      const res = await this.fetchWithRetry(
        url,
        { method: "GET", headers: { "User-Agent": this.userAgent } },
        ctx,
      );
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      if (isAbort(err)) throw err;
      return null;
    }
  }

  /** Fetch with exponential backoff on `429`/`5xx` (network errors retried too). */
  private async fetchWithRetry(
    url: string,
    init: { method?: string; headers?: Record<string, string> },
    ctx: IngestionContext,
  ): Promise<Awaited<ReturnType<FetchImpl>>> {
    let attempt = 0;
    let lastErr: unknown;
    for (;;) {
      if (ctx.signal?.aborted) throw abortError(ctx.signal);
      try {
        const res = await ctx.fetchImpl(url, {
          ...init,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          if (attempt >= this.maxRetries) return res;
          await this.backoff(attempt, ctx.signal);
          attempt++;
          continue;
        }
        return res;
      } catch (err) {
        if (isAbort(err)) throw err;
        lastErr = err;
        if (attempt >= this.maxRetries) throw err;
        await this.backoff(attempt, ctx.signal);
        attempt++;
      }
    }
    void lastErr;
  }

  /** Exponential backoff sleep: base × 2^attempt. */
  private async backoff(attempt: number, signal?: AbortSignal): Promise<void> {
    await this.sleep(this.backoffBaseMs * Math.pow(BACKOFF_FACTOR, attempt), signal);
  }
}

/* ------------------------------- helpers -------------------------------- */

/** Default cancellable sleep using a timer. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = (): void => {
      clearTimeout(t);
      reject(abortError(signal as AbortSignal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Build an abort-derived error from a signal. */
function abortError(signal: AbortSignal): Error {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason instanceof Error) return reason;
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

/** Whether an unknown error is an abort. */
function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Compose `origin + path` from a URL, ignoring its existing path. */
function originPath(url: string, p: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${p.startsWith("/") ? p : "/" + p}`;
  } catch {
    return p;
  }
}

/** Path portion of a URL (no query/hash); `/` on failure. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/** Join two path fragments with a single slash, dropping a trailing file. */
function joinPath(dir: string, file: string): string {
  const base = dir.endsWith("/") ? dir : dir.replace(/\/[^/]*$/, "/");
  return `${base}${file}`;
}

/** Stable unique list of non-empty strings. */
function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (it && !seen.has(it)) {
      seen.add(it);
      out.push(it);
    }
  }
  return out;
}
