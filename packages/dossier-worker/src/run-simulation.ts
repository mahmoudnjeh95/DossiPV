import { db, type Prisma } from '@dossipv/db';
import { fetchPvgisHourlyData, type PvgisHourlyRow } from '@dossipv/pvgis-client';
import { computeMonthlySimulationTable, type PvModuleInput } from '@dossipv/engine';

const SIMULATION_YEAR = 2020;
const CACHE_KEY_DECIMAL_PLACES = 4;
const MONTHS_PER_YEAR = 12;

export function roundForCacheKey(value: number): number {
  const factor = 10 ** CACHE_KEY_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

async function getOrFetchWeatherData(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
): Promise<{ inPlane: PvgisHourlyRow[]; horizontal: PvgisHourlyRow[] }> {
  const latRounded = roundForCacheKey(lat);
  const lonRounded = roundForCacheKey(lon);

  const cached = await db.pvgisWeatherCache.findUnique({
    where: {
      latRounded_lonRounded_tiltDeg_azimuthDeg_year: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR },
    },
  });

  if (cached) {
    return {
      inPlane: cached.inPlaneDataJson as unknown as PvgisHourlyRow[],
      horizontal: cached.horizontalDataJson as unknown as PvgisHourlyRow[],
    };
  }

  const [inPlane, horizontal] = await Promise.all([
    fetchPvgisHourlyData(lat, lon, tiltDeg, azimuthDeg, SIMULATION_YEAR),
    fetchPvgisHourlyData(lat, lon, 0, azimuthDeg, SIMULATION_YEAR),
  ]);

  await db.pvgisWeatherCache.upsert({
    where: {
      latRounded_lonRounded_tiltDeg_azimuthDeg_year: { latRounded, lonRounded, tiltDeg, azimuthDeg, year: SIMULATION_YEAR },
    },
    create: {
      latRounded,
      lonRounded,
      tiltDeg,
      azimuthDeg,
      year: SIMULATION_YEAR,
      inPlaneDataJson: inPlane as unknown as Prisma.InputJsonValue,
      horizontalDataJson: horizontal as unknown as Prisma.InputJsonValue,
    },
    update: {
      inPlaneDataJson: inPlane as unknown as Prisma.InputJsonValue,
      horizontalDataJson: horizontal as unknown as Prisma.InputJsonValue,
    },
  });

  return { inPlane, horizontal };
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

  const { inPlane, horizontal } = await getOrFetchWeatherData(input.lat, input.lon, input.tiltDeg, input.azimuthDeg);

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
  };
}
