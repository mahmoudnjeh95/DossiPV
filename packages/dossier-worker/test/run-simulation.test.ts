import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeMonthlySimulationTable, type PvModuleInput } from '@dossipv/engine';
import { PvgisFetchError, type PvgisHourlyRow, type PvgisHourlySeries, type PvgisPvcalcReference, type PvgisSeriesMeta } from '@dossipv/pvgis-client';

const { mockCacheFindUnique, mockCacheUpsert, mockCacheUpdate, mockFetchPvgisHourlySeries, mockFetchPvcalc } = vi.hoisted(() => ({
  mockCacheFindUnique: vi.fn(),
  mockCacheUpsert: vi.fn(),
  mockCacheUpdate: vi.fn(),
  mockFetchPvgisHourlySeries: vi.fn(),
  mockFetchPvcalc: vi.fn(),
}));

vi.mock('@dossipv/pvgis-client', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/pvgis-client')>('@dossipv/pvgis-client');
  return { ...actual, fetchPvgisHourlySeries: mockFetchPvgisHourlySeries, fetchPvgisPvcalcReference: mockFetchPvcalc };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, pvgisWeatherCache: { findUnique: mockCacheFindUnique, upsert: mockCacheUpsert, update: mockCacheUpdate } } };
});

import { roundForCacheKey, simulateProduction, ProductionSimulationError, type ProductionSimulationInput } from '../src/run-simulation';

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * 8 760 synthetic hourly rows (365 days × 24 h) in PVGIS's "YYYYMMDD:HHmm" format. Irradiance
 * follows a daytime half-sine whose peak and ambient temperature change month by month, so each
 * month has a different PR and a weighted annual PR differs from the plain monthly mean.
 */
function syntheticHourly(scale: number): PvgisHourlyRow[] {
  const rows: PvgisHourlyRow[] = [];
  DAYS_PER_MONTH.forEach((days, monthIndex) => {
    const month = monthIndex + 1;
    const peakWM2 = scale * (500 + 60 * (6 - Math.abs(6.5 - month)));
    for (let day = 1; day <= days; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const daylight = hour >= 6 && hour <= 18 ? Math.sin(((hour - 6) / 12) * Math.PI) : 0;
        rows.push({
          time: `2020${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}:${String(hour).padStart(2, '0')}10`,
          beamWM2: 0.8 * peakWM2 * daylight,
          diffuseWM2: 0.18 * peakWM2 * daylight,
          reflectedWM2: 0.02 * peakWM2 * daylight,
          ambientTempC: 8 + 2.5 * month,
        });
      }
    }
  });
  return rows;
}

const IN_PLANE = syntheticHourly(1.1);
const HORIZONTAL = syntheticHourly(1);
const META: PvgisSeriesMeta = { radiationDb: 'PVGIS-SARAH3', meteoDb: 'ERA5', elevationM: 4, useHorizon: true, horizonSource: 'DEM-calculated' };
const series = (rows: PvgisHourlyRow[]): Promise<PvgisHourlySeries> => Promise.resolve({ rows, meta: META });
const REFERENCE: PvgisPvcalcReference = {
  meta: { ...META, yearMin: 2005, yearMax: 2023, mountingType: 'free-standing', technology: 'c-Si' },
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, energyKWhPerKWp: 160, dailyEnergyKWhPerKWp: 5.3, irradiationKWhM2: 180, energySdKWhPerKWp: 8 })),
  yearly: { energyKWhPerKWp: 1920, dailyEnergyKWhPerKWp: 5.26, irradiationKWhM2: 2160, energySdKWhPerKWp: 30 },
  losses: { aoiPct: -2.57, spectralPct: 0.47, temperatureIrradiancePct: -7.3, totalPct: -9.26 },
};

const MODULE: PvModuleInput = {
  pmaxW: 620,
  vmpV: 46.5,
  impA: 13.33,
  vocV: 55.9,
  iscA: 13.92,
  tempCoeffVocPct: -0.25,
  tempCoeffIscPct: 0.045,
  tempCoeffPmaxPct: -0.28,
  irmA: 25,
  maxSystemVoltageV: 1500,
  lengthMm: 2278,
  widthMm: 1134,
  weightKg: 33.5,
};

