import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPvgisPvcalcReference } from '../src/index';
import { PvgisFetchError } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const month = (m: number): Record<string, number> => ({ month: m, E_d: 4 + m / 10, E_m: 140 + m, 'H(i)_d': 4.7, 'H(i)_m': 146 + m, SD_m: 13 - m / 2 });

/** A PVcalc answer shaped like the live one for Sfax (1 kWp, loss 0); l_spec comes as a string. */
const BODY = {
  inputs: {
    location: { latitude: 34.74, longitude: 10.76, elevation: 4 },
    meteo_data: { radiation_db: 'PVGIS-SARAH3', meteo_db: 'ERA5', year_min: 2005, year_max: 2023, use_horizon: true, horizon_db: 'DEM-calculated' },
    mounting_system: { fixed: { slope: { value: 30, optimal: false }, azimuth: { value: 0, optimal: false }, type: 'free-standing' } },
    pv_module: { technology: 'c-Si', peak_power: 1, system_loss: 0 },
  },
  outputs: {
    monthly: { fixed: Array.from({ length: 12 }, (_, i) => month(i + 1)) },
    totals: { fixed: { E_d: 5.41, E_m: 164.55, E_y: 1974.65, 'H(i)_d': 5.96, 'H(i)_m': 181.34, 'H(i)_y': 2176.08, SD_m: 2.49, SD_y: 29.88, l_aoi: -2.57, l_spec: '0.47', l_tg: -7.3, l_total: -9.26 } },
  },
};

describe('fetchPvgisPvcalcReference', () => {
  it('asks PVcalc for 1 kWp without system loss at the point and orientation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(BODY) });
    globalThis.fetch = mockFetch;

    await fetchPvgisPvcalcReference(34.74, 10.76, 30, -10);

    const url = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe('https://re.jrc.ec.europa.eu/api/v5_3/PVcalc');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lat: '34.74', lon: '10.76', peakpower: '1', loss: '0', angle: '30', aspect: '-10', outputformat: 'json' });
  });

  it('returns the per-kWp monthly and yearly figures, the loss components and the data source', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(BODY) });

    const reference = await fetchPvgisPvcalcReference(34.74, 10.76, 30, 0);

    expect(reference.monthly).toHaveLength(12);
    expect(reference.monthly[0]).toEqual({ month: 1, energyKWhPerKWp: 141, dailyEnergyKWhPerKWp: 4.1, irradiationKWhM2: 147, energySdKWhPerKWp: 12.5 });
    expect(reference.yearly).toEqual({ energyKWhPerKWp: 1974.65, dailyEnergyKWhPerKWp: 5.41, irradiationKWhM2: 2176.08, energySdKWhPerKWp: 29.88 });
    expect(reference.losses).toEqual({ aoiPct: -2.57, spectralPct: 0.47, temperatureIrradiancePct: -7.3, totalPct: -9.26 });
    expect(reference.meta).toEqual({
      radiationDb: 'PVGIS-SARAH3',
      meteoDb: 'ERA5',
      elevationM: 4,
      useHorizon: true,
      horizonSource: 'DEM-calculated',
      yearMin: 2005,
      yearMax: 2023,
      mountingType: 'free-standing',
      technology: 'c-Si',
    });
  });

  it('rejects an answer without 12 months or a yearly energy', async () => {
    const partial = { ...BODY, outputs: { ...BODY.outputs, monthly: { fixed: BODY.outputs.monthly.fixed.slice(0, 11) } } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(partial) });

    await expect(fetchPvgisPvcalcReference(34.74, 10.76, 30, 0)).rejects.toBeInstanceOf(PvgisFetchError);
  });

  it('retries a 5xx once but never a 403', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    globalThis.fetch = failing;
    await expect(fetchPvgisPvcalcReference(34.74, 10.76, 30, 0, { retryDelayMs: 0 })).rejects.toThrow('PVGIS a rencontré une erreur serveur (HTTP 502).');
    expect(failing).toHaveBeenCalledTimes(2);

    const maintenance = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    globalThis.fetch = maintenance;
    await expect(fetchPvgisPvcalcReference(34.74, 10.76, 30, 0, { retryDelayMs: 0 })).rejects.toBeInstanceOf(PvgisFetchError);
    expect(maintenance).toHaveBeenCalledTimes(1);
  });
});
