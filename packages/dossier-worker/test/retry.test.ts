import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/retry';

describe('withRetry', () => {
  it('retries a network-level failure up to maxAttempts, returning the eventual success', async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 3) {
        return Promise.reject(new Error('fetch failed'));
      }
      return Promise.resolve('ok');
    });

    const result = await withRetry(fn, { delaysMs: [0, 0] });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-network error — rethrows on the first attempt', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('400 Bad Request')));

    await expect(withRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow('400 Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries whatever a custom isRetryable predicate accepts (e.g. a page-37 layout validation failure)', async () => {
    class LayoutError extends Error {}
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      return calls < 2 ? Promise.reject(new LayoutError('point outside the image')) : Promise.resolve('ok');
    });

    const result = await withRetry(fn, { delaysMs: [0, 0], isRetryable: (e) => e instanceof LayoutError });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts network failures and rethrows the last error', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('ECONNRESET')));

    await expect(withRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow('ECONNRESET');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
