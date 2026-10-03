interface FailureRecord {
  /** Timestamps (ms) of every failure within the current sliding window, oldest first. A
   *  fixed-window counter (reset entirely to 0/1 at a boundary) lets an attacker pace exactly
   *  (maxAttempts - 1) guesses per window forever without ever being locked out — a real
   *  bypass, not just a theoretical one. A sliding window (count failures in the trailing
   *  windowMs, not since a fixed epoch) closes that: there is no boundary to pace around. */
  timestamps: number[];
  /** 0 when not locked. Set to the exact ms timestamp the current/most recent lockout ends
   *  at, the moment a lockout is triggered. This is the single source of truth for whether
   *  the key is locked RIGHT NOW (`now < lockedUntil`) — isLocked() and recordFailure() both
   *  read this directly rather than re-deriving it from decay math, closing the off-by-one
   *  class of bug where a just-triggered lockout's own window gets retroactively altered. */
  lockedUntil: number;
  /** How many consecutive lockouts (not yet decayed back to 0) this key has triggered — used
   *  only to compute the window for the NEXT lockout, never the current one. */
  consecutiveLockouts: number;
}

/**
 * Caps how many distinct keys this limiter tracks at once. Without a bound, an attacker
 * submitting failed logins for an unbounded number of fabricated emails would grow the
 * internal map without limit (a memory-exhaustion DoS). When full, the entry with the oldest
 * activity is evicted to make room — worst case this lets one attacker's flood evict a
 * legitimate lockout slightly early, which is strictly less bad than unbounded growth.
 */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Caps how far the exponential backoff can grow (2^consecutiveLockouts × windowMs), so a
 * sustained attack against one key doesn't make its effective lockout window grow forever —
 * it plateaus at this multiple of the base window.
 */
const MAX_BACKOFF_MULTIPLIER = 32;

/** How long after a lockout ends before its contribution to the backoff level decays back to
 *  0 — without this, one old lockout from weeks ago would permanently inflate the window for
 *  a key that's since been behaving normally. Set generously since this only matters for
 *  long-term decay, not the immediate bypass/DoS concerns above. */
const BACKOFF_DECAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export class RateLimiter {
  private readonly failures = new Map<string, FailureRecord>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  private windowForLockoutLevel(consecutiveLockouts: number): number {
    const multiplier = Math.min(2 ** consecutiveLockouts, MAX_BACKOFF_MULTIPLIER);
    return this.windowMs * multiplier;
  }

  private evictOldestIfFull(excludingKey: string): void {
    if (this.failures.size < MAX_TRACKED_KEYS || this.failures.has(excludingKey)) return;
    let oldestKey: string | undefined;
    let oldestActivity = Infinity;
    for (const [key, record] of this.failures) {
      const lastActivity = record.timestamps[record.timestamps.length - 1] ?? 0;
      if (lastActivity < oldestActivity) {
        oldestActivity = lastActivity;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) {
      this.failures.delete(oldestKey);
    }
  }

  /**
   * Records a failure and returns whether the key is now locked, in one atomic step — callers
   * (e.g. login()) must branch on THIS return value rather than calling isLocked() separately
   * afterward, closing the race where concurrent requests could each observe "not locked yet"
   * before any of their recordFailure() calls land.
   *
   * Sliding window for the lock-triggering count itself: counts failures within the trailing
   * `windowMs` of now, not since a fixed per-key epoch — closes the fixed-window pacing
   * bypass described on FailureRecord. The exponential backoff only affects how long an
   * ALREADY-TRIGGERED lockout lasts and how large the window is for computing the NEXT
   * trigger — it never changes retroactively once a lockout's `lockedUntil` is set.
   */
  recordFailure(key: string): boolean {
    const now = Date.now();
    this.evictOldestIfFull(key);

    const existing = this.failures.get(key) ?? { timestamps: [], lockedUntil: 0, consecutiveLockouts: 0 };

    // Still inside an already-active lockout: don't re-trigger, don't grow the backoff level
    // further — just report locked. This keeps a flood of requests during an active lockout
    // from each separately bumping consecutiveLockouts.
    if (now < existing.lockedUntil) {
      return true;
    }

    // Decay: if the key's last lockout ended long enough ago, its backoff level resets to 0.
    const consecutiveLockouts = existing.lockedUntil > 0 && now - existing.lockedUntil >= BACKOFF_DECAY_MS
      ? 0
      : existing.consecutiveLockouts;

    const stillInWindow = existing.timestamps.filter((t) => now - t < this.windowMs);
    stillInWindow.push(now);

    if (stillInWindow.length >= this.maxAttempts) {
      const lockWindowMs = this.windowForLockoutLevel(consecutiveLockouts);
      this.failures.set(key, {
        timestamps: [],
        lockedUntil: now + lockWindowMs,
        consecutiveLockouts: consecutiveLockouts + 1,
      });
      return true;
    }

    this.failures.set(key, { timestamps: stillInWindow, lockedUntil: 0, consecutiveLockouts });
    return false;
  }

  isLocked(key: string): boolean {
    const existing = this.failures.get(key);
    if (!existing) return false;
    return Date.now() < existing.lockedUntil;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
