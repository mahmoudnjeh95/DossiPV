import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPvgisSpecificYield } from '../src/specific-yield';
import { PvgisFetchError } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
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

  it('fails at once on a 403 with the French maintenance message (the page has its own fallback)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    globalThis.fetch = mockFetch;

    await expect(fetchPvgisSpecificYield(34.42, 8.78, 30, 0)).rejects.toThrow('PVGIS refuse la requête (HTTP 403) : le service est probablement en maintenance.');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws PvgisFetchError when E_y is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ outputs: { totals: { fixed: {} } } }),
    });

    await expect(fetchPvgisSpecificYield(34.42, 8.78, 30, 0)).rejects.toBeInstanceOf(PvgisFetchError);
  });

  it('gives PVGIS 10 seconds before aborting the request', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ outputs: { totals: { fixed: { E_y: 1750.3 } } } }),
    });
    globalThis.fetch = mockFetch;

    await fetchPvgisSpecificYield(34.42, 8.78, 30, 0);

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect((mockFetch.mock.calls[0]![1] as RequestInit).signal).toBe(timeout.mock.results[0]!.value);
  });

  it('rejects when PVGIS does not answer before the timeout', async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
    // A fetch that hangs until its signal aborts, like a PVGIS that never answers.
    globalThis.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason as Error));
        }),
    ) as typeof fetch;

    await expect(fetchPvgisSpecificYield(34.42, 8.78, 30, 0)).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
