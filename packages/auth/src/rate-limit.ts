interface FailureRecord {
  count: number;
  windowStart: number;
  /** How many PRIOR counting periods for this key ended in a lockout, consecutively since
   *  the last clear(). 0 for a key's first-ever counting period (always the base window);
   *  bumped only when a new counting period starts following one that reached the cap —
   *  never changed retroactively for the lockout that just triggered it, so a key's own
   *  current lockout always runs for the window that was already in effect when it started. */
  lockoutsTriggered: number;
}

/**
 * Caps how many distinct keys this limiter tracks at once. Without a bound, an attacker
 * submitting failed logins for an unbounded number of fabricated emails would grow the
 * internal map without limit (a memory-exhaustion DoS). When full, the oldest-by-windowStart
 * entry is evicted to make room — worst case this lets one attacker's flood evict a
 * legitimate lockout slightly early, which is strictly less bad than unbounded growth.
 */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Caps how far the exponential backoff can grow (2^lockoutsTriggered * windowMs), so a
 * sustained attack against one key doesn't make its effective lockout window grow forever —
 * it plateaus at this multiple of the base window.
 */
const MAX_BACKOFF_MULTIPLIER = 32;

export class RateLimiter {
  private readonly failures = new Map<string, FailureRecord>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /**
   * The effective lockout window for a key that has been locked out `lockoutsTriggered`
   * times in a row: doubles each time (capped at MAX_BACKOFF_MULTIPLIER × the base window).
   * This is the "cheap now" mitigation for the targeted-lockout-DoS finding: an attacker who
   * keeps submitting wrong passwords for a victim's email pays an exponentially growing cost
   * to keep the victim locked out, rather than a fixed, cheaply-sustained block — while a
   * one-off accidental lockout (e.g. the real user mistyping their own password) still clears
   * after the base window the first time.
   */
  private currentWindowMs(lockoutsTriggered: number): number {
    const multiplier = Math.min(2 ** lockoutsTriggered, MAX_BACKOFF_MULTIPLIER);
    return this.windowMs * multiplier;
  }

  private isExpired(record: FailureRecord): boolean {
    return Date.now() - record.windowStart >= this.currentWindowMs(record.lockoutsTriggered);
  }

  private evictOldestIfFull(): void {
    if (this.failures.size < MAX_TRACKED_KEYS) return;
    let oldestKey: string | undefined;
    let oldestWindowStart = Infinity;
    for (const [key, record] of this.failures) {
      if (record.windowStart < oldestWindowStart) {
        oldestWindowStart = record.windowStart;
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
   */
  recordFailure(key: string): boolean {
    const now = Date.now();
    const existing = this.failures.get(key);

    if (existing && !this.isExpired(existing)) {
      existing.count += 1;
      return existing.count >= this.maxAttempts;
    }

    // Starting a fresh counting period. If the PREVIOUS period reached the cap (i.e. this key
    // was locked out and is only now being retried after that lockout's window elapsed), bump
    // the backoff level for THIS new period — the lockout that just ended ran at its own
    // already-fixed window; only a lockout that starts after is affected by the increase.
    this.evictOldestIfFull();
    const previousPeriodWasLockedOut = existing !== undefined && existing.count >= this.maxAttempts;
    const lockoutsTriggered = previousPeriodWasLockedOut ? existing.lockoutsTriggered + 1 : (existing?.lockoutsTriggered ?? 0);
    const locked = 1 >= this.maxAttempts;
    this.failures.set(key, { count: 1, windowStart: now, lockoutsTriggered });
    return locked;
  }

  isLocked(key: string): boolean {
    const existing = this.failures.get(key);
    if (!existing) return false;
    if (this.isExpired(existing)) return false;
    return existing.count >= this.maxAttempts;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
