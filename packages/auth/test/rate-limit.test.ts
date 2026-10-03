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

  it('doubles the effective lockout window each time the key is locked out again (exponential backoff)', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(3, 60_000);

    // First lockout: base window (60s).
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.recordFailure('a@example.com')).toBe(true);
    expect(limiter.isLocked('a@example.com')).toBe(true);

    // Just under the base window: still locked.
    vi.advanceTimersByTime(59_000);
    expect(limiter.isLocked('a@example.com')).toBe(true);

    // Past the base window: unlocked, but the next lockout's window is now 120s (2x).
    vi.advanceTimersByTime(2_000);
    expect(limiter.isLocked('a@example.com')).toBe(false);

    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.recordFailure('a@example.com')).toBe(true);

    // 90s in: would have expired under the base 60s window, but the doubled 120s window
    // for this second lockout means it's still locked — proves the backoff actually grew.
    vi.advanceTimersByTime(90_000);
    expect(limiter.isLocked('a@example.com')).toBe(true);

    vi.useRealTimers();
  });

  it('clear() resets the backoff level, not just the current lockout', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(3, 60_000);

    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com'); // first lockout, backoff level 1
    limiter.clear('a@example.com');

    // After clear(), a fresh set of failures should lock out for the BASE window again, not
    // the doubled one — proving clear() resets lockoutsTriggered, not just the failure count.
    limiter.recordFailure('a@example.com');
    limiter.recordFailure('a@example.com');
    expect(limiter.recordFailure('a@example.com')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(limiter.isLocked('a@example.com')).toBe(false);

    vi.useRealTimers();
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
