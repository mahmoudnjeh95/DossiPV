import { db, type Prisma } from '@dossipv/db';
import {
  fetchPvgisHourlySeries,
  fetchPvgisPvcalcReference,
  type PvgisHourlyRow,
  type PvgisPvcalcReference,
  type PvgisSeriesMeta,
} from '@dossipv/pvgis-client';
import { computeMonthlySimulationTable, type PvModuleInput } from '@dossipv/engine';

const SIMULATION_YEAR = 2020;
const CACHE_KEY_DECIMAL_PLACES = 4;
const MONTHS_PER_YEAR = 12;

const UNKNOWN_META: PvgisSeriesMeta = { radiationDb: null, meteoDb: null, elevationM: null, useHorizon: null, horizonSource: null };

export function roundForCacheKey(value: number): number {
  const factor = 10 ** CACHE_KEY_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

/**
 * The in-plane cache entry: `{ meta, pvcalc, rows }` (PVGIS's metadata and its PVcalc reference
 * for 1 kWp, null when PVcalc failed); a bare row array in rows written before that.
 */
interface CachedInPlane {
  meta: PvgisSeriesMeta;
  pvcalc: PvgisPvcalcReference | null;
  rows: PvgisHourlyRow[];
}

function readCachedInPlane(json: Prisma.JsonValue): CachedInPlane {
  if (Array.isArray(json)) return { meta: UNKNOWN_META, pvcalc: null, rows: json as unknown as PvgisHourlyRow[] };
  const entry = json as unknown as Partial<CachedInPlane> | null;
  return { meta: { ...UNKNOWN_META, ...(entry?.meta ?? {}) }, pvcalc: entry?.pvcalc ?? null, rows: entry?.rows ?? [] };
}

/**
 * The hourly series' metadata, each unknown field (a row cached before it was kept) taken from
 * PVcalc, which reads the same PVGIS v5.3 databases at the same point.
 */
function completeMeta(meta: PvgisSeriesMeta, pvcalc: PvgisPvcalcReference | null): PvgisSeriesMeta {
  if (!pvcalc) return meta;
  return {
    radiationDb: meta.radiationDb ?? pvcalc.meta.radiationDb,
    meteoDb: meta.meteoDb ?? pvcalc.meta.meteoDb,
    elevationM: meta.elevationM ?? pvcalc.meta.elevationM,
    useHorizon: meta.useHorizon ?? pvcalc.meta.useHorizon,
    horizonSource: meta.horizonSource ?? pvcalc.meta.horizonSource,
  };
}

const toJson = (entry: CachedInPlane): Prisma.InputJsonValue => entry as unknown as Prisma.InputJsonValue;

const isoOrNull = (date: unknown): string | null => (date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null);

/**
 * PVGIS's PVcalc reference, or null: it only enriches the report (loss components, year-to-year
 * variability, multi-year comparison), so its failure never fails the simulation.
 */
async function tryFetchPvcalc(lat: number, lon: number, tiltDeg: number, azimuthDeg: number): Promise<PvgisPvcalcReference | null> {
  try {
    return await fetchPvgisPvcalcReference(lat, lon, tiltDeg, azimuthDeg);
  } catch (error) {
    console.warn('simulateProduction: PVGIS PVcalc is unavailable; the report goes without its reference figures.', error);
    return null;
  }
}

interface WeatherData {
  inPlane: PvgisHourlyRow[];
  horizontal: PvgisHourlyRow[];
  meta: PvgisSeriesMeta;
  pvcalc: PvgisPvcalcReference | null;
  /** When PVGIS was called for the hourly data (the cache row's fetchedAt), ISO. */
  fetchedAt: string | null;
}

async function getOrFetchWeatherData(lat: number, lon: number, tiltDeg: number, azimuthDeg: number): Promise<WeatherData> {
  const latRounded = roundForCacheKey(lat);
  const lonRounded = roundForCacheKey(lon);

  const cached = await db.pvgisWeatherCache.findUnique({
    where: {
      latRounded_lonRounded_tiltDeg_azimuthDeg_year: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR },
    },
  });

  if (cached) {
    const entry = readCachedInPlane(cached.inPlaneDataJson);
    let pvcalc = entry.pvcalc;
    if (!pvcalc) {
      // A row cached without the reference (an older row, or PVcalc was down): try again and keep it.
      pvcalc = await tryFetchPvcalc(lat, lon, tiltDeg, azimuthDeg);
      if (pvcalc) {
        try {
          await db.pvgisWeatherCache.update({ where: { id: cached.id }, data: { inPlaneDataJson: toJson({ ...entry, pvcalc }) } });
        } catch (error) {
          console.warn('simulateProduction: the PVcalc reference could not be cached.', error);
        }
      }
    }
    return {
      inPlane: entry.rows,
      horizontal: cached.horizontalDataJson as unknown as PvgisHourlyRow[],
      meta: entry.meta,
      pvcalc,
      fetchedAt: isoOrNull(cached.fetchedAt),
    };
  }

  const [inPlane, horizontal, pvcalc] = await Promise.all([
    fetchPvgisHourlySeries(lat, lon, tiltDeg, azimuthDeg, SIMULATION_YEAR),
    fetchPvgisHourlySeries(lat, lon, 0, azimuthDeg, SIMULATION_YEAR),
    tryFetchPvcalc(lat, lon, tiltDeg, azimuthDeg),
  ]);
  const inPlaneJson = toJson({ meta: inPlane.meta, pvcalc, rows: inPlane.rows });
  const horizontalJson = horizontal.rows as unknown as Prisma.InputJsonValue;

  const stored = await db.pvgisWeatherCache.upsert({
    where: {
      latRounded_lonRounded_tiltDeg_azimuthDeg_year: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR },
    },
    create: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR, inPlaneDataJson: inPlaneJson, horizontalDataJson: horizontalJson },
    // A row replaced by a fresh fetch gets a fresh date (fetchedAt only defaults on create).
    update: { inPlaneDataJson: inPlaneJson, horizontalDataJson: horizontalJson, fetchedAt: new Date() },
  });

  return {
    inPlane: inPlane.rows,
    horizontal: horizontal.rows,
    meta: inPlane.meta,
    pvcalc,
    fetchedAt: isoOrNull(stored?.fetchedAt) ?? new Date().toISOString(),
  };
}

