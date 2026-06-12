/**
 * A tiny counting semaphore — dependency-free replacement for `p-limit`.
 *
 * Bounds the number of concurrent async operations. Acquirers beyond the limit
 * wait in FIFO order; each `acquire()` resolves to a single-use `release`
 * function. {@link Semaphore.run} wraps acquire/try/finally-release.
 */
export class Semaphore {
  private readonly max: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  /**
   * @param max - Maximum concurrent holders (clamped to `>= 1`).
   */
  constructor(max: number) {
    this.max = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
  }

  /** Number of permits currently held. */
  get inFlight(): number {
    return this.active;
  }

  /** Acquire a permit, resolving to a single-use release callback. */
  acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const grant = (): void => {
        this.active++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active--;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.active < this.max) grant();
      else this.queue.push(grant);
    });
  }

  /**
   * Run `fn` under a held permit, releasing it even if `fn` throws.
   *
   * @param fn - The async task.
   * @returns Whatever `fn` resolves to.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Map `items` through `worker` with bounded concurrency, preserving input
 * order in the result array. Rejections propagate (the caller decides how to
 * isolate per-item failures inside `worker`).
 *
 * @param items - Input items.
 * @param concurrency - Max simultaneous workers.
 * @param worker - Async mapper `(item, index) => result`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const sem = new Semaphore(concurrency);
  const results = new Array<R>(items.length);
  await Promise.all(
    items.map((item, i) =>
      sem.run(async () => {
        results[i] = await worker(item, i);
      }),
    ),
  );
  return results;
}
