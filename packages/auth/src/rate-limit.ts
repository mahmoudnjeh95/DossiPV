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
   * Picks a key to evict to make room for a new one, never a key that's currently locked out.
   * An earlier version considered every key (including active lockouts) by "last activity",
   * and a locked record's empty `timestamps` array made it look like the oldest entry in the
   * whole map regardless of real recency — so an attacker could flood in MAX_TRACKED_KEYS
   * junk keys to force-evict a victim's active lockout and bypass it early. Excluding locked
   * keys from eviction entirely closes that: a lockout, once active, can never be evicted
   * before it naturally expires. If every tracked key happens to be currently locked (the map
   * is literally full of active lockouts), there is nothing safe to evict; the new key is
   * simply not tracked for this one call, which only degrades to "this one request isn't
   * rate-limited" rather than "an existing lockout gets bypassed."
   */
  private evictToMakeRoomFor(excludingKey: string): boolean {
    if (this.failures.size < MAX_TRACKED_KEYS || this.failures.has(excludingKey)) return true;
    const now = Date.now();
    let oldestKey: string | undefined;
    let oldestActivity = Infinity;
    for (const [key, record] of this.failures) {
      if (now < record.lockedUntil) continue; // never evict an active lockout
      const activity = record.timestamps[record.timestamps.length - 1] ?? 0;
      if (activity < oldestActivity) {
        oldestActivity = activity;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) return false; // map is full of active lockouts; nothing safe to evict
    this.failures.delete(oldestKey);
    return true;
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

    const hadRoom = this.evictToMakeRoomFor(key);
    if (!hadRoom) {
      // Map is full of other keys' active lockouts and this is a brand-new key with nowhere
      // to go — don't track it (degrades to "this one request isn't rate-limited" rather
      // than evicting someone else's real lockout to make room).
      return false;
    }

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