export interface ProductionSimulationInput {
  lat: number;
  lon: number;
  tiltDeg: number;
  /** PVGIS aspect, degrees: 0 = south, -90 = east, 90 = west. */
  azimuthDeg: number;
  module: PvModuleInput;
  moduleCount: number;
  inverterPacW: number;
  dcVoltageDropPct: number;
  acVoltageDropPct: number;
}

export interface ProductionMonth {
  month: number;
  globHorKWhM2: number;
  globIncKWhM2: number;
  ambientTempC: number;
  eArrayKWh: number;
  eGridKWh: number;
  prPct: number;
}

/** Where the weather data came from, as PVGIS reported it; null fields are unknown. */
export interface PvgisDataSource extends PvgisSeriesMeta {
  /** When the data was downloaded from PVGIS (ISO); null when unknown. */
  fetchedAt: string | null;
}

/**
 * The engine's losses over the year, percent, each of the energy entering its stage (so they
 * compound): temperature (against kWp × in-plane irradiation), DC cable, inverter efficiency,
 * clipping at Pac, AC cable. `totalPct` = 100 − PR.
 */
export interface ProductionLosses {
  temperaturePct: number;
  dcCablePct: number;
  inverterEfficiencyPct: number;
  clippingPct: number;
  acCablePct: number;
  totalPct: number;
}

export interface ProductionSimulation {
  lat: number;
  lon: number;
  tiltDeg: number;
  azimuthDeg: number;
  weatherYear: number;
  installedKWp: number;
  annualProductionKWh: number;
  annualArrayKWh: number;
  specificYieldKWhPerKWp: number;
  performanceRatioPct: number;
  /** One row per calendar month, January to December. */
  monthly: ProductionMonth[];
  pvgis: PvgisDataSource;
  /** When this simulation was computed (ISO). */
  simulatedAt: string;
  /** kWp × in-plane irradiation over the year: the energy before any loss. */
  annualNominalKWh: number;
  losses: ProductionLosses;
  /** PVGIS PVcalc for 1 kWp, no system loss, multi-year average; null when PVcalc failed. */
  pvcalc: PvgisPvcalcReference | null;
}

/** The PVGIS data was received but cannot yield a usable production figure. */
export class ProductionSimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionSimulationError';
  }
}

/**
 * Simulates the installation's yearly production from PVGIS hourly weather data at the given
 * GPS point (cached per rounded point, tilt, azimuth and year). PVGIS errors propagate
 * unchanged (PvgisFetchError) so the caller can fail the job; data that cannot give a
 * meaningful result throws ProductionSimulationError.
 */
