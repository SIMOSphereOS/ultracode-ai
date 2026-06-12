/**
 * Centralised default parameters / magic values for `core/learning`.
 *
 * Every hard-coded threshold, limit, timeout, size, weight, factor, default
 * name/path, seed dataset and tuning constant that previously lived inline
 * across the learning module is consolidated here as a named, JSDoc-documented
 * constant. Values are reproduced **exactly** — extracting them changes no
 * behaviour. Factory/options-overridable defaults keep their override paths
 * (the factory falls back to the constant); purely internal constants are not
 * surfaced as options.
 *
 * Grouping mirrors the categories in the catalogue: Limits, Timeouts/Retries,
 * Sizing/Chunking, Pricing/Planning, Routing weights, Seeds, Paths, and the
 * regex/entity tables used by the parsers.
 *
 * @packageDocumentation
 */

import type { LearnSource, RoutingShare } from "./types.js";

/* ------------------------------------------------------------------------- *
 * --- Limits ---                                                             *
 * ------------------------------------------------------------------------- */

/** Hard cap on candidate pages returned by the native crawler's `discover`. */
export const DEFAULT_MAX_CANDIDATES = 6000;
/** Cap on sitemap shards fetched during discovery. */
export const DEFAULT_MAX_SHARDS = 64;
/** Maximum facts retained per distilled page. */
export const MAX_FACTS = 50;
/** Maximum code snippets retained per distilled page. */
export const MAX_CODE_SNIPPETS = 20;
/** Number of leading chunk summaries joined into the material summary. */
export const SUMMARY_CHUNK_COUNT = 3;
/** Hard character cap on the joined material summary. */
export const SUMMARY_MAX_CHARS = 1000;
/** Number of leading sentences used for a deterministic summary. */
export const DETERMINISTIC_SUMMARY_SENTENCES = 2;
/** Hard character cap on a deterministic summary. */
export const DETERMINISTIC_SUMMARY_MAX_CHARS = 400;
/** Iteration guard for the recursive `toc.json` walk (defence against cycles). */
export const TOC_WALK_GUARD = 1_000_000;

/* ------------------------------------------------------------------------- *
 * --- SSRF / fetch guard ---                                                 *
 * ------------------------------------------------------------------------- */

/**
 * Maximum bytes read from any single response body before the crawler skips it
 * (decompression / size-bomb defence). 10 MiB is generous for documentation
 * HTML/sitemaps while bounding memory.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum number of `3xx` redirects manually followed for one request. Each
 * hop's `Location` is re-validated by the fetch guard; exceeding this count is
 * treated as a failure (skip).
 */
export const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Whether the fetch guard resolves non-IP-literal hostnames via DNS and checks
 * the resolved addresses against the blocked ranges (DNS-rebinding defence).
 * Off by default: the same-host / IP-literal checks already cover the crawler's
 * threat model, and DNS lookups are network I/O that tests must not trigger.
 * Enable by passing a resolver (`dnsLookup`) to {@link isFetchAllowed}.
 */
export const DEFAULT_RESOLVE_DNS = false;

/**
 * Whether private/loopback/link-local/metadata IP ranges are *allowed* as fetch
 * targets. `false` blocks them (the SSRF guard). Set `true` only for tests or
 * trusted on-host embedding scenarios.
 */
export const DEFAULT_ALLOW_PRIVATE = false;

/**
 * Blocked IPv4 CIDR ranges (SSRF guard): loopback, RFC-1918 private space,
 * link-local (incl. the `169.254.169.254` cloud metadata endpoint) and the
 * unspecified address. Each entry is `[network, prefixLength]`.
 */
export const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["127.0.0.0", 8], // loopback
  ["10.0.0.0", 8], // private (RFC 1918)
  ["172.16.0.0", 12], // private (RFC 1918)
  ["192.168.0.0", 16], // private (RFC 1918)
  ["169.254.0.0", 16], // link-local + cloud metadata (169.254.169.254)
  ["0.0.0.0", 8], // "this" network / unspecified
];

/**
 * Blocked IPv6 CIDR ranges (SSRF guard): loopback (`::1`), unique-local
 * `fc00::/7`, link-local `fe80::/10` and the unspecified address. IPv4-mapped
 * addresses (`::ffff:a.b.c.d`) are unwrapped and checked against
 * {@link BLOCKED_IPV4_RANGES} before these. Each entry is `[network, prefixLength]`.
 */
export const BLOCKED_IPV6_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["::1", 128], // loopback
  ["::", 128], // unspecified
  ["fc00::", 7], // unique-local
  ["fe80::", 10], // link-local
];

/* ------------------------------------------------------------------------- *
 * --- Timeouts / Retries ---                                                 *
 * ------------------------------------------------------------------------- */

/** Max retry attempts for `429`/`5xx` (and network errors) in the crawler. */
export const DEFAULT_MAX_RETRIES = 3;
/** Base backoff delay in milliseconds (grows as `base × 2^attempt`). */
export const DEFAULT_BACKOFF_BASE_MS = 200;
/** Exponential-backoff growth base. */
export const BACKOFF_FACTOR = 2;
/** Default crawl concurrency for a learn run. */
export const DEFAULT_CONCURRENCY = 4;
/** Checkpoint cadence: persist run state every N processed pages. */
export const CHECKPOINT_INTERVAL = 100;

