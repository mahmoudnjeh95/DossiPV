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
});
