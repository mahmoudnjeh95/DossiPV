import { totalIrradianceWM2, type PvgisHourlyRow } from '@dossipv/pvgis-client';
import type { PvModuleInput } from './types';

const DEFAULT_NOCT_C = 45;
const STC_IRRADIANCE_WM2 = 1000;
const NOCT_IRRADIANCE_WM2 = 800;
const NOCT_AMBIENT_C = 20;

export function cellTempFromIrradiance(ambientTempC: number, irradianceWM2: number, noctC: number | undefined): number {
  const resolvedNoct = noctC ?? DEFAULT_NOCT_C;
  const noctRiseC = resolvedNoct - NOCT_AMBIENT_C;
  return ambientTempC + (irradianceWM2 / NOCT_IRRADIANCE_WM2) * noctRiseC;
}

export function pmaxAtCellTemp(module: PvModuleInput, cellTempC: number): number {
  return module.pmaxW * (1 + (module.tempCoeffPmaxPct / 100) * (cellTempC - 25));
}

export interface MonthlyIrradianceAggregate {
  month: number;
  globHorKWhM2: number;
  diffHorKWhM2: number;
  globIncKWhM2: number;
  ambientTempC: number;
  hourlyInPlane: PvgisHourlyRow[];
}

function monthFromTime(time: string): number {
  return Number(time.slice(4, 6));
}

export function aggregateMonthlyIrradiance(
  inPlaneHourly: PvgisHourlyRow[],
  horizontalHourly: PvgisHourlyRow[],
): MonthlyIrradianceAggregate[] {
  const months = new Map<
    number,
    { globHorWh: number; diffHorWh: number; globIncWh: number; tempSum: number; count: number; hourlyInPlane: PvgisHourlyRow[] }
  >();

  for (const row of inPlaneHourly) {
    const month = monthFromTime(row.time);
    const bucket = months.get(month) ?? { globHorWh: 0, diffHorWh: 0, globIncWh: 0, tempSum: 0, count: 0, hourlyInPlane: [] };
    bucket.globIncWh += totalIrradianceWM2(row);
    bucket.tempSum += row.ambientTempC;
    bucket.count += 1;
    bucket.hourlyInPlane.push(row);
    months.set(month, bucket);
  }

  for (const row of horizontalHourly) {
    const month = monthFromTime(row.time);
    const bucket = months.get(month);
    if (bucket) {
      bucket.globHorWh += totalIrradianceWM2(row);
      bucket.diffHorWh += row.diffuseWM2;
    }
  }

  return Array.from(months.entries())
    .map(([month, bucket]) => ({
      month,
      globHorKWhM2: bucket.globHorWh / 1000,
      diffHorKWhM2: bucket.diffHorWh / 1000,
      globIncKWhM2: bucket.globIncWh / 1000,
      ambientTempC: bucket.tempSum / bucket.count,
      hourlyInPlane: bucket.hourlyInPlane,
    }))
    .sort((a, b) => a.month - b.month);
}

export interface MonthlySimulationRow {
  month: number;
  globHorKWhM2: number;
  diffHorKWhM2: number;
  ambientTempC: number;
  globIncKWhM2: number;
  globEffKWhM2: number;
  eArrayKWh: number;
  eGridKWh: number;
  prPct: number;
}

export interface SimulationChartData {
  monthly: MonthlySimulationRow[];
  normalizedProductionPerKWp: number[];
  performanceRatioPct: number[];
}

export interface ComputeMonthlySimulationTableInput {
  inPlaneHourly: PvgisHourlyRow[];
  horizontalHourly: PvgisHourlyRow[];
  module: PvModuleInput;
  moduleCount: number;
  installedKWp: number;
  dcVoltageDropPct: number;
  acVoltageDropPct: number;
}

export function computeMonthlySimulationTable(input: ComputeMonthlySimulationTableInput): SimulationChartData {
  const aggregates = aggregateMonthlyIrradiance(input.inPlaneHourly, input.horizontalHourly);

  const monthly: MonthlySimulationRow[] = aggregates.map((aggregate) => {
    let eArrayWh = 0;
    let eGridWh = 0;

    for (const hour of aggregate.hourlyInPlane) {
      const hourIrradianceWM2 = totalIrradianceWM2(hour);
      const cellTempC = cellTempFromIrradiance(hour.ambientTempC, hourIrradianceWM2, input.module.noctC);
      const derateFromStc = pmaxAtCellTemp(input.module, cellTempC) / input.module.pmaxW;
      const irradianceRatio = hourIrradianceWM2 / STC_IRRADIANCE_WM2;
      const hourArrayWh = input.module.pmaxW * input.moduleCount * irradianceRatio * derateFromStc;

      const irradianceRatioSquared = irradianceRatio * irradianceRatio;
      const dcLossFraction = (input.dcVoltageDropPct / 100) * irradianceRatioSquared;
      const acLossFraction = (input.acVoltageDropPct / 100) * irradianceRatioSquared;
      const hourGridWh = hourArrayWh * (1 - dcLossFraction) * (1 - acLossFraction);

      eArrayWh += Math.max(0, hourArrayWh);
      eGridWh += Math.max(0, hourGridWh);
    }

    const eArrayKWh = eArrayWh / 1000;
    const eGridKWh = eGridWh / 1000;
    const prPct =
      input.installedKWp > 0 && aggregate.globIncKWhM2 > 0
        ? (eGridKWh / (input.installedKWp * aggregate.globIncKWhM2)) * 100
        : 0;

    return {
      month: aggregate.month,
      globHorKWhM2: aggregate.globHorKWhM2,
      diffHorKWhM2: aggregate.diffHorKWhM2,
      ambientTempC: aggregate.ambientTempC,
      globIncKWhM2: aggregate.globIncKWhM2,
      globEffKWhM2: aggregate.globIncKWhM2,
      eArrayKWh,
      eGridKWh,
      prPct,
    };
  });

  return {
    monthly,
    normalizedProductionPerKWp: monthly.map((row) => (input.installedKWp > 0 ? row.eGridKWh / input.installedKWp : 0)),
    performanceRatioPct: monthly.map((row) => row.prPct),
  };
}
