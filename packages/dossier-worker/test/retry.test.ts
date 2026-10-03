import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/retry';

describe('withRetry', () => {
  it('retries a network-level failure up to maxAttempts, returning the eventual success', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('fetch failed');
      }
      return 'ok';
    });

    const result = await withRetry(fn, { delaysMs: [0, 0] });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-network error — rethrows on the first attempt', async () => {
    const fn = vi.fn(async () => {
      throw new Error('400 Bad Request');
    });

    await expect(withRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow('400 Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts network failures and rethrows the last error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(withRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow('ECONNRESET');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
