type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export type AsyncResourceCacheOptions = {
  ttlMs?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Best-effort in-memory cache with request coalescing.
 *
 * - Successful loads are cached for `ttlMs`.
 * - Failed loads are never cached.
 * - Concurrent loads for the same key share a single in-flight promise.
 *
 * This is intentionally small; it is not a general caching framework.
 */
export class AsyncResourceCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: AsyncResourceCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  get<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached) {
      if (cached.expiresAt > this.now()) {
        return Promise.resolve(cached.value as T);
      }
      this.entries.delete(key);
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = loader()
      .then((value) => {
        this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
