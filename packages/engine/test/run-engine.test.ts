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

  it('falls back to maxVoltageDropPct for AC when maxAcVoltageDropPct is absent', () => {
    // Legacy fixture: DC limit 3, no AC limit. A 0.1 % AC limit must fail C17, the absent one must not.
    expect(habibKhedhiraFixture.maxAcVoltageDropPct).toBeUndefined();
    const legacy = runEngine(habibKhedhiraFixture).checks.find((c) => c.id === 'C17');
    expect(legacy?.pass).toBe(true);
    const strict = runEngine({ ...habibKhedhiraFixture, maxAcVoltageDropPct: 0.001 }).checks.find((c) => c.id === 'C17');
    expect(strict?.pass).toBe(false);
    expect(strict?.message).toContain('Chute de tension AC');
  });

  it('returns exactly 22 checks', () => {
    const result = runEngine(habibKhedhiraFixture);
    expect(result.checks).toHaveLength(22);
  });

  describe('without stability inputs (material + wind speed only)', () => {
    const { frameCount, structureWeightN, heightHM, depthDM, ...windOnly } = habibKhedhiraFixture.structure;
    void frameCount;
    void structureWeightN;
    void heightHM;
    void depthDM;

    it('skips the stability derivations and the C18 check', () => {
      const result = runEngine({ ...habibKhedhiraFixture, structure: windOnly });
      expect(result.derived.F_WEIGHT_N).toBeUndefined();
      expect(result.derived.STABILITY_LHS).toBeUndefined();
      expect(result.derived.STABILITY_RHS).toBeUndefined();
      expect(result.checks.some((c) => c.id === 'C18')).toBe(false);
      expect(result.checks).toHaveLength(21);
      expect(result.hasBlockingFailure).toBe(false);
    });

    it('does not require lift/drag coefficients for a non-default wind speed', () => {
      const { liftCoeffNPerM2, dragCoeffNPerM2, ...noCoeffs } = windOnly;
      void liftCoeffNPerM2;
      void dragCoeffNPerM2;
      expect(() =>
        runEngine({ ...habibKhedhiraFixture, structure: { ...noCoeffs, windSpeedKmh: 90 } }),
      ).not.toThrow();
    });
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

  it('catches a phase mismatch (C19) on a SECOND inverter, not just array[0]\'s (regression guard for only checking array[0].inverter.phases)', () => {
    // array[0]'s inverter is single-phase, matching site.phases=1, so C19 passes for it.
    // The second inverter is three-phase, which mismatches site.phases=1 — if runEngine only
    // checked array[0].inverter.phases against site.phases, this mismatch would never surface.
    const secondInverterWrongPhases = {
      ...habibKhedhiraFixture,
      array: [
        ...habibKhedhiraFixture.array,
        {
          inverter: {
            phases: 3 as const,
            pacW: 1000,
            sacVA: 1000,
            vdcMaxV: 550,
            mpptMinV: 90,
            mpptMaxV: 550,
            startUpV: 100,
            mpptCount: 1,
            inputsPerMppt: 2,
            idcMaxPerMpptA: 16,
            iscMaxPerMpptA: 20,
            vacNomV: 230,
            iacMaxA: 16,
            stegApproved: true,
          },
          mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
        },
      ],
    };
    const result = runEngine(secondInverterWrongPhases);
    expect(result.hasBlockingFailure).toBe(true);
    const failingBlocks = result.checks.filter((c) => c.level === 'BLOCK' && !c.pass);
    expect(failingBlocks.some((c) => c.id === 'C19')).toBe(true);
  });

  it('catches an under-rated AC breaker (C13) on a SECOND inverter, not just array[0]\'s (regression guard for only checking array[0].inverter.iacMaxA)', () => {
    // array[0]'s inverter has iacMaxA=16, matching acBreaker.ratedCurrentA=20 (C13 passes for it).
    // The second inverter draws iacMaxA=25, exceeding the shared 20A breaker — if runEngine only
    // checked array[0].inverter.iacMaxA against the breaker, this overload would never surface.
    const secondInverterOverloadsBreaker = {
      ...habibKhedhiraFixture,
      array: [
        ...habibKhedhiraFixture.array,
        {
          inverter: {
            phases: 1 as const,
            pacW: 1000,
            sacVA: 1000,
            vdcMaxV: 550,
            mpptMinV: 90,
            mpptMaxV: 550,
            startUpV: 100,
            mpptCount: 1,
            inputsPerMppt: 2,
            idcMaxPerMpptA: 16,
            iscMaxPerMpptA: 20,
            vacNomV: 230,
            iacMaxA: 25,
            stegApproved: true,
          },
          mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
        },
      ],
    };
    const result = runEngine(secondInverterOverloadsBreaker);
    expect(result.hasBlockingFailure).toBe(true);
    const failingBlocks = result.checks.filter((c) => c.level === 'BLOCK' && !c.pass);
    expect(failingBlocks.some((c) => c.id === 'C13')).toBe(true);
  });

  it('flags a non-STEG-approved SECOND inverter (C21, WARN) even though array[0]\'s is approved (regression guard for only checking array[0].inverter.stegApproved)', () => {
    const secondInverterNotStegApproved = {
      ...habibKhedhiraFixture,
      array: [
        ...habibKhedhiraFixture.array,
        {
          inverter: {
            phases: 1 as const,
            pacW: 1000,
            sacVA: 1000,
            vdcMaxV: 550,
            mpptMinV: 90,
            mpptMaxV: 550,
            startUpV: 100,
            mpptCount: 1,
            inputsPerMppt: 2,
            idcMaxPerMpptA: 16,
            iscMaxPerMpptA: 20,
            vacNomV: 230,
            iacMaxA: 16,
            stegApproved: false,
          },
          mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
        },
      ],
    };
    const result = runEngine(secondInverterNotStegApproved);
    const c21Results = result.checks.filter((c) => c.id === 'C21');
    expect(c21Results.some((c) => !c.pass)).toBe(true);
  });

  it('flags C20 (WARN) when a piece of equipment has an expired homologation', () => {
    const result = runEngine({ ...habibKhedhiraFixture, equipmentHomologationExpiries: ['2020-01-01', null] });
    const c20 = result.checks.find((c) => c.id === 'C20');
    expect(c20?.pass).toBe(false);
    expect(result.hasBlockingFailure).toBe(false);
  });
});
