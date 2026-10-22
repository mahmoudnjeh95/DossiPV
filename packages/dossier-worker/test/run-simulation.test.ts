import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeMonthlySimulationTable, type PvModuleInput } from '@dossipv/engine';
import { PvgisFetchError, type PvgisHourlyRow } from '@dossipv/pvgis-client';

const { mockCacheFindUnique, mockCacheUpsert, mockFetchPvgisHourlyData } = vi.hoisted(() => ({
  mockCacheFindUnique: vi.fn(),
  mockCacheUpsert: vi.fn(),
  mockFetchPvgisHourlyData: vi.fn(),
}));

vi.mock('@dossipv/pvgis-client', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/pvgis-client')>('@dossipv/pvgis-client');
  return { ...actual, fetchPvgisHourlyData: mockFetchPvgisHourlyData };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, pvgisWeatherCache: { findUnique: mockCacheFindUnique, upsert: mockCacheUpsert } } };
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
  mockFetchPvgisHourlyData.mockReset();
  mockCacheFindUnique.mockResolvedValue(null);
  mockCacheUpsert.mockResolvedValue({});
  mockFetchPvgisHourlyData.mockImplementation((_lat: number, _lon: number, tiltDeg: number) =>
    Promise.resolve(tiltDeg === 0 ? HORIZONTAL : IN_PLANE),
  );
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
    expect(mockFetchPvgisHourlyData).not.toHaveBeenCalled();
    expect(mockCacheUpsert).not.toHaveBeenCalled();
    expect(result.monthly).toHaveLength(12);
  });

  it('fetches both series and caches them on a miss', async () => {
    await simulateProduction(INPUT);

    expect(mockFetchPvgisHourlyData).toHaveBeenCalledTimes(2);
    expect(mockFetchPvgisHourlyData).toHaveBeenCalledWith(INPUT.lat, INPUT.lon, 30, 0, 2020);
    expect(mockFetchPvgisHourlyData).toHaveBeenCalledWith(INPUT.lat, INPUT.lon, 0, 0, 2020);
    expect(mockCacheUpsert).toHaveBeenCalledWith({
      where: { latRounded_lonRounded_tiltDeg_azimuthDeg_year: cacheKey },
      create: { ...cacheKey, inPlaneDataJson: IN_PLANE, horizontalDataJson: HORIZONTAL },
      update: { inPlaneDataJson: IN_PLANE, horizontalDataJson: HORIZONTAL },
    });
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
    mockFetchPvgisHourlyData.mockImplementation((_lat: number, _lon: number, tiltDeg: number) =>
      Promise.resolve((tiltDeg === 0 ? HORIZONTAL : IN_PLANE).filter((row) => !row.time.startsWith('202012'))),
    );

    await expect(simulateProduction(INPUT)).rejects.toBeInstanceOf(ProductionSimulationError);
  });

  it('throws ProductionSimulationError when the year produces nothing', async () => {
    const dark = IN_PLANE.map((row) => ({ ...row, beamWM2: 0, diffuseWM2: 0, reflectedWM2: 0 }));
    mockFetchPvgisHourlyData.mockImplementation((_lat: number, _lon: number, tiltDeg: number) => Promise.resolve(tiltDeg === 0 ? HORIZONTAL : dark));

    await expect(simulateProduction(INPUT)).rejects.toBeInstanceOf(ProductionSimulationError);
  });

  it('propagates PvgisFetchError', async () => {
    mockFetchPvgisHourlyData.mockRejectedValue(new PvgisFetchError(403, 'PVGIS request failed with status 403'));

    await expect(simulateProduction(INPUT)).rejects.toBeInstanceOf(PvgisFetchError);
    expect(mockCacheUpsert).not.toHaveBeenCalled();
  });
});
