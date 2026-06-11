/**
 * Generic TTL + LRU cache for project/git/dependency metadata.
 *
 * - Bounded by `maxEntries`; when full, the least-recently-used entry is
 *   evicted (a cache hit refreshes recency).
 * - Each entry expires `ttlMs` after it was written; expired entries behave
 *   as misses and are removed lazily on access.
 * - The clock is injectable for deterministic tests.
 */

/** Options for {@link MetadataCache}. */
export interface MetadataCacheOptions {
  /**
   * Maximum number of entries. Values `<= 0` (and `NaN`) disable the cache —
   * `set` becomes a no-op. Fractional values are floored.
   */
  maxEntries: number;
  /**
   * Time-to-live per entry in milliseconds. `Infinity` means "never expires";
   * values `<= 0` (and `NaN`) make every entry immediately stale.
   */
  ttlMs: number;
  /** Monotonic-ish clock returning milliseconds. Defaults to `Date.now`. */
  clock?: () => number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * TTL-bounded LRU cache. Iteration order of the backing `Map` encodes
 * recency: the first key is always the least recently used.
 */
export class MetadataCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly clock: () => number;

  constructor(options: MetadataCacheOptions) {
    this.maxEntries = Number.isNaN(options.maxEntries)
      ? 0
      : Math.max(0, Math.floor(options.maxEntries));
    this.ttlMs = Number.isNaN(options.ttlMs) ? 0 : options.ttlMs;
    this.clock = options.clock ?? Date.now;
  }

  /** Number of (possibly stale) entries currently held. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Look up a value. Expired entries are removed and reported as misses.
   * A hit refreshes the entry's LRU recency.
   */
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency: re-insert at the tail of the Map's iteration order.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** `true` when a live (non-expired) entry exists. Does not refresh recency. */
  has(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Store a value (refreshing TTL and recency). When the cache is full, the
   * least-recently-used entry is evicted first.
   */
  set(key: K, value: V): void {
    if (this.maxEntries === 0) return;
    if (this.entries.has(key)) this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    const now = this.clock();
    const expiresAt =
      this.ttlMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : now + this.ttlMs;
    this.entries.set(key, { value, expiresAt });
  }

  /** Remove a single entry; `true` if it existed (live or stale). */
  invalidate(key: K): boolean {
    return this.entries.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    return this.clock() >= entry.expiresAt;
  }
}
