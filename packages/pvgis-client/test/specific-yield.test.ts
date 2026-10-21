import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPvgisSpecificYield } from '../src/specific-yield';
import { PvgisFetchError } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchPvgisSpecificYield', () => {
  it('returns E_y from PVcalc', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ outputs: { totals: { fixed: { E_y: 1750.3 } } } }),
    });
    globalThis.fetch = mockFetch;

    const value = await fetchPvgisSpecificYield(34.42, 8.78, 30, 0);

    expect(value).toBe(1750.3);
    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(calledUrl.pathname).toContain('PVcalc');
    expect(calledUrl.searchParams.get('peakpower')).toBe('1');
    expect(calledUrl.searchParams.get('loss')).toBe('14');
    expect(calledUrl.searchParams.get('angle')).toBe('30');
    expect(calledUrl.searchParams.get('aspect')).toBe('0');
    expect(calledUrl.searchParams.get('outputformat')).toBe('json');
  });

  it('throws PvgisFetchError on HTTP 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

    await expect(fetchPvgisSpecificYield(34.42, 8.78, 30, 0)).rejects.toBeInstanceOf(PvgisFetchError);
  });

  it('throws PvgisFetchError when E_y is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ outputs: { totals: { fixed: {} } } }),
    });

    await expect(fetchPvgisSpecificYield(34.42, 8.78, 30, 0)).rejects.toBeInstanceOf(PvgisFetchError);
  });
});
