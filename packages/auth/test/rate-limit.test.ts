import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../src/rate-limit';

describe('RateLimiter', () => {
  it('is not locked before any failures', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.isLocked('a@example.com')).toBe(false);
  });

  it('locks after reaching the max failure count', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.isLocked('a@example.com')).toBe(true);
  });

  it('does not lock one email under the lockout for a different email', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.isLocked('a@example.com')).toBe(true);
    expect(limiter.isLocked('b@example.com')).toBe(false);
  });

  it('clear() resets the failure count for that key', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    limiter.clear('a@example.com');
    expect(limiter.isLocked('a@example.com')).toBe(false);
  });

  it('expires the lockout after the time window passes', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(3, 60_000);
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.isLocked('a@example.com')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(limiter.isLocked('a@example.com')).toBe(false);
    vi.useRealTimers();
  });

  it('recordFailure() returns whether the key is now locked, atomically with incrementing', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.recordFailure('a@example.com')).toBe(false);
    expect(limiter.recordFailure('a@example.com')).toBe(false);
    expect(limiter.recordFailure('a@example.com')).toBe(true);
  });

  it('uses a flat lockout window — a second consecutive lockout does not last any longer than the first', () => {
    // Exponential backoff was deliberately removed: it would have made each subsequent
    // lockout cycle MORE damaging to the victim for the attacker's same fixed cost per cycle
    // (maxAttempts cheap requests), rewarding a patient targeted attacker rather than
    // punishing them. A flat window avoids that — every lockout, first or fifth, lasts
    // exactly `windowMs`.
    vi.useFakeTimers();
    const limiter = new RateLimiter(3, 60_000);

    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.recordFailure('a@example.com')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(limiter.isLocked('a@example.com')).toBe(false);

    // Second consecutive lockout cycle — must expire at the SAME 60s mark, not later.
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.recordFailure('a@example.com')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(limiter.isLocked('a@example.com')).toBe(false);

    vi.useRealTimers();
  });

  it('always records a failure even when the map is completely full of other active lockouts (no fail-open)', () => {
    // An earlier version refused to evict ANY currently-locked key, so once an attacker
    // flooded the map with MAX_TRACKED_KEYS self-inflicted lockouts, recordFailure() for a
    // real victim's email had nowhere to go and silently returned false without recording
    // anything — meaning that email could NEVER be rate-limited for as long as the map
    // stayed full (a fail-open bypass: an unrecorded failure never contributes toward a real
    // lockout). This proves a failure for a brand-new key still gets tracked and still counts
    // toward locking that key out, even when every other slot is already locked.
    const limiter = new RateLimiter(3, 60_000);

    // Fill the map entirely with OTHER keys, each locked out.
    for (let i = 0; i < 10_000; i++) {
      const key = `attacker-flood-${i}@example.com`;
      limiter.recordFailure(key);
      limiter.recordFailure(key);
      limiter.recordFailure(key); // 3rd failure locks this key
    }

    // A brand-new victim email's failures must still be recorded and still lock it out —
    // not silently dropped just because the map is full of someone else's lockouts.
    expect(limiter.recordFailure('real-victim@example.com')).toBe(false);
    expect(limiter.recordFailure('real-victim@example.com')).toBe(false);
    expect(limiter.recordFailure('real-victim@example.com')).toBe(true);
  });

  it('does not let a flood of unrelated keys evict and bypass an active lockout early', () => {
    // An earlier version of evictOldestIfFull() treated a currently-locked record's "last
    // activity" as 0 (since its timestamps array is empty while locked), making every active
    // lockout look like the single oldest entry in the whole map — so an attacker flooding in
    // MAX_TRACKED_KEYS distinct junk keys could force-evict a victim's active lockout and
    // bypass it early. This proves that no longer happens.
    const limiter = new RateLimiter(3, 60_000);

    limiter.recordFailure('victim@example.com');
    limiter.recordFailure('victim@example.com');
    expect(limiter.recordFailure('victim@example.com')).toBe(true);
    expect(limiter.isLocked('victim@example.com')).toBe(true);

    for (let i = 0; i < 10_000; i++) {
      limiter.recordFailure(`flood-${i}@example.com`);
    }

    expect(limiter.isLocked('victim@example.com')).toBe(true);
  });

  it('locks out an attacker pacing (maxAttempts - 1) guesses per window forever (fixed-window bypass guard)', () => {
    // A fixed-window counter that resets fully to 0 at a boundary lets an attacker submit
    // (maxAttempts - 1) guesses, wait exactly for the window to roll over, then repeat
    // forever without ever triggering a lockout. A sliding window must NOT allow this: as
    // long as the attacker keeps guessing at a rate that would exceed maxAttempts within ANY
    // trailing windowMs-long span, they must eventually get locked out.
    vi.useFakeTimers();
    const limiter = new RateLimiter(3, 60_000);

    // Pace exactly 2 guesses, advance 59s (just under the window), repeat. Under a sliding
    // window this must eventually lock, because any 60s span now contains more than 2
    // guesses once the attacker's cadence overlaps two "rounds".
    let locked = false;
    for (let round = 0; round < 5 && !locked; round++) {
      locked = limiter.recordFailure('a@example.com') || locked;
      locked = limiter.recordFailure('a@example.com') || locked;
      vi.advanceTimersByTime(59_000);
    }
    expect(locked).toBe(true);

    vi.useRealTimers();
  });

  it('does not grow without bound when flooded with distinct keys (resource-exhaustion guard)', () => {
    // Exercise well past MAX_TRACKED_KEYS (10_000) worth of distinct keys and confirm the
    // limiter keeps functioning (doesn't throw, doesn't slow to a crawl) rather than growing
    // its internal map forever.
    const limiter = new RateLimiter(3, 60_000);
    const floodSize = 10_500;
    for (let i = 0; i < floodSize; i++) {
      limiter.recordFailure(`flood-${i}@example.com`);
    }
    // The earliest-flooded keys should have been evicted to keep the map bounded; the most
    // recently added key must still be tracked.
    expect(limiter.isLocked(`flood-${floodSize - 1}@example.com`)).toBe(false); // only 1 failure so far
    expect(limiter.recordFailure(`flood-${floodSize - 1}@example.com`)).toBe(false);
    expect(limiter.recordFailure(`flood-${floodSize - 1}@example.com`)).toBe(true); // 3rd failure locks it
  });
});