const INPUT: ProductionSimulationInput = {
  lat: 34.740012,
  lon: 10.760049,
  tiltDeg: 30,
  azimuthDeg: 0,
  module: MODULE,
  moduleCount: 5,
  inverterPacW: 3000,
  dcVoltageDropPct: 1.5,
  acVoltageDropPct: 1.0,
};

beforeEach(() => {
  mockCacheFindUnique.mockReset();
  mockCacheUpsert.mockReset();
  mockFetchPvgisHourlySeries.mockReset();
  mockFetchPvcalc.mockReset();
  mockCacheUpdate.mockReset();
  mockCacheFindUnique.mockResolvedValue(null);
  mockCacheUpsert.mockResolvedValue({});
  mockCacheUpdate.mockResolvedValue({});
  mockFetchPvcalc.mockResolvedValue(REFERENCE);
  mockFetchPvgisHourlySeries.mockImplementation((_lat: number, _lon: number, tiltDeg: number) => series(tiltDeg === 0 ? HORIZONTAL : IN_PLANE));
});

describe('roundForCacheKey', () => {
  it('rounds to 4 decimal places so floating-point noise collapses to the same key', () => {
    expect(roundForCacheKey(36.80000000001)).toBe(roundForCacheKey(36.8));
    expect(roundForCacheKey(36.8001)).not.toBe(roundForCacheKey(36.8002));
  });
});

