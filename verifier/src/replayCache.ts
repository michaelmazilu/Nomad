/**
 * Replay cache. TTL equals the verifier's skew window, so the cache only ever
 * holds genuine, in-window signatures and stays bounded (anything older is
 * already rejected by the freshness check).
 *
 * The in-memory implementation is correct for a single verifier instance. For a
 * horizontally-scaled deployment, back this interface with shared state (e.g.
 * Redis with per-key TTL).
 */
export interface ReplayCache {
  /** True if this signature was already recorded and has not expired. */
  has(signatureBase58: string): boolean | Promise<boolean>;
  /** Record a signature with a time-to-live in milliseconds. */
  add(signatureBase58: string, ttlMs: number): void | Promise<void>;
}

export class InMemoryReplayCache implements ReplayCache {
  private readonly entries = new Map<string, number>(); // signature -> expiryMs
  private addsSinceSweep = 0;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly sweepEvery = 512,
  ) {}

  has(signatureBase58: string): boolean {
    const expiry = this.entries.get(signatureBase58);
    if (expiry === undefined) return false;
    if (expiry <= this.now()) {
      this.entries.delete(signatureBase58);
      return false;
    }
    return true;
  }

  add(signatureBase58: string, ttlMs: number): void {
    this.entries.set(signatureBase58, this.now() + ttlMs);
    if (++this.addsSinceSweep >= this.sweepEvery) {
      this.sweep();
      this.addsSinceSweep = 0;
    }
  }

  /** Drop expired entries; keeps the map bounded under sustained load. */
  private sweep(): void {
    const t = this.now();
    for (const [sig, expiry] of this.entries) {
      if (expiry <= t) this.entries.delete(sig);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
