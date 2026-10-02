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
});