export async function simulateProduction(input: ProductionSimulationInput): Promise<ProductionSimulation> {
  const installedKWp = (input.module.pmaxW * input.moduleCount) / 1000;
  if (!Number.isFinite(installedKWp) || installedKWp <= 0) {
    throw new ProductionSimulationError(`Installed power must be positive (got ${installedKWp} kWp).`);
  }

  const { inPlane, horizontal, meta, pvcalc, fetchedAt } = await getOrFetchWeatherData(input.lat, input.lon, input.tiltDeg, input.azimuthDeg);

  const table = computeMonthlySimulationTable({
    inPlaneHourly: inPlane,
    horizontalHourly: horizontal,
    module: input.module,
    moduleCount: input.moduleCount,
    installedKWp,
    dcVoltageDropPct: input.dcVoltageDropPct,
    acVoltageDropPct: input.acVoltageDropPct,
    inverterPacW: input.inverterPacW,
  });

  if (table.monthly.length !== MONTHS_PER_YEAR) {
    throw new ProductionSimulationError(`PVGIS data covers ${table.monthly.length} months instead of ${MONTHS_PER_YEAR}.`);
  }

  const monthly: ProductionMonth[] = table.monthly.map((row) => ({
    month: row.month,
    globHorKWhM2: row.globHorKWhM2,
    globIncKWhM2: row.globIncKWhM2,
    ambientTempC: row.ambientTempC,
    eArrayKWh: row.eArrayKWh,
    eGridKWh: row.eGridKWh,
    prPct: row.prPct,
  }));

  const annualProductionKWh = monthly.reduce((sum, row) => sum + row.eGridKWh, 0);
  const annualArrayKWh = monthly.reduce((sum, row) => sum + row.eArrayKWh, 0);
  const annualGlobIncKWhM2 = monthly.reduce((sum, row) => sum + row.globIncKWhM2, 0);
  const specificYieldKWhPerKWp = annualProductionKWh / installedKWp;
  // Irradiance-weighted yearly PR — not the plain mean of the monthly PRs, which over-weights
  // the dim winter months.
  const performanceRatioPct = (annualProductionKWh / (installedKWp * annualGlobIncKWhM2)) * 100;

  const yearTotal = (key: 'eNominalKWh' | 'eAfterDcCableKWh' | 'eInverterUnclippedKWh' | 'eInverterOutKWh'): number =>
    table.monthly.reduce((sum, row) => sum + row[key], 0);
  const lossPct = (after: number, before: number): number => (before > 0 ? (1 - after / before) * 100 : 0);
  const annualNominalKWh = yearTotal('eNominalKWh');
  const afterDcCable = yearTotal('eAfterDcCableKWh');
  const inverterUnclipped = yearTotal('eInverterUnclippedKWh');
  const inverterOut = yearTotal('eInverterOutKWh');
  const losses: ProductionLosses = {
    temperaturePct: lossPct(annualArrayKWh, annualNominalKWh),
    dcCablePct: lossPct(afterDcCable, annualArrayKWh),
    inverterEfficiencyPct: lossPct(inverterUnclipped, afterDcCable),
    clippingPct: lossPct(inverterOut, inverterUnclipped),
    acCablePct: lossPct(annualProductionKWh, inverterOut),
    totalPct: lossPct(annualProductionKWh, annualNominalKWh),
  };

  const values = [
    annualProductionKWh,
    annualArrayKWh,
    specificYieldKWhPerKWp,
    performanceRatioPct,
    ...monthly.flatMap((row) => [row.globHorKWhM2, row.globIncKWhM2, row.ambientTempC, row.eArrayKWh, row.eGridKWh, row.prPct]),
  ];
  if (!values.every(Number.isFinite)) {
    throw new ProductionSimulationError('PVGIS data produced a non-finite simulation value.');
  }
  if (annualProductionKWh <= 0) {
    throw new ProductionSimulationError(`Annual production must be positive (got ${annualProductionKWh} kWh).`);
  }

  return {
    lat: input.lat,
    lon: input.lon,
    tiltDeg: input.tiltDeg,
    azimuthDeg: input.azimuthDeg,
    weatherYear: SIMULATION_YEAR,
    installedKWp,
    annualProductionKWh,
    annualArrayKWh,
    specificYieldKWhPerKWp,
    performanceRatioPct,
    monthly,
    pvgis: { ...completeMeta(meta, pvcalc), fetchedAt },
    simulatedAt: new Date().toISOString(),
    annualNominalKWh,
    losses,
    pvcalc,
  };
}
