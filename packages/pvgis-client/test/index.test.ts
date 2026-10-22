import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPvgisHourlyData, fetchPvgisHourlySeries } from '../src/index';
import { PvgisFetchError } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchPvgisHourlyData', () => {
  it('builds the correct query string and maps the response to PvgisHourlyRow[]', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          outputs: {
            hourly: [
              { time: '20200101:0809', 'Gb(i)': 100, 'Gd(i)': 50, 'Gr(i)': 2, T2m: 9.0 },
              { time: '20200101:0909', 'Gb(i)': 200, 'Gd(i)': 60, 'Gr(i)': 3, T2m: 10.5 },
            ],
          },
        }),
    });
    globalThis.fetch = mockFetch;

    const rows = await fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020);

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://re.jrc.ec.europa.eu/api/v5_3/seriescalc');
    expect(calledUrl.searchParams.get('lat')).toBe('36.8');
    expect(calledUrl.searchParams.get('lon')).toBe('10.18');
    expect(calledUrl.searchParams.get('angle')).toBe('30');
    expect(calledUrl.searchParams.get('aspect')).toBe('-10');
    expect(calledUrl.searchParams.get('startyear')).toBe('2020');
    expect(calledUrl.searchParams.get('endyear')).toBe('2020');
    expect(calledUrl.searchParams.get('components')).toBe('1');
    expect(calledUrl.searchParams.get('outputformat')).toBe('json');

    expect(rows).toEqual([
      { time: '20200101:0809', beamWM2: 100, diffuseWM2: 50, reflectedWM2: 2, ambientTempC: 9.0 },
      { time: '20200101:0909', beamWM2: 200, diffuseWM2: 60, reflectedWM2: 3, ambientTempC: 10.5 },
    ]);
  });

  it('passes a timeout signal to the hourly fetch', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ outputs: { hourly: [] } }) });
    globalThis.fetch = mockFetch;

    await fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020);

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    const init = mockFetch.mock.calls[0]![1] as RequestInit | undefined;
    expect(init?.signal).toBe(timeoutSpy.mock.results[0]!.value);
    timeoutSpy.mockRestore();
  });

  it('throws PvgisFetchError on a non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020)).rejects.toThrow(PvgisFetchError);
  });

  it('throws PvgisFetchError when the response has no outputs.hourly array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await expect(fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020)).rejects.toThrow(PvgisFetchError);
  });
});

describe('fetchPvgisHourlySeries', () => {
  interface MockResponse {
    ok: boolean;
    status: number;
    json?: () => Promise<unknown>;
    headers?: { get: (name: string) => string | null };
  }
  const okResponse = (body: unknown): MockResponse => ({ ok: true, status: 200, json: (): Promise<unknown> => Promise.resolve(body) });
  const errorResponse = (status: number, headers: Record<string, string> = {}): MockResponse => ({
    ok: false,
    status,
    headers: { get: (name: string): string | null => headers[name.toLowerCase()] ?? null },
  });
  const HOURLY = { hourly: [{ time: '20200101:1209', 'Gb(i)': 379.89, 'Gd(i)': 254.71, 'Gr(i)': 5.89, T2m: 13.84 }] };
  const NO_WAIT = { retryDelayMs: 0 };

  it('returns the rows with the radiation database, elevation and horizon from inputs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      okResponse({
        inputs: {
          location: { latitude: 34.74, longitude: 10.76, elevation: 4 },
          meteo_data: { radiation_db: 'PVGIS-SARAH3', meteo_db: 'ERA5', use_horizon: true, horizon_db: null, horizon_data: 'DEM-calculated' },
        },
        outputs: HOURLY,
      }),
    );

    const series = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020);

    expect(series.rows).toEqual([{ time: '20200101:1209', beamWM2: 379.89, diffuseWM2: 254.71, reflectedWM2: 5.89, ambientTempC: 13.84 }]);
    expect(series.meta).toEqual({ radiationDb: 'PVGIS-SARAH3', meteoDb: 'ERA5', elevationM: 4, useHorizon: true, horizonSource: 'DEM-calculated' });
  });

  it('gives null metadata when PVGIS sends no inputs block', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ outputs: HOURLY }));

    const series = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020);

    expect(series.meta).toEqual({ radiationDb: null, meteoDb: null, elevationM: null, useHorizon: null, horizonSource: null });
  });

  it('does not retry a 403 (maintenance page) and says so in French', async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(403));
    globalThis.fetch = mockFetch;

    const error = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020, NO_WAIT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PvgisFetchError);
    expect((error as PvgisFetchError).status).toBe(403);
    expect((error as PvgisFetchError).message).toBe('PVGIS refuse la requête (HTTP 403) : le service est probablement en maintenance.');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 once, then succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(errorResponse(429)).mockResolvedValueOnce(okResponse({ outputs: HOURLY }));
    globalThis.fetch = mockFetch;

    const series = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020, NO_WAIT);

    expect(series.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx only once and then fails with a French message', async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(503));
    globalThis.fetch = mockFetch;

    const error = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020, NO_WAIT).catch((e: unknown) => e);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((error as PvgisFetchError).status).toBe(503);
    expect((error as PvgisFetchError).message).toBe('PVGIS a rencontré une erreur serveur (HTTP 503).');
  });

  it('says a 429 is a rate limit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(429));

    const error = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020, NO_WAIT).catch((e: unknown) => e);

    expect((error as PvgisFetchError).message).toBe('PVGIS limite le nombre de requêtes (HTTP 429) : trop de demandes, réessayez plus tard.');
  });

  it('waits the backoff before the retry, honouring Retry-After up to 10 s', async () => {
    vi.useFakeTimers();
    try {
      const mockFetch = vi.fn().mockResolvedValueOnce(errorResponse(429, { 'retry-after': '4' })).mockResolvedValueOnce(okResponse({ outputs: HOURLY }));
      globalThis.fetch = mockFetch;

      const pending = fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020);
      await vi.advanceTimersByTimeAsync(3_900);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      await pending;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns a timeout into a French PvgisFetchError without retrying', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const mockFetch = vi.fn().mockRejectedValue(timeoutError);
    globalThis.fetch = mockFetch;

    const error = await fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020, NO_WAIT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PvgisFetchError);
    expect((error as PvgisFetchError).status).toBe(0);
    expect((error as PvgisFetchError).message).toBe("PVGIS n'a pas répondu dans le délai de 30 s.");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('lets a network failure through unchanged, for the caller to retry', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchPvgisHourlySeries(34.74, 10.76, 30, 0, 2020, NO_WAIT)).rejects.toThrow('fetch failed');
  });
});
