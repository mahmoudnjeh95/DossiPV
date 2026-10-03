import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPvgisHourlyData } from '../src/index';
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

  it('throws PvgisFetchError on a non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020)).rejects.toThrow(PvgisFetchError);
  });

  it('throws PvgisFetchError when the response has no outputs.hourly array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await expect(fetchPvgisHourlyData(36.8, 10.18, 30, -10, 2020)).rejects.toThrow(PvgisFetchError);
  });
});
