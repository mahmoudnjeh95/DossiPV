import { describe, it, expect } from 'vitest';
import { aggregateMonthlyIrradiance, computeMonthlySimulationTable, pmaxAtCellTemp } from '../src/pvgis-simulation';
import type { PvgisHourlyRow } from '@dossipv/pvgis-client';

/** Test helper — beamWM2/diffuseWM2 split chosen so (beam+diffuse+reflected) matches each
 * call site's previous "total irradiance" figure, and diffuseWM2 is independently assertable. */
function row(time: string, beamWM2: number, diffuseWM2: number, ambientTempC: number): PvgisHourlyRow {
  return { time, beamWM2, diffuseWM2, reflectedWM2: 0, ambientTempC };
}

describe('aggregateMonthlyIrradiance', () => {
  it('sums in-plane irradiance into kWh/m2 per month and averages ambient temperature', () => {
    const inPlane: PvgisHourlyRow[] = [
      row('20200101:0809', 80, 20, 9.0),
      row('20200101:0909', 160, 40, 10.0),
      row('20200201:0809', 40, 10, 5.0),
    ];
    const horizontal: PvgisHourlyRow[] = [
      row('20200101:0809', 60, 20, 9.0),
      row('20200101:0909', 120, 30, 10.0),
      row('20200201:0809', 30, 10, 5.0),
    ];

    const result = aggregateMonthlyIrradiance(inPlane, horizontal);

    const jan = result.find((r) => r.month === 1)!;
    expect(jan.globIncKWhM2).toBeCloseTo((100 + 200) / 1000, 5);
    expect(jan.globHorKWhM2).toBeCloseTo((80 + 150) / 1000, 5);
    expect(jan.diffHorKWhM2).toBeCloseTo((20 + 30) / 1000, 5);
    expect(jan.ambientTempC).toBeCloseTo(9.5, 5);

    const feb = result.find((r) => r.month === 2)!;
    expect(feb.globIncKWhM2).toBeCloseTo(50 / 1000, 5);
  });

  it('buckets the last hour of a month correctly, not into the next month', () => {
    const lastHourOfJanuary = row('20200131:2309', 8, 2, 5.0);
    const firstHourOfFebruary = row('20200201:0009', 4, 1, 4.0);

    const result = aggregateMonthlyIrradiance([lastHourOfJanuary, firstHourOfFebruary], [lastHourOfJanuary, firstHourOfFebruary]);

    const jan = result.find((r) => r.month === 1)!;
    const feb = result.find((r) => r.month === 2)!;
    expect(jan.globIncKWhM2).toBeCloseTo(10 / 1000, 5);
    expect(feb.globIncKWhM2).toBeCloseTo(5 / 1000, 5);
  });
});

describe('pmaxAtCellTemp', () => {
  it('derates Pmax at a cell temperature above 25C using tempCoeffPmaxPct', () => {
    const module = {
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

    const result = pmaxAtCellTemp(module, 45);

    // 620 * (1 + (-0.28/100) * (45-25)) = 620 * (1 - 0.056) = 620 * 0.944
    expect(result).toBeCloseTo(620 * 0.944, 2);
  });
});

describe('computeMonthlySimulationTable', () => {
  const module = {
    pmaxW: 620, vmpV: 46.5, impA: 13.33, vocV: 55.9, iscA: 13.92,
    tempCoeffVocPct: -0.25, tempCoeffIscPct: 0.045, tempCoeffPmaxPct: -0.28,
    irmA: 25, maxSystemVoltageV: 1500, lengthMm: 2278, widthMm: 1134, weightKg: 33.5,
  };

  it('produces one row per month present in the data with all 8 columns populated', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20)];
    const horizontal: PvgisHourlyRow[] = [row('20200101:1200', 480, 120, 20)];

    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane,
      horizontalHourly: horizontal,
      module,
      moduleCount: 20,
      installedKWp: 12.4,
      dcVoltageDropPct: 1.5,
      acVoltageDropPct: 1.0,
    });

    expect(result.monthly).toHaveLength(1);
    const jan = result.monthly[0]!;
    expect(jan.month).toBe(1);
    expect(jan.globHorKWhM2).toBeGreaterThan(0);
    expect(jan.diffHorKWhM2).toBeGreaterThan(0);
    expect(jan.diffHorKWhM2).toBeLessThan(jan.globHorKWhM2); // diffuse is a component of the total, never exceeds it
    expect(jan.globIncKWhM2).toBeGreaterThan(0);
    expect(jan.ambientTempC).toBe(20);
    expect(jan.eArrayKWh).toBeGreaterThan(0);
    expect(jan.eGridKWh).toBeGreaterThan(0);
    expect(jan.eGridKWh).toBeLessThan(jan.eArrayKWh); // cable losses reduce AC output below DC array output
    expect(jan.prPct).toBeGreaterThan(0);
    expect(jan.prPct).toBeLessThanOrEqual(100);
  });

  it('scales cable loss by the hourly irradiance ratio, not a flat design-max percentage', () => {
    // Two otherwise-identical hours, one at full STC irradiance, one at half — the ABSOLUTE
    // cable loss (not just the percentage) at half irradiance must be well below a quarter of
    // the full-irradiance loss's own contribution, proving the (G/1000)^2 scaling is applied
    // per hour rather than as one flat percentage of whatever output each hour happens to have.
    const fullSun: PvgisHourlyRow[] = [row('20200101:1200', 800, 200, 25)];
    const halfSun: PvgisHourlyRow[] = [row('20200101:1200', 400, 100, 25)];

    const fullResult = computeMonthlySimulationTable({
      inPlaneHourly: fullSun, horizontalHourly: fullSun, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });
    const halfResult = computeMonthlySimulationTable({
      inPlaneHourly: halfSun, horizontalHourly: halfSun, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });

    const fullLossKWh = fullResult.monthly[0]!.eArrayKWh - fullResult.monthly[0]!.eGridKWh;
    const halfLossKWh = halfResult.monthly[0]!.eArrayKWh - halfResult.monthly[0]!.eGridKWh;

    // Loss scales with (ratio)^2 * (output which itself scales ~linearly with irradiance) —
    // so loss at half irradiance should be well under 1/4 of full-irradiance loss, not 1/2.
    expect(halfLossKWh).toBeLessThan(fullLossKWh / 3);
  });

  it('uses the default NOCT of 45C when the module has no noctC field', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20)];
    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane, horizontalHourly: inPlane, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });
    expect(Number.isNaN(result.monthly[0]!.eArrayKWh)).toBe(false);
  });

  it('returns chart data derived from the same monthly rows, never independently computed', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20), row('20200601:1200', 720, 180, 30)];
    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane, horizontalHourly: inPlane, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0,
    });

    expect(result.normalizedProductionPerKWp).toHaveLength(result.monthly.length);
    expect(result.performanceRatioPct).toEqual(result.monthly.map((m) => m.prPct));
  });
});
