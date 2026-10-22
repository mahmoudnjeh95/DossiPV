import { totalIrradianceWM2, type PvgisHourlyRow } from '@dossipv/pvgis-client';
import type { PvModuleInput } from './types';

const DEFAULT_NOCT_C = 45;
const STC_IRRADIANCE_WM2 = 1000;
const NOCT_IRRADIANCE_WM2 = 800;
const NOCT_AMBIENT_C = 20;
/**
 * Standard crystalline-silicon string-inverter conversion efficiency (DC-to-AC), applied on
 * top of (not instead of) the inverter's own rated AC power clamp below — the engine has no
 * per-inverter efficiency-curve field (InverterInput never modeled one), so this fixed figure
 * is the acknowledged, documented stand-in until a real efficiency-curve field exists.
 */
export const DEFAULT_INVERTER_EFFICIENCY_PCT = 97;

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
  /** Energy at the array's output (after the temperature derating), before any cable. */
  eArrayKWh: number;
  eGridKWh: number;
  prPct: number;
  /** kWp × in-plane irradiation: the energy at STC efficiency, before any loss. */
  eNominalKWh: number;
  /** After the DC cable losses (inverter input). */
  eAfterDcCableKWh: number;
  /** After the inverter's conversion efficiency, before clipping at Pac. */
  eInverterUnclippedKWh: number;
  /** The inverter's output, clipped at Pac (before the AC cable). */
  eInverterOutKWh: number;
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
  /** Inverter's rated continuous AC output power, watts (InverterInput.pacW) — hourly AC
   * output is clamped at this value, since a DC array routinely exceeds the inverter's rated
   * capacity at midday (a correctly-sized system is sized that way on purpose). */
  inverterPacW: number;
}

export function computeMonthlySimulationTable(input: ComputeMonthlySimulationTableInput): SimulationChartData {
  const aggregates = aggregateMonthlyIrradiance(input.inPlaneHourly, input.horizontalHourly);

  const monthly: MonthlySimulationRow[] = aggregates.map((aggregate) => {
    let eNominalWh = 0;
    let eArrayWh = 0;
    let eAfterDcCableWh = 0;
    let eInverterUnclippedWh = 0;
    let eInverterOutWh = 0;
    let eGridWh = 0;

    for (const hour of aggregate.hourlyInPlane) {
      const hourIrradianceWM2 = totalIrradianceWM2(hour);
      const cellTempC = cellTempFromIrradiance(hour.ambientTempC, hourIrradianceWM2, input.module.noctC);
      const derateFromStc = pmaxAtCellTemp(input.module, cellTempC) / input.module.pmaxW;
      const irradianceRatio = hourIrradianceWM2 / STC_IRRADIANCE_WM2;
      const hourArrayWh = input.module.pmaxW * input.moduleCount * irradianceRatio * derateFromStc;

      // Cable losses are I²R: the lost power goes with the square of the current, so the lost
      // FRACTION of the power goes linearly with the current. The design drops are computed at
      // the rated current (DC: string Imp at STC; AC: the inverter's rated output), so each
      // fraction is the drop scaled by the hour's current against that rated current.
      const dcLossFraction = (input.dcVoltageDropPct / 100) * Math.max(0, irradianceRatio);
      const afterDcCableWh = hourArrayWh * (1 - dcLossFraction);
      // The inverter converts, then clips at its rated AC power; the AC cable comes after it.
      const inverterUnclippedWh = afterDcCableWh * (DEFAULT_INVERTER_EFFICIENCY_PCT / 100);
      const inverterOutputWh = Math.min(inverterUnclippedWh, input.inverterPacW);
      const acLossFraction = input.inverterPacW > 0 ? (input.acVoltageDropPct / 100) * Math.max(0, inverterOutputWh / input.inverterPacW) : 0;
      const hourGridWh = inverterOutputWh * (1 - acLossFraction);

      eNominalWh += Math.max(0, input.module.pmaxW * input.moduleCount * irradianceRatio);
      eArrayWh += Math.max(0, hourArrayWh);
      eAfterDcCableWh += Math.max(0, afterDcCableWh);
      eInverterUnclippedWh += Math.max(0, inverterUnclippedWh);
      eInverterOutWh += Math.max(0, inverterOutputWh);
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
      eNominalKWh: eNominalWh / 1000,
      eAfterDcCableKWh: eAfterDcCableWh / 1000,
      eInverterUnclippedKWh: eInverterUnclippedWh / 1000,
      eInverterOutKWh: eInverterOutWh / 1000,
    };
  });

  return {
    monthly,
    normalizedProductionPerKWp: monthly.map((row) => (input.installedKWp > 0 ? row.eGridKWh / input.installedKWp : 0)),
    performanceRatioPct: monthly.map((row) => row.prPct),
  };
}
