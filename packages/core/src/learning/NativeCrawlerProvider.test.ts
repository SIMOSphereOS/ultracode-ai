/**
 * Tests for {@link NativeCrawlerProvider}: sitemap/toc discovery, robots
 * filtering, conditional GET (200/304), content-hash change detection, and
 * 429/5xx exponential backoff. `fetch` is always mocked — no real network.
 */

import { describe, expect, it, vi } from "vitest";

import { NativeCrawlerProvider } from "./NativeCrawlerProvider.js";
import type { FetchImpl, FetchResponseLike, IngestionContext, LearnSource } from "./types.js";

/** Build a fake Response. */
function res(
  status: number,
  body = "",
  headers: Record<string, string> = {},
): FetchResponseLike {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n: string) => lower.get(n.toLowerCase()) ?? null },
    text: async () => body,
  };
}

/** A routing fetch keyed by URL substring → response factory. */
function routedFetch(routes: Array<[string, () => FetchResponseLike]>): FetchImpl {
  return vi.fn(async (url: string) => {
    for (const [needle, make] of routes) {
      if (url.includes(needle)) return make();
    }
    return res(404, "");
  });
}

const SOURCE: LearnSource = {
  id: "s",
  url: "https://docs.example.com/de-de/azure/",
  type: "web-docs",
  catalog: "azure",
  schedule: "on-demand",
  localeDefault: "de-de",
};

const noSleep = (_ms: number, signal?: AbortSignal): Promise<void> => {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  return Promise.resolve();
};

describe("NativeCrawlerProvider.discover", () => {
  it("discovers via robots-advertised sitemap, robots-filtered and host-scoped", async () => {
    const fetchImpl = routedFetch([
      ["/robots.txt", () => res(200, "User-agent: *\nDisallow: /de-de/azure/secret\nSitemap: https://docs.example.com/map.xml")],
      ["/map.xml", () =>
        res(200, `<urlset>
          <url><loc>https://docs.example.com/de-de/azure/a</loc></url>
          <url><loc>https://docs.example.com/de-de/azure/secret/x</loc></url>
          <url><loc>https://other.com/de-de/azure/b</loc></url>
        </urlset>`)],
    ]);
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    const ctx: IngestionContext = { fetchImpl };
    const pages = await crawler.discover(SOURCE, ctx);
    expect(pages).toContain("https://docs.example.com/de-de/azure/a");
    expect(pages.some((p) => p.includes("/secret/"))).toBe(false); // robots disallow
    expect(pages.some((p) => p.includes("other.com"))).toBe(false); // off-host
  });

  it("recurses a sitemapindex into shards", async () => {
    const fetchImpl = routedFetch([
      ["/robots.txt", () => res(404, "")],
      ["/sitemap.xml", () =>
        res(200, `<sitemapindex><sitemap><loc>https://docs.example.com/shard1.xml</loc></sitemap></sitemapindex>`)],
      ["/shard1.xml", () => res(200, `<urlset><url><loc>https://docs.example.com/de-de/azure/p</loc></url></urlset>`)],
    ]);
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    const pages = await crawler.discover(SOURCE, { fetchImpl });
    expect(pages).toEqual(["https://docs.example.com/de-de/azure/p"]);
  });

  it("falls back to toc.json then to the entry URL", async () => {
    const tocFetch = routedFetch([
      ["/robots.txt", () => res(404, "")],
      ["sitemap.xml", () => res(404, "")],
      ["toc.json", () => res(200, JSON.stringify({ items: [{ href: "functions" }, { href: "storage" }] }))],
    ]);
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    const pages = await crawler.discover(SOURCE, { fetchImpl: tocFetch });
    expect(pages).toContain("https://docs.example.com/de-de/azure/functions");

    // Entry-URL fallback when nothing is discovered.
    const emptyFetch = routedFetch([["/", () => res(404, "")]]);
    const onlyEntry = await crawler.discover(SOURCE, { fetchImpl: emptyFetch });
    expect(onlyEntry).toEqual(["https://docs.example.com/de-de/azure"]);
  });
});

describe("NativeCrawlerProvider.fetchPage", () => {
  it("returns changed content with a hash on 200", async () => {
    const fetchImpl = vi.fn(async () =>
      res(200, "<main><h1>Title</h1><p>Body text here.</p></main>", { etag: '"v1"', "last-modified": "Mon" }),
    );
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    const page = await crawler.fetchPage("https://e.com/p", {}, { fetchImpl });
    expect(page.status).toBe(200);
    expect(page.changed).toBe(true);
    expect(page.title).toBe("Title");
    expect(page.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(page.lastmod).toBe("Mon");
  });

  it("sends conditional headers and reports 304 as unchanged with no body", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
      expect(init?.headers?.["If-None-Match"]).toBe('"v1"');
      expect(init?.headers?.["If-Modified-Since"]).toBe("Mon");
      return res(304, "");
    });
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    const page = await crawler.fetchPage(
      "https://e.com/p",
      { etag: '"v1"', lastModified: "Mon", contentHash: "abc" },
      { fetchImpl },
    );
    expect(page.status).toBe(304);
    expect(page.changed).toBe(false);
    expect(page.text).toBeUndefined();
  });

  it("detects unchanged content via matching hash", async () => {
    const html = "<main><p>stable</p></main>";
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    const first = await crawler.fetchPage("https://e.com/p", {}, { fetchImpl: vi.fn(async () => res(200, html)) });
    const second = await crawler.fetchPage(
      "https://e.com/p",
      { contentHash: first.contentHash },
      { fetchImpl: vi.fn(async () => res(200, html)) },
    );
    expect(second.changed).toBe(false);
  });

  it("retries 429/5xx with backoff then returns the final response", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return calls <= 2 ? res(503, "") : res(200, "<main><p>ok</p></main>");
    });
    const crawler = new NativeCrawlerProvider({ sleep: noSleep, maxRetries: 3 });
    const page = await crawler.fetchPage("https://e.com/p", {}, { fetchImpl });
    expect(calls).toBe(3);
    expect(page.status).toBe(200);
  });

  it("gives up after maxRetries on persistent 429 (reported, not thrown)", async () => {
    const fetchImpl = vi.fn(async () => res(429, ""));
    const crawler = new NativeCrawlerProvider({ sleep: noSleep, maxRetries: 2 });
    const page = await crawler.fetchPage("https://e.com/p", {}, { fetchImpl });
    expect(page.status).toBe(429);
    expect(page.changed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("maps a thrown network error to a status-0 page", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const crawler = new NativeCrawlerProvider({ sleep: noSleep, maxRetries: 1 });
    const page = await crawler.fetchPage("https://e.com/p", {}, { fetchImpl });
    expect(page.status).toBe(0);
  });

  it("propagates an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => res(200, ""));
    const crawler = new NativeCrawlerProvider({ sleep: noSleep });
    await expect(
      crawler.fetchPage("https://e.com/p", {}, { fetchImpl, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
