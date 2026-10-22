import { fetchPvgisJson } from './http';
import { seriesMeta, type RawPvgisInputs } from './meta';
import { PvgisFetchError, type PvgisHourlyRow, type PvgisHourlySeries } from './types';

const PVGIS_BASE_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';
const PVGIS_TIMEOUT_MS = 30_000;

interface RawPvgisHourlyRow {
  time: string;
  'Gb(i)': number;
  'Gd(i)': number;
  'Gr(i)': number;
  T2m: number;
}

interface RawPvgisResponse {
  inputs?: RawPvgisInputs;
  outputs?: {
    hourly?: RawPvgisHourlyRow[];
  };
}

export interface PvgisSeriesOptions {
  /** Backoff before the single retry of a 429 / 5xx (tests pass 0). */
  retryDelayMs?: number;
}

/**
 * One year of PVGIS hourly in-plane irradiance and ambient temperature at the point, with what
 * PVGIS reports about its data (radiation database, elevation, horizon). A 429 or 5xx is retried
 * once after a backoff; a 403 (PVGIS's maintenance page) is not. Failures are PvgisFetchError
 * with a French message; a network failure passes through unchanged.
 */
export async function fetchPvgisHourlySeries(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
  year: number,
  options: PvgisSeriesOptions = {},
): Promise<PvgisHourlySeries> {
  const url = new URL(PVGIS_BASE_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('angle', String(tiltDeg));
  url.searchParams.set('aspect', String(azimuthDeg));
  url.searchParams.set('startyear', String(year));
  url.searchParams.set('endyear', String(year));
  url.searchParams.set('components', '1');
  url.searchParams.set('outputformat', 'json');

  // A hung PVGIS connection must fail the job instead of blocking the worker forever.
  const data = (await fetchPvgisJson(url.toString(), { timeoutMs: PVGIS_TIMEOUT_MS, retryTransient: true, retryDelayMs: options.retryDelayMs, timeoutAsPvgisError: true })) as RawPvgisResponse;
  const hourly = data.outputs?.hourly;
  if (!hourly) {
    throw new PvgisFetchError(200, 'Réponse PVGIS incomplète : outputs.hourly est absent.');
  }

  return {
    rows: hourly.map((row) => ({
      time: row.time,
      beamWM2: row['Gb(i)'],
      diffuseWM2: row['Gd(i)'],
      reflectedWM2: row['Gr(i)'],
      ambientTempC: row.T2m,
    })),
    meta: seriesMeta(data.inputs),
  };
}

/** The rows of `fetchPvgisHourlySeries`, without the metadata. */
export async function fetchPvgisHourlyData(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
  year: number,
  options: PvgisSeriesOptions = {},
): Promise<PvgisHourlyRow[]> {
  return (await fetchPvgisHourlySeries(lat, lon, tiltDeg, azimuthDeg, year, options)).rows;
}

export { pvgisStatusMessage, PVGIS_RETRY_DELAY_MS } from './http';
export { fetchPvgisPvcalcReference } from './pvcalc';
export { fetchPvgisSpecificYield } from './specific-yield';
export * from './types';
