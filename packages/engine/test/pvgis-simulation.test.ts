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
      inverterPacW: 15000,
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
    // Two otherwise-identical hours, one at full STC irradiance, one at half. Isolate cable
    // loss specifically (not the separate, linearly-scaling inverter-efficiency/pacW-clamp
    // effects also present in eArrayKWh - eGridKWh) by comparing each case against its own
    // zero-cable-loss baseline (dcVoltageDropPct/acVoltageDropPct both 0) — the DIFFERENCE
    // between the real-loss and zero-loss grid output at each irradiance level isolates
    // exactly the cable-loss contribution at that level.
    const fullSun: PvgisHourlyRow[] = [row('20200101:1200', 800, 200, 25)];
    const halfSun: PvgisHourlyRow[] = [row('20200101:1200', 400, 100, 25)];

    function gridKWhWithCableLoss(hourly: PvgisHourlyRow[], dcPct: number, acPct: number): number {
      return computeMonthlySimulationTable({
        inPlaneHourly: hourly, horizontalHourly: hourly, module, moduleCount: 20,
        installedKWp: 12.4, dcVoltageDropPct: dcPct, acVoltageDropPct: acPct, inverterPacW: 15000,
      }).monthly[0]!.eGridKWh;
    }

    const fullCableLossKWh = gridKWhWithCableLoss(fullSun, 0, 0) - gridKWhWithCableLoss(fullSun, 1.5, 1.0);
    const halfCableLossKWh = gridKWhWithCableLoss(halfSun, 0, 0) - gridKWhWithCableLoss(halfSun, 1.5, 1.0);

    // Loss scales with (ratio)^2 * (output which itself scales ~linearly with irradiance) —
    // so loss at half irradiance should be well under 1/4 of full-irradiance loss, not 1/2.
    expect(halfCableLossKWh).toBeLessThan(fullCableLossKWh / 3);
  });

  it('uses the default NOCT of 45C when the module has no noctC field', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20)];
    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane, horizontalHourly: inPlane, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0, inverterPacW: 15000,
    });
    expect(Number.isNaN(result.monthly[0]!.eArrayKWh)).toBe(false);
  });

  it('returns chart data derived from the same monthly rows, never independently computed', () => {
    const inPlane: PvgisHourlyRow[] = [row('20200101:1200', 640, 160, 20), row('20200601:1200', 720, 180, 30)];
    const result = computeMonthlySimulationTable({
      inPlaneHourly: inPlane, horizontalHourly: inPlane, module, moduleCount: 20,
      installedKWp: 12.4, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0, inverterPacW: 15000,
    });

    expect(result.normalizedProductionPerKWp).toHaveLength(result.monthly.length);
    expect(result.performanceRatioPct).toEqual(result.monthly.map((m) => m.prPct));
  });

  it('clamps hourly AC output at the inverter rated power (pacW), never exceeding it', () => {
    // 5 modules * 620W = 3100W DC array at full STC irradiance, well above a 3000W-rated
    // inverter -- the hour's AC output must be clamped at inverterPacW, not left at the
    // uncapped DC-derived figure (this was a real bug found via live PVGIS validation: without
    // the clamp, a full day of such hours overstated annual yield by ~67% against PVGIS's own
    // reference pvcalculation=1 output for the same system/location).
    const fullSunHour: PvgisHourlyRow[] = [row('20200101:1200', 800, 200, 25)];

    const result = computeMonthlySimulationTable({
      inPlaneHourly: fullSunHour, horizontalHourly: fullSunHour, module, moduleCount: 5,
      installedKWp: 3.1, dcVoltageDropPct: 1.5, acVoltageDropPct: 1.0, inverterPacW: 3000,
    });

    // One hour, so eGridKWh IS that hour's output (converted to kWh) -- must not exceed
    // 3000W / 1000 = 3.0 kWh for this single hour.
    expect(result.monthly[0]!.eGridKWh).toBeLessThanOrEqual(3.0);
  });

  it('applies a standard inverter conversion efficiency to AC output, not a 1:1 DC-to-AC pass-through', () => {
    // A single hour well below the inverter's pacW clamp, so the clamp never engages --
    // isolates the efficiency factor's own effect.
    const partialSunHour: PvgisHourlyRow[] = [row('20200101:0900', 240, 60, 20)];

    const result = computeMonthlySimulationTable({
      inPlaneHourly: partialSunHour, horizontalHourly: partialSunHour, module, moduleCount: 5,
      installedKWp: 3.1, dcVoltageDropPct: 0, acVoltageDropPct: 0, inverterPacW: 3000,
    });

    // With dcVoltageDropPct/acVoltageDropPct both 0, the only remaining loss source is the
    // inverter's own conversion efficiency -- eGridKWh must be strictly less than eArrayKWh.
    expect(result.monthly[0]!.eGridKWh).toBeLessThan(result.monthly[0]!.eArrayKWh);
  });
});
