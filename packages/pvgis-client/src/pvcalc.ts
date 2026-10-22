import { fetchPvgisJson } from './http';
import { finite, seriesMeta, text, type RawPvgisInputs } from './meta';
import { PvgisFetchError, type PvgisPvcalcMonth, type PvgisPvcalcReference } from './types';

const PVGIS_PVCALC_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
const PVGIS_TIMEOUT_MS = 30_000;
const MONTHS_PER_YEAR = 12;

type RawFigures = Record<string, unknown>;

interface RawPvcalcResponse {
  inputs?: RawPvgisInputs;
  outputs?: {
    monthly?: { fixed?: RawFigures[] };
    totals?: { fixed?: RawFigures };
  };
}

const incomplete = (field: string): PvgisFetchError => new PvgisFetchError(200, `Réponse PVGIS PVcalc incomplète : ${field} est absent.`);

/** A number PVGIS may send as a string (it sends l_spec as "0.47"); throws when absent. */
function required(source: RawFigures, key: string, where: string): number {
  const value = finite(source[key]);
  if (value === null) throw incomplete(`${where}.${key}`);
  return value;
}

export interface PvgisPvcalcOptions {
  /** Backoff before the single retry of a 429 / 5xx (tests pass 0). */
  retryDelayMs?: number;
}

/**
 * PVGIS PVcalc for 1 kWp with no system loss at the point and orientation: monthly and yearly
 * energy and in-plane irradiation, their year-to-year deviation, PVGIS's loss components and the
 * data source. Same timeout and retry rules as the hourly series.
 */
export async function fetchPvgisPvcalcReference(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
  options: PvgisPvcalcOptions = {},
): Promise<PvgisPvcalcReference> {
  const url = new URL(PVGIS_PVCALC_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('peakpower', '1');
  url.searchParams.set('loss', '0');
  url.searchParams.set('angle', String(tiltDeg));
  url.searchParams.set('aspect', String(azimuthDeg));
  url.searchParams.set('outputformat', 'json');

  const data = (await fetchPvgisJson(url.toString(), {
    timeoutMs: PVGIS_TIMEOUT_MS,
    retryTransient: true,
    retryDelayMs: options.retryDelayMs,
    timeoutAsPvgisError: true,
  })) as RawPvcalcResponse;
  const rawMonths = data.outputs?.monthly?.fixed;
  const totals = data.outputs?.totals?.fixed;
  if (!Array.isArray(rawMonths) || rawMonths.length !== MONTHS_PER_YEAR) throw incomplete('outputs.monthly.fixed (12 mois)');
  if (!totals) throw incomplete('outputs.totals.fixed');

  const monthly: PvgisPvcalcMonth[] = rawMonths.map((raw, i) => ({
    month: finite(raw.month) ?? i + 1,
    energyKWhPerKWp: required(raw, 'E_m', 'monthly'),
    dailyEnergyKWhPerKWp: required(raw, 'E_d', 'monthly'),
    irradiationKWhM2: required(raw, 'H(i)_m', 'monthly'),
    energySdKWhPerKWp: required(raw, 'SD_m', 'monthly'),
  }));
  const meteo = data.inputs?.meteo_data;

  return {
    meta: {
      ...seriesMeta(data.inputs),
      yearMin: finite(meteo?.year_min),
      yearMax: finite(meteo?.year_max),
      mountingType: text(data.inputs?.mounting_system?.fixed?.type),
      technology: text(data.inputs?.pv_module?.technology),
    },
    monthly,
    yearly: {
      energyKWhPerKWp: required(totals, 'E_y', 'totals'),
      dailyEnergyKWhPerKWp: required(totals, 'E_d', 'totals'),
      irradiationKWhM2: required(totals, 'H(i)_y', 'totals'),
      energySdKWhPerKWp: required(totals, 'SD_y', 'totals'),
    },
    losses: {
      aoiPct: required(totals, 'l_aoi', 'totals'),
      spectralPct: required(totals, 'l_spec', 'totals'),
      temperatureIrradiancePct: required(totals, 'l_tg', 'totals'),
      totalPct: required(totals, 'l_total', 'totals'),
    },
  };
}