/* ------------------------------------------------------------------------- *
 * --- Sizing / Chunking ---                                                  *
 * ------------------------------------------------------------------------- */

/** Default target tokens per chunk. */
export const DEFAULT_CHUNK_TOKENS = 512;
/** Default fractional overlap between consecutive chunks. */
export const DEFAULT_OVERLAP = 0.1;
/** Maximum permitted fractional overlap (clamp ceiling). */
export const MAX_OVERLAP = 0.9;
/** Heuristic characters-per-token ratio used for token estimation/sizing. */
export const CHARS_PER_TOKEN = 4;

/* ------------------------------------------------------------------------- *
 * --- Pricing / Planning ---                                                 *
 * ------------------------------------------------------------------------- */

/** Estimated input tokens per page, used when planning a run. */
export const PER_PAGE_TOKENS_IN = 1200;
/** Estimated output tokens per page, used when planning a run. */
export const PER_PAGE_TOKENS_OUT = 300;
/** Decimal-rounding scale for USD figures (4 decimal places: `Math.round(n × ROUND_USD_SCALE) / ROUND_USD_SCALE`). */
export const ROUND_USD_SCALE = 1e4;

/* ------------------------------------------------------------------------- *
 * --- Routing weights ---                                                    *
 * ------------------------------------------------------------------------- */

/** Cheap-model identifier (fallback when routing is empty). */
export const DEFAULT_ROUTE_MODEL = "cheap";
/** Modulo window size for the round-robin routing position. */
export const ROUTING_WINDOW = 100;
/** Cheap/standard/premium routing distribution for map-reduce (80/15/5). */
export const DEFAULT_ROUTING: RoutingShare[] = [
  { model: "cheap", share: 0.8 },
  { model: "standard", share: 0.15 },
  { model: "premium", share: 0.05 },
];

/* ------------------------------------------------------------------------- *
 * --- Crawler identity / locale ---                                          *
 * ------------------------------------------------------------------------- */

/** Default crawler user-agent token (robots matching + `User-Agent` header). */
export const DEFAULT_USER_AGENT = "ultracode-learn/1.0";
/** Default locale applied when a source declares none. */
export const DEFAULT_LOCALE = "de-de";

/* ------------------------------------------------------------------------- *
 * --- Seeds ---                                                              *
 * ------------------------------------------------------------------------- */

/** The sources every fresh library is seeded with (on-demand only). */
export const SEED_SOURCES: LearnSource[] = [
  {
    id: "azure-docs",
    url: "https://learn.microsoft.com/de-de/azure/?product=popular",
    type: "web-docs",
    catalog: "azure",
    schedule: "on-demand",
    scope: "core-services",
    localeDefault: "de-de",
  },
  {
    id: "azure-training",
    url: "https://learn.microsoft.com/de-de/training/azure/",
    type: "web-docs",
    catalog: "azure-training",
    schedule: "on-demand",
    scope: "training-learning-paths",
    localeDefault: "de-de",
  },
  {
    id: "pytest-docs",
    url: "https://docs.pytest.org/en/stable/",
    type: "web-docs",
    catalog: "pytest",
    schedule: "on-demand",
    scope: "how-to-and-reference",
    localeDefault: "en",
  },
];

/* ------------------------------------------------------------------------- *
 * --- Paths ---                                                              *
 * ------------------------------------------------------------------------- */

/** Top-level hidden home directory holding all UltraCode state. */
export const HOME_STATE_DIRNAME = ".ultracode";
/** Subdirectory under {@link HOME_STATE_DIRNAME} for learning persistence. */
export const LEARNING_DIRNAME = "learning";
/** Subdirectory under the learning dir holding per-source crawl checkpoints. */
export const STATE_DIRNAME = "state";
/** File name of the TOML source library. */
export const SOURCES_FILENAME = "sources.toml";

/* ------------------------------------------------------------------------- *
 * --- Default-name fallbacks ---                                             *
 * ------------------------------------------------------------------------- */

/** Fallback catalog name when a coerced source omits one. */
export const DEFAULT_CATALOG = "default";
/** Fallback schedule when a coerced source omits one. */
export const DEFAULT_SCHEDULE = "on-demand";
/** Fallback topic label derived from a URL when no title is present. */
export const DEFAULT_TOPIC = "doc";

/* ------------------------------------------------------------------------- *
 * --- Parser tables (URL noise params, HTML entities) ---                    *
 * ------------------------------------------------------------------------- */

/** Query parameters that never change the documentation content. */
export const NOISE_PARAMS: ReadonlySet<string> = new Set([
  "view",
  "toc",
  "tabs",
  "pivots",
  "branch",
  "preserve-view",
  "wt.mc_id",
  "tabs",
]);

/** Named HTML entities decoded by {@link decodeEntities}. */
export const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
  trade: "™",
  deg: "°",
};
