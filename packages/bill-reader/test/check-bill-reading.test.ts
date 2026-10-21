import { describe, expect, it } from 'vitest';
import { checkBillReading } from '../src';
import { testBill } from './fixtures/test-bill';

const POWER_WARNING =
  'Puissance souscrite de 13 kVA inhabituelle pour un abonné monophasé — vérifier sur le compteur.';

describe('checkBillReading', () => {
  it('flags only the off-ladder power on a consistent bill', () => {
    const r = checkBillReading(testBill);
    expect(r.warnings).toEqual([POWER_WARNING]);
    expect(r.missingFields).toEqual([]);
    expect(r.derived.annualConsumptionKWh).toBe(21096);
    expect(r.derived.averagePriceTNDPerKWh).toBe(0.1236);
  });

  it('detects a sum mismatch', () => {
    const r = checkBillReading({ ...testBill, totalElectricityKWh: 7000 });
    expect(r.warnings.some((w) => w.startsWith('La somme des consommations par poste (7032 kWh)'))).toBe(true);
  });

  it('detects an index/quantity mismatch', () => {
    const lines = testBill.lines.map((l) => (l.label === 'JOUR' ? { ...l, newIndex: 28700 } : l));
    const r = checkBillReading({ ...testBill, lines });
    expect(r.warnings.some((w) => w.includes('Poste « JOUR »'))).toBe(true);
  });

  it('derives months from the dates when the count is unreadable', () => {
    const r = checkBillReading({ ...testBill, monthsBilled: null });
    expect(r.derived.monthsBilled).toBe(4);
    expect(r.missingFields).not.toContain('monthsBilled');
  });

  it('flags a months count inconsistent with the period', () => {
    const r = checkBillReading({ ...testBill, monthsBilled: 2 });
    expect(r.warnings.some((w) => w.startsWith('Nombre de mois facturés (2) incohérent avec la période du 2023-02-13 au 2023-06-12.'))).toBe(true);
  });

  it('lists unreadable required fields without guessing', () => {
    const r = checkBillReading({ ...testBill, stegReference: null, subscribedPowerKVA: null });
    expect(r.missingFields).toEqual(['stegReference', 'subscribedPowerKVA']);
    expect(r.warnings).toEqual([]);
  });
});
