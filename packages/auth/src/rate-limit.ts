interface FailureRecord {
  /** Timestamps (ms) of every failure within the current sliding window, oldest first. A
   *  fixed-window counter (reset entirely to 0/1 at a boundary) lets an attacker pace exactly
   *  (maxAttempts - 1) guesses per window forever without ever being locked out — a real
   *  bypass, not just a theoretical one. A sliding window (count failures in the trailing
   *  windowMs, not since a fixed epoch) closes that: there is no boundary to pace around. */
  timestamps: number[];
  /** 0 when not locked. Set to the exact ms timestamp the current lockout ends at, the
   *  moment a lockout is triggered. This is the single source of truth for whether the key
   *  is locked RIGHT NOW (`now < lockedUntil`) — isLocked() and recordFailure() both read
   *  this directly rather than re-deriving it from any decay/backoff math. */
  lockedUntil: number;
}

/**
 * Caps how many distinct keys this limiter tracks at once. Without a bound, an attacker
 * submitting failed logins for an unbounded number of fabricated emails would grow the
 * internal map without limit (a memory-exhaustion DoS). When full, the oldest key that is NOT
 * currently locked out is evicted to make room (see evictToMakeRoomFor) — an active lockout
 * is never evicted early just to track a new, unrelated key.
 */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Deliberately a FLAT lockout duration, not exponential backoff. An earlier version of this
 * limiter doubled the lockout window on each consecutive trigger, intending to raise the cost
 * of a sustained targeted-lockout attack — but that backfires: the attacker's own cost per
 * cycle (maxAttempts cheap requests) never changes, while the backoff makes each subsequent
 * cycle MORE damaging to the victim for the SAME attacker effort. That rewards patience
 * instead of punishing it. A flat window doesn't have this flaw. Email-keyed rate limiting
 * can still be used to lock out a known victim's account for `windowMs` at a time — that is
 * an accepted, unsolved limitation of keying by email with no IP visibility in this package
 * (see the design spec and plan ledger); fully addressing it needs IP-awareness, which is a
 * larger scope change reserved for a later pass, not attempted here.
 */
export class RateLimiter {
  private readonly failures = new Map<string, FailureRecord>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Picks a key to evict to make room for a new one, preferring a non-locked key by oldest
   * activity. An earlier version considered every key (including active lockouts) by "last
   * activity", and a locked record's empty `timestamps` array made it look like the oldest
   * entry in the whole map regardless of real recency — so an attacker could flood in
   * MAX_TRACKED_KEYS junk keys to force-evict a victim's active lockout and bypass it early.
   * A second attempt fixed that by never evicting an active lockout at all — but that let an
   * attacker flood the map with MAX_TRACKED_KEYS self-inflicted lockouts to starve out room
   * entirely, making recordFailure() for every OTHER email silently stop tracking failures at
   * all (a fail-open bypass: an unrecorded failure never contributes to a real lockout). The
   * correct balance: prefer evicting a non-locked key (oldest activity first), but if every
   * single tracked key happens to be locked, evict the one closest to expiring rather than
   * refuse to evict at all — this never disables rate limiting, and the worst case is one
   * attacker-controlled lockout ending at most `windowMs` early, which is bounded and far
   * better than silently not tracking a real victim's failures at all.
   */
  private evictToMakeRoomFor(excludingKey: string): void {
    if (this.failures.size < MAX_TRACKED_KEYS || this.failures.has(excludingKey)) return;

    let oldestUnlockedKey: string | undefined;
    let oldestUnlockedActivity = Infinity;
    let soonestExpiringLockedKey: string | undefined;
    let soonestExpiry = Infinity;
    const now = Date.now();

    for (const [key, record] of this.failures) {
      if (now < record.lockedUntil) {
        if (record.lockedUntil < soonestExpiry) {
          soonestExpiry = record.lockedUntil;
          soonestExpiringLockedKey = key;
        }
        continue;
      }
      const activity = record.timestamps[record.timestamps.length - 1] ?? 0;
      if (activity < oldestUnlockedActivity) {
        oldestUnlockedActivity = activity;
        oldestUnlockedKey = key;
      }
    }

    const evictKey = oldestUnlockedKey ?? soonestExpiringLockedKey;
    if (evictKey !== undefined) {
      this.failures.delete(evictKey);
    }
  }

  /**
   * Records a failure and returns whether the key is now locked, in one atomic step — callers
   * (e.g. login()) must branch on THIS return value rather than calling isLocked() separately
   * afterward, closing the race where concurrent requests could each observe "not locked yet"
   * before any of their recordFailure() calls land.
   *
   * Sliding window: counts failures within the trailing `windowMs` of now, not since a fixed
   * per-key epoch — closes the fixed-window pacing bypass described on FailureRecord.
   */
  recordFailure(key: string): boolean {
    const now = Date.now();

    const existing = this.failures.get(key) ?? { timestamps: [], lockedUntil: 0 };

    // Still inside an already-active lockout: report locked without touching the record (and
    // without needing room in the map — the key is already tracked).
    if (now < existing.lockedUntil) {
      return true;
    }

    this.evictToMakeRoomFor(key);

    const stillInWindow = existing.timestamps.filter((t) => now - t < this.windowMs);
    stillInWindow.push(now);

    if (stillInWindow.length >= this.maxAttempts) {
      this.failures.set(key, { timestamps: [], lockedUntil: now + this.windowMs });
      return true;
    }

    this.failures.set(key, { timestamps: stillInWindow, lockedUntil: 0 });
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
