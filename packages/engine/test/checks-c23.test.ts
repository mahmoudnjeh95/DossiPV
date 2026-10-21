import { describe, it, expect } from 'vitest';
import { checkC23, runEngine } from '../src';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';

describe('checkC23', () => {
  it('blocks when total inverter AC power exceeds the subscribed power', () => {
    expect(checkC23(5000, 4)).toEqual({
      id: 'C23',
      level: 'BLOCK',
      pass: false,
      message: 'Puissance AC totale des onduleurs supérieure à la puissance souscrite',
    });
  });
  it('passes at exactly the subscribed power', () => {
    expect(checkC23(4000, 4).pass).toBe(true);
  });
});

describe('runEngine + subscribedPowerKVA', () => {
  it('fails C23 when the subscribed power is below the inverter power', () => {
    const result = runEngine({ ...habibKhedhiraFixture, subscribedPowerKVA: 1 });
    expect(result.checks.find((c) => c.id === 'C23')?.pass).toBe(false);
    expect(result.hasBlockingFailure).toBe(true);
  });
  it('does not run C23 when subscribedPowerKVA is absent', () => {
    expect(runEngine(habibKhedhiraFixture).checks.some((c) => c.id === 'C23')).toBe(false);
  });
});
