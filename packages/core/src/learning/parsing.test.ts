/**
 * Unit tests for the dependency-free parsers/utilities: sitemap, URL
 * normalisation/dedup, robots.txt, HTML→text and entity decoding.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_USER_AGENT } from "./defaults.js";
import { decodeEntities, extractText } from "./html.js";
import { isAllowed, parseRobots, urlAllowed } from "./robots.js";
import { decodeXml, extractTocHrefs, parseSitemap } from "./sitemap.js";
import { normalizeAndDedup, normalizeUrl, sameHost } from "./url.js";

describe("sitemap parser", () => {
  it("parses a sitemapindex into shard URLs", () => {
    const xml = `<?xml version="1.0"?><sitemapindex xmlns="x">
      <sitemap><loc>https://e.com/a.xml</loc></sitemap>
      <sitemap><loc>https://e.com/b.xml</loc></sitemap>
    </sitemapindex>`;
    const res = parseSitemap(xml);
    expect(res.kind).toBe("index");
    if (res.kind === "index")
      expect(res.sitemaps).toEqual(["https://e.com/a.xml", "https://e.com/b.xml"]);
  });

  it("parses a urlset with lastmod", () => {
    const xml = `<urlset><url><loc>https://e.com/p1</loc><lastmod>2024-01-01</lastmod></url>
      <url><loc>https://e.com/p2</loc></url></urlset>`;
    const res = parseSitemap(xml);
    expect(res.kind).toBe("urlset");
    if (res.kind === "urlset") {
      expect(res.urls).toEqual([
        { loc: "https://e.com/p1", lastmod: "2024-01-01" },
        { loc: "https://e.com/p2" },
      ]);
    }
  });

  it("decodes XML entities in loc and handles empty input", () => {
    expect(decodeXml("a&amp;b")).toBe("a&b");
    const res = parseSitemap("");
    expect(res).toEqual({ kind: "urlset", urls: [] });
  });

  it("falls back to bare <loc> list without <url> wrappers", () => {
    const res = parseSitemap("<root><loc>https://e.com/x</loc></root>");
    expect(res.kind).toBe("urlset");
    if (res.kind === "urlset") expect(res.urls).toEqual([{ loc: "https://e.com/x" }]);
  });

  it("walks toc.json items/children recursively", () => {
    const toc = {
      items: [
        { href: "a.md", children: [{ href: "b.md" }] },
        { href: "c.md", items: [{ href: "d.md" }] },
        { toc_title: "no href" },
      ],
    };
    expect(extractTocHrefs(toc).sort()).toEqual(["a.md", "b.md", "c.md", "d.md"]);
    expect(extractTocHrefs(null)).toEqual([]);
  });
});

describe("URL normalisation + dedup", () => {
  it("rewrites locale, strips trailing slash, drops noise params, removes fragment", () => {
    const n = normalizeUrl(
      "https://Learn.Microsoft.com/en-us/azure/foo/?view=azps&tabs=bash&real=1#frag",
      undefined,
      "de-de",
    );
    expect(n).toBe("https://learn.microsoft.com/de-de/azure/foo?real=1");
  });

  it("keeps the root path slash", () => {
    expect(normalizeUrl("https://e.com/", undefined, "de-de")).toBe("https://e.com/");
  });

  it("resolves relative URLs against a base", () => {
    expect(normalizeUrl("../bar", "https://e.com/de-de/foo/baz", "de-de")).toBe(
      "https://e.com/de-de/bar",
    );
  });

  it("rejects non-http(s) and unparseable URLs", () => {
    expect(normalizeUrl("ftp://e.com/x", undefined, "de-de")).toBeNull();
    expect(normalizeUrl("::::", undefined, "de-de")).toBeNull();
  });

  it("dedupes structurally-identical URLs preserving order", () => {
    const out = normalizeAndDedup(
      [
        "https://e.com/de-de/a?view=x",
        "https://e.com/en-us/a", // same after locale rewrite + noise strip
        "https://e.com/de-de/b",
      ],
      undefined,
      "de-de",
    );
    expect(out).toEqual(["https://e.com/de-de/a", "https://e.com/de-de/b"]);
  });

  it("sameHost compares hostnames case-insensitively", () => {
    expect(sameHost("https://E.com/a", "https://e.com/b")).toBe(true);
    expect(sameHost("https://other.com/a", "https://e.com/b")).toBe(false);
  });
});

describe("robots.txt", () => {
  const txt = `
    User-agent: *
    Disallow: /private
    Allow: /private/public
    Sitemap: https://e.com/sitemap.xml

    User-agent: ultracode
    Disallow: /
  `;

  it("selects the agent-specific group and surfaces sitemaps", () => {
    const r = parseRobots(txt, DEFAULT_USER_AGENT);
    expect(r.matchedAgent).toBe(true);
    expect(r.sitemaps).toContain("https://e.com/sitemap.xml");
    expect(isAllowed(r, "/anything")).toBe(false); // Disallow: /
  });

  it("falls back to the * group for unknown agents and honours longest-match Allow", () => {
    const r = parseRobots(txt, "googlebot");
    expect(r.matchedAgent).toBe(false);
    expect(isAllowed(r, "/private/secret")).toBe(false);
    expect(isAllowed(r, "/private/public/x")).toBe(true);
    expect(isAllowed(r, "/open")).toBe(true);
  });

  it("supports wildcard and end-anchor patterns", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$", "x");
    expect(urlAllowed(r, "https://e.com/a/b.pdf")).toBe(false);
    expect(urlAllowed(r, "https://e.com/a/b.pdf?x=1")).toBe(true); // $ anchors end
    expect(urlAllowed(r, "https://e.com/a/b.html")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    const r = parseRobots("User-agent: *\nDisallow:", "x");
    expect(isAllowed(r, "/whatever")).toBe(true);
  });
});

describe("HTML → text", () => {
  it("strips scripts/styles, narrows to main, decodes entities", () => {
    const html = `<html><head><title>T &amp; U</title><style>x{}</style></head>
      <body><nav>skip</nav><main><h1>Head</h1><p>Hello&nbsp;world.</p>
      <script>evil()</script></main></body></html>`;
    const { title, text } = extractText(html);
    expect(title).toBe("T & U");
    expect(text).toContain("Hello world.");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("skip"); // outside <main>
  });

  it("falls back to <h1> for the title when <title> is absent", () => {
    const { title } = extractText("<article><h1>Only H1</h1><p>x</p></article>");
    expect(title).toBe("Only H1");
  });

  it("handles empty and tag-only input without throwing", () => {
    expect(extractText("")).toEqual({ text: "" });
    expect(extractText("<div></div>").text).toBe("");
  });

  it("decodes numeric and hex entities; leaves unknown verbatim", () => {
    expect(decodeEntities("&#65;&#x42;&unknownentity;")).toBe("AB&unknownentity;");
    expect(decodeEntities("no entities")).toBe("no entities");
  });

  it("survives a large unicode/emoji document", () => {
    const big = "<main><p>" + "café 😀 漢字 ".repeat(20000) + "</p></main>";
    const { text } = extractText(big);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("😀");
  });
});
