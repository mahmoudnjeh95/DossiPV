import { describe, it, expect } from 'vitest';
import { checkC24, runEngine } from '../src';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';

const MESSAGE = 'Aucune protection différentielle 30 mA de type A (ou F, B) côté AC';

describe('checkC24', () => {
  it('passes a 30 mA type A differential breaker', () => {
    expect(checkC24({ residualCurrentMA: 30, rcdType: 'A' })).toEqual({ id: 'C24', level: 'BLOCK', pass: true, message: MESSAGE });
  });

  it('passes type F and type B at 30 mA, and a more sensitive 10 mA type A', () => {
    expect(checkC24({ residualCurrentMA: 30, rcdType: 'F' }).pass).toBe(true);
    expect(checkC24({ residualCurrentMA: 30, rcdType: 'B' }).pass).toBe(true);
    expect(checkC24({ residualCurrentMA: 10, rcdType: 'A' }).pass).toBe(true);
  });

  it('fails a 300 mA differential', () => {
    expect(checkC24({ residualCurrentMA: 300, rcdType: 'A' }).pass).toBe(false);
  });

  it('fails a type AC differential', () => {
    expect(checkC24({ residualCurrentMA: 30, rcdType: 'AC' }).pass).toBe(false);
  });

  it('fails a plain breaker (no differential function) with the exact message', () => {
    expect(checkC24({ residualCurrentMA: null, rcdType: null })).toEqual({ id: 'C24', level: 'BLOCK', pass: false, message: MESSAGE });
    expect(checkC24({ residualCurrentMA: 30, rcdType: null }).pass).toBe(false);
    expect(checkC24({ residualCurrentMA: null, rcdType: 'A' }).pass).toBe(false);
  });
});

describe('runEngine + rcd', () => {
  it('runs C24 and blocks when the AC breaker has no differential function', () => {
    const result = runEngine({ ...habibKhedhiraFixture, rcd: { residualCurrentMA: null, rcdType: null } });
    expect(result.checks.find((c) => c.id === 'C24')).toEqual({ id: 'C24', level: 'BLOCK', pass: false, message: MESSAGE });
    expect(result.hasBlockingFailure).toBe(true);
  });

  it('passes C24 for a 30 mA type A breaker', () => {
    const result = runEngine({ ...habibKhedhiraFixture, rcd: { residualCurrentMA: 30, rcdType: 'A' } });
    expect(result.checks.find((c) => c.id === 'C24')?.pass).toBe(true);
  });

  it('does not run C24 when rcd is absent', () => {
    expect(runEngine(habibKhedhiraFixture).checks.some((c) => c.id === 'C24')).toBe(false);
  });
});
