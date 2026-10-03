import { db, type Prisma, type PvModule } from '@dossipv/db';
import { fetchPvgisHourlyData, type PvgisHourlyRow } from '@dossipv/pvgis-client';
import { computeMonthlySimulationTable, type PvModuleInput, type SimulationChartData } from '@dossipv/engine';

/**
 * Prisma generates optional PvModule columns as `T | null`; the engine's PvModuleInput types
 * them as `T | undefined` (standard optional-property form). Converts at this one boundary
 * rather than letting `null` leak into engine code that was never written to expect it.
 */
function toPvModuleInput(module: PvModule): PvModuleInput {
  return {
    pmaxW: module.pmaxW,
    vmpV: module.vmpV,
    impA: module.impA,
    vocV: module.vocV,
    iscA: module.iscA,
    tempCoeffVocPct: module.tempCoeffVocPct,
    tempCoeffIscPct: module.tempCoeffIscPct,
    tempCoeffPmaxPct: module.tempCoeffPmaxPct,
    ...(module.tempCoeffVmpPct !== null ? { tempCoeffVmpPct: module.tempCoeffVmpPct } : {}),
    irmA: module.irmA,
    maxSystemVoltageV: module.maxSystemVoltageV,
    bifacial: module.bifacial,
    ...(module.bifacialGainPct !== null ? { bifacialGainPct: module.bifacialGainPct } : {}),
    lengthMm: module.lengthMm,
    widthMm: module.widthMm,
    weightKg: module.weightKg,
    ...(module.noctC !== null ? { noctC: module.noctC } : {}),
  };
}

const SIMULATION_YEAR = 2020;
const CACHE_KEY_DECIMAL_PLACES = 4;

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

export async function runProductionSimulation(projectId: string): Promise<SimulationChartData> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { site: true, arrayConfig: { include: { module: true, inverters: { include: { inverter: true, mppts: true } } } } },
  });

  if (!project.site || !project.arrayConfig) {
    throw new Error(`Project ${projectId} is missing site or array configuration data required for simulation.`);
  }

  const { inPlane, horizontal } = await getOrFetchWeatherData(
    project.site.gpsLat,
    project.site.gpsLon,
    project.site.tiltDeg,
    project.site.azimuthDeg ?? 0,
  );

  const moduleCount = project.arrayConfig.inverters.reduce(
    (total, inverter) =>
      total + inverter.mppts.reduce((mpptTotal, mppt) => mpptTotal + mppt.stringsInParallel * mppt.modulesPerString, 0),
    0,
  );
  const installedKWp = (project.arrayConfig.module.pmaxW * moduleCount) / 1000;
  const inverterPacW = project.arrayConfig.inverters.reduce((total, inverter) => total + inverter.inverter.pacW, 0);

  const result = computeMonthlySimulationTable({
    inPlaneHourly: inPlane,
    horizontalHourly: horizontal,
    module: toPvModuleInput(project.arrayConfig.module),
    moduleCount,
    installedKWp,
    dcVoltageDropPct: 1.5, // placeholder until the engine's own cabling results are threaded through
    acVoltageDropPct: 1.0,
    inverterPacW,
  });

  const annualKWh = result.monthly.reduce((sum, row) => sum + row.eGridKWh, 0);
  const annualPrPct = result.monthly.reduce((sum, row) => sum + row.prPct, 0) / result.monthly.length;

  await db.projectSimulation.upsert({
    where: { projectId },
    create: {
      projectId,
      source: 'PVGIS_LIVE',
      annualProductionKWh: annualKWh,
      specificYieldKWhPerKWp: installedKWp > 0 ? annualKWh / installedKWp : 0,
      performanceRatioPct: annualPrPct,
    },
    update: {
      annualProductionKWh: annualKWh,
      specificYieldKWhPerKWp: installedKWp > 0 ? annualKWh / installedKWp : 0,
      performanceRatioPct: annualPrPct,
    },
  });

  return result;
}
