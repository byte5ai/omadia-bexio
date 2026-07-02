/**
 * BexioResponseCache — tiny in-process cache for read responses, keyed by a
 * caller-supplied string, with a fixed TTL. Mirrors the Dynamics plugin's
 * DataverseResponseCache. Writes are out of scope for v0.1.0, so nothing ever
 * invalidates entries except TTL expiry and clear().
 */
export interface BexioResponseCacheOptions {
  /** Time-to-live for each entry in milliseconds. */
  readonly ttlMs: number;
}

interface Entry<T = unknown> {
  readonly value: T;
  readonly expiresAt: number;
}

export class BexioResponseCache {
  private readonly ttlMs: number;
  private readonly store = new Map<string, Entry>();

  constructor(options: BexioResponseCacheOptions) {
    this.ttlMs = Math.max(0, options.ttlMs);
  }

  async getOrSet<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }
    const value = await produce();
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  clear(): void {
    this.store.clear();
  }
}