describe('simulateProduction', () => {
  const cacheKey = { latRounded: 34.74, lonRounded: 10.76, tiltDeg: 30, azimuthDeg: 0, year: 2020 };

  it('uses the cache on a hit', async () => {
    mockCacheFindUnique.mockResolvedValue({ inPlaneDataJson: IN_PLANE, horizontalDataJson: HORIZONTAL });

    const result = await simulateProduction(INPUT);

    expect(mockCacheFindUnique).toHaveBeenCalledWith({ where: { latRounded_lonRounded_tiltDeg_azimuthDeg_year: cacheKey } });
    expect(mockFetchPvgisHourlySeries).not.toHaveBeenCalled();
    expect(mockCacheUpsert).not.toHaveBeenCalled();
    expect(result.monthly).toHaveLength(12);
  });

  it('reads the PVGIS metadata and the fetch date from a cache row', async () => {
    const fetchedAt = new Date('2026-10-20T09:15:00Z');
    mockCacheFindUnique.mockResolvedValue({ inPlaneDataJson: { meta: META, rows: IN_PLANE }, horizontalDataJson: HORIZONTAL, fetchedAt });

    const result = await simulateProduction(INPUT);

    expect(result.monthly).toHaveLength(12);
    expect(result.pvgis).toEqual({ ...META, fetchedAt: '2026-10-20T09:15:00.000Z' });
  });

  it('gives unknown metadata for a cache row written before it was stored, when PVcalc fails too', async () => {
    mockCacheFindUnique.mockResolvedValue({ inPlaneDataJson: IN_PLANE, horizontalDataJson: HORIZONTAL, fetchedAt: new Date('2026-10-01T00:00:00Z') });
    mockFetchPvcalc.mockRejectedValue(new PvgisFetchError(403, 'PVGIS refuse la requête (HTTP 403) : le service est probablement en maintenance.'));

    const result = await simulateProduction(INPUT);

    expect(result.pvgis).toEqual({ radiationDb: null, meteoDb: null, elevationM: null, useHorizon: null, horizonSource: null, fetchedAt: '2026-10-01T00:00:00.000Z' });
  });

  it("fills a legacy row's unknown metadata from PVcalc, which reads the same PVGIS databases at the point", async () => {
    mockCacheFindUnique.mockResolvedValue({ id: 'row-1', inPlaneDataJson: IN_PLANE, horizontalDataJson: HORIZONTAL, fetchedAt: new Date('2026-10-01T00:00:00Z') });

    const result = await simulateProduction(INPUT);

    expect(result.pvgis).toEqual({ ...META, fetchedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('fetches both series and caches them on a miss', async () => {
    await simulateProduction(INPUT);

    expect(mockFetchPvgisHourlySeries).toHaveBeenCalledTimes(2);
    expect(mockFetchPvgisHourlySeries).toHaveBeenCalledWith(INPUT.lat, INPUT.lon, 30, 0, 2020);
    expect(mockFetchPvgisHourlySeries).toHaveBeenCalledWith(INPUT.lat, INPUT.lon, 0, 0, 2020);
    // The in-plane entry carries PVGIS's metadata next to its rows; a refetch renews fetchedAt.
    expect(mockCacheUpsert).toHaveBeenCalledWith({
      where: { latRounded_lonRounded_tiltDeg_azimuthDeg_year: cacheKey },
      create: { ...cacheKey, inPlaneDataJson: { meta: META, pvcalc: REFERENCE, rows: IN_PLANE }, horizontalDataJson: HORIZONTAL },
      update: { inPlaneDataJson: { meta: META, pvcalc: REFERENCE, rows: IN_PLANE }, horizontalDataJson: HORIZONTAL, fetchedAt: expect.any(Date) as Date },
    });
    expect(mockFetchPvcalc).toHaveBeenCalledWith(INPUT.lat, INPUT.lon, 30, 0);
  });

  it('returns the PVcalc reference with the simulation', async () => {
    const result = await simulateProduction(INPUT);

    expect(result.pvcalc).toEqual(REFERENCE);
  });

  it('still simulates when PVcalc fails, without a reference', async () => {
    mockFetchPvcalc.mockRejectedValue(new PvgisFetchError(503, 'PVGIS a rencontré une erreur serveur (HTTP 503).'));

    const result = await simulateProduction(INPUT);

    expect(result.pvcalc).toBeNull();
    expect(result.monthly).toHaveLength(12);
    expect(mockCacheUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ inPlaneDataJson: { meta: META, pvcalc: null, rows: IN_PLANE } }) as unknown }));
  });

  it('uses a cached PVcalc reference without calling PVGIS', async () => {
    mockCacheFindUnique.mockResolvedValue({ inPlaneDataJson: { meta: META, pvcalc: REFERENCE, rows: IN_PLANE }, horizontalDataJson: HORIZONTAL, fetchedAt: new Date() });

    const result = await simulateProduction(INPUT);

    expect(result.pvcalc).toEqual(REFERENCE);
    expect(mockFetchPvcalc).not.toHaveBeenCalled();
    expect(mockCacheUpdate).not.toHaveBeenCalled();
  });

  it('fetches a missing PVcalc reference for a cache hit and stores it in the row', async () => {
    mockCacheFindUnique.mockResolvedValue({ id: 'row-1', inPlaneDataJson: { meta: META, pvcalc: null, rows: IN_PLANE }, horizontalDataJson: HORIZONTAL, fetchedAt: new Date() });

    const result = await simulateProduction(INPUT);

    expect(result.pvcalc).toEqual(REFERENCE);
    expect(mockFetchPvgisHourlySeries).not.toHaveBeenCalled();
    expect(mockCacheUpdate).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { inPlaneDataJson: { meta: META, pvcalc: REFERENCE, rows: IN_PLANE } } });
  });

  it('itemises the engine losses so that they compound to the overall PR', async () => {
    const result = await simulateProduction(INPUT);
    const { losses } = result;

    expect(losses.inverterEfficiencyPct).toBeCloseTo(3, 9);
    for (const value of [losses.temperaturePct, losses.dcCablePct, losses.acCablePct]) expect(value).toBeGreaterThan(0);
    expect(losses.clippingPct).toBeGreaterThanOrEqual(0);
    const kept = [losses.temperaturePct, losses.dcCablePct, losses.inverterEfficiencyPct, losses.clippingPct, losses.acCablePct].reduce((product, pct) => product * (1 - pct / 100), 1);
    expect(1 - kept).toBeCloseTo(losses.totalPct / 100, 9);
    expect(100 - losses.totalPct).toBeCloseTo(result.performanceRatioPct, 9);
  });

  it('returns the metadata of a fresh fetch with the fetch date of the stored row', async () => {
    mockCacheUpsert.mockResolvedValue({ fetchedAt: new Date('2026-10-22T15:25:00Z') });

    const result = await simulateProduction(INPUT);

    expect(result.pvgis).toEqual({ ...META, fetchedAt: '2026-10-22T15:25:00.000Z' });
    expect(Number.isNaN(Date.parse(result.simulatedAt))).toBe(false);
  });

  it('returns 12 months and a weighted PR', async () => {
    const result = await simulateProduction(INPUT);

    const installedKWp = (620 * 5) / 1000;
    const table = computeMonthlySimulationTable({
      inPlaneHourly: IN_PLANE,
      horizontalHourly: HORIZONTAL,
      module: MODULE,
      moduleCount: 5,
      installedKWp,
      dcVoltageDropPct: 1.5,
      acVoltageDropPct: 1.0,
      inverterPacW: 3000,
    });
    const annual = table.monthly.reduce((sum, row) => sum + row.eGridKWh, 0);
    const annualArray = table.monthly.reduce((sum, row) => sum + row.eArrayKWh, 0);
    const globInc = table.monthly.reduce((sum, row) => sum + row.globIncKWhM2, 0);
    const weightedPr = (annual / (installedKWp * globInc)) * 100;
    const meanPr = table.monthly.reduce((sum, row) => sum + row.prPct, 0) / 12;

    expect(result.monthly).toHaveLength(12);
    expect(result.monthly.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.monthly[0]).toEqual({
      month: 1,
      globHorKWhM2: table.monthly[0]!.globHorKWhM2,
      globIncKWhM2: table.monthly[0]!.globIncKWhM2,
      ambientTempC: table.monthly[0]!.ambientTempC,
      eArrayKWh: table.monthly[0]!.eArrayKWh,
      eGridKWh: table.monthly[0]!.eGridKWh,
      prPct: table.monthly[0]!.prPct,
    });
    expect(result).toMatchObject({ lat: INPUT.lat, lon: INPUT.lon, tiltDeg: 30, azimuthDeg: 0, weatherYear: 2020 });
    expect(result.installedKWp).toBeCloseTo(installedKWp, 9);
    expect(Math.abs(result.annualProductionKWh - annual)).toBeLessThan(1e-9);
    expect(Math.abs(result.annualArrayKWh - annualArray)).toBeLessThan(1e-9);
    expect(Math.abs(result.specificYieldKWhPerKWp - annual / installedKWp)).toBeLessThan(1e-9);
    expect(Math.abs(result.performanceRatioPct - weightedPr)).toBeLessThan(1e-9);
    // Weighted by irradiance, not the plain mean of the 12 monthly PRs.
    expect(Math.abs(result.performanceRatioPct - meanPr)).toBeGreaterThan(1e-6);
  });

  it('throws ProductionSimulationError for zero modules', async () => {
    await expect(simulateProduction({ ...INPUT, moduleCount: 0 })).rejects.toBeInstanceOf(ProductionSimulationError);
  });

  it('throws ProductionSimulationError when the weather data does not cover 12 months', async () => {
    mockFetchPvgisHourlySeries.mockImplementation((_lat: number, _lon: number, tiltDeg: number) =>
      series((tiltDeg === 0 ? HORIZONTAL : IN_PLANE).filter((row) => !row.time.startsWith('202012'))),
    );

    await expect(simulateProduction(INPUT)).rejects.toBeInstanceOf(ProductionSimulationError);
  });

  it('throws ProductionSimulationError when the year produces nothing', async () => {
    const dark = IN_PLANE.map((row) => ({ ...row, beamWM2: 0, diffuseWM2: 0, reflectedWM2: 0 }));
    mockFetchPvgisHourlySeries.mockImplementation((_lat: number, _lon: number, tiltDeg: number) => series(tiltDeg === 0 ? HORIZONTAL : dark));

    await expect(simulateProduction(INPUT)).rejects.toBeInstanceOf(ProductionSimulationError);
  });

  it('propagates PvgisFetchError', async () => {
    mockFetchPvgisHourlySeries.mockRejectedValue(new PvgisFetchError(403, 'PVGIS refuse la requête (HTTP 403) : le service est probablement en maintenance.'));

    await expect(simulateProduction(INPUT)).rejects.toBeInstanceOf(PvgisFetchError);
    expect(mockCacheUpsert).not.toHaveBeenCalled();
  });
});
