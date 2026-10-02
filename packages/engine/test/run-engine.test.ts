// packages/engine/test/run-engine.test.ts
import { describe, it, expect } from 'vitest';
import { runEngine } from '../src/run-engine';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';

describe('runEngine — reference dossier (Habib Khedhira, corrected)', () => {
  it('computes P_DC_W = 3100 (5 modules x 620W)', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.derived.P_DC_W).toBe(3100);
  });

  it('computes POWER_RATIO around 1.033 (3100W DC / 3000W AC)', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.derived.POWER_RATIO).toBeCloseTo(1.0333, 3);
  });

  it('passes C06 (power ratio in range) with the corrected inputs', () => {
    const result = runEngine(habibKhedhiraFixture);
    const c06 = result.checks.find((c) => c.id === 'C06');
    expect(c06?.pass).toBe(true);
  });

  it('passes C01 (Ns within NS_MAX) with Ns=5 against a 550V inverter', () => {
    const result = runEngine(habibKhedhiraFixture);
    const c01 = result.checks.find((c) => c.id === 'C01');
    expect(c01?.pass).toBe(true);
  });

  it('has no blocking failures on the fully corrected reference inputs', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.hasBlockingFailure).toBe(false);
  });

  it('returns exactly 22 checks', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.checks).toHaveLength(22);
  });

  it('flags C09 as failing when the DC switch is under-rated (regression guard for the 20A/25A dossier mismatch)', () => {
    const underRated = {
      ...habibKhedhiraFixture,
      dcSwitch: { ratedVoltageV: 600, ratedCurrentA: 15 },
    };
    const result = runEngine(underRated);
    const c09 = result.checks.find((c) => c.id === 'C09');
    expect(c09?.pass).toBe(false);
    expect(result.hasBlockingFailure).toBe(true);
  });

  it('catches a Ns/Np BLOCK failure on a SECOND inverter/MPPT, not just the first (regression guard for silently ignoring all but array[0].mppts[0])', () => {
    // Second inverter has vdcMaxV = 200V, but its single MPPT has 4 modules per string.
    // stringVoc at Tmin = 4 * vocAtTmin(module, -10) = 4 * 60.79125 = 243.165V > 200V,
    // so NS_MAX = floor(200 / 60.79125) = 3, and ns=4 > nsMax=3 => C01 must fail (BLOCK).
    // The first inverter/MPPT (ns=5 against a 550V inverter) still passes on its own, so if
    // runEngine only looked at array[0].mppts[0], this would wrongly report no blocking failure.
    const secondInverterOutOfBounds = {
      ...habibKhedhiraFixture,
      array: [
        ...habibKhedhiraFixture.array,
        {
          inverter: {
            phases: 1 as const,
            pacW: 1000,
            sacVA: 1000,
            vdcMaxV: 200,
            mpptMinV: 90,
            mpptMaxV: 200,
            startUpV: 100,
            mpptCount: 1,
            inputsPerMppt: 2,
            idcMaxPerMpptA: 16,
            iscMaxPerMpptA: 20,
            vacNomV: 230,
            iacMaxA: 16,
            stegApproved: true,
          },
          mppts: [{ stringsInParallel: 1, modulesPerString: 4 }],
        },
      ],
    };
    const result = runEngine(secondInverterOutOfBounds);
    expect(result.hasBlockingFailure).toBe(true);
    const failingBlocks = result.checks.filter((c) => c.level === 'BLOCK' && !c.pass);
    expect(failingBlocks.length).toBeGreaterThan(0);
    expect(failingBlocks.some((c) => c.id === 'C01')).toBe(true);
  });
});
