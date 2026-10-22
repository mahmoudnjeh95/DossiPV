import { describe, it, expect } from 'vitest';
import { CHECK_LABELS } from '../src/check-labels';
import { runEngine } from '../src/run-engine';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';

describe('CHECK_LABELS', () => {
  it('labels every check C01 to C24', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
    expect(Object.keys(CHECK_LABELS)).toEqual(ids);
  });

  it('labels every check the engine produces on the reference fixture, with a subscribed power and a differential breaker', () => {
    const result = runEngine({ ...habibKhedhiraFixture, subscribedPowerKVA: 7, rcd: { residualCurrentMA: 30, rcdType: 'A' } });
    expect(result.checks.length).toBeGreaterThan(20);
    for (const check of result.checks) expect(CHECK_LABELS[check.id], check.id).toBeTruthy();
  });
});
