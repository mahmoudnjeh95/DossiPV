import { describe, it, expect } from 'vitest';
import { computeInvoiceAmounts, formatTnd, millimesToDecimalString, tndToMillimes } from '../lib/invoicing/amounts';
import { numberToFrenchWords, tndInFrenchWords } from '../lib/invoicing/number-to-words';

describe('tndToMillimes', () => {
  it('parses decimals, strings, numbers and Decimal-like values exactly', () => {
    expect(tndToMillimes('119.00')).toBe(119000n);
    expect(tndToMillimes('0.1')).toBe(100n);
    expect(tndToMillimes(0.1 + 0.2)).toBe(300n); // the float 0.30000000000000004
    expect(tndToMillimes({ toString: () => '1234.567' })).toBe(1234567n);
    expect(tndToMillimes('10')).toBe(10000n);
  });

  it('rounds half up beyond the millime and rejects garbage', () => {
    expect(tndToMillimes('1.0005')).toBe(1001n);
    expect(tndToMillimes('1.0004')).toBe(1000n);
    expect(() => tndToMillimes('abc')).toThrow();
  });
});

describe('computeInvoiceAmounts', () => {
  it('computes 119 TTC at 19% VAT with a 1,000 stamp', () => {
    // (119 - 1) / 1.19 = 99.159663... -> 99.160 ; VAT = 118 - 99.160 = 18.840
    const a = computeInvoiceAmounts('119.00', '1.000', '19');
    expect(a.totalHtMillimes).toBe(99160n);
    expect(a.vatMillimes).toBe(18840n);
    expect(a.stampMillimes).toBe(1000n);
    expect(a.totalTtcMillimes).toBe(119000n);
  });

  it('gives exact figures when the division is exact', () => {
    // (120 + 1 - 1) ... 119 TTC, stamp 1: 118/1.18 at 18% = 100
    const a = computeInvoiceAmounts('119', '1', '18');
    expect(a.totalHtMillimes).toBe(100000n);
    expect(a.vatMillimes).toBe(18000n);
  });

  it('always adds up: HT + VAT + stamp = TTC, for many amounts and rates', () => {
    for (const rate of ['0', '7', '13', '19', '19.5', '100']) {
      for (let cents = 100; cents < 40000; cents += 337) {
        const ttc = (cents / 100).toFixed(2);
        const a = computeInvoiceAmounts(ttc, '1.000', rate);
        expect(a.totalHtMillimes + a.vatMillimes + a.stampMillimes).toBe(a.totalTtcMillimes);
        expect(a.vatMillimes >= 0n).toBe(true);
      }
    }
  });

  it('rounds half up on the HT base', () => {
    // base 1.19 TTC at 19% -> 1.000 exactly; base 0.595 at 19% -> 0.5 exactly
    expect(computeInvoiceAmounts('1.19', '0', '19').totalHtMillimes).toBe(1000n);
    // 1.00 at 19%: 0.840336... -> 0.840 ; 2.00: 1.680672... -> 1.681
    expect(computeInvoiceAmounts('1.00', '0', '19').totalHtMillimes).toBe(840n);
    expect(computeInvoiceAmounts('2.00', '0', '19').totalHtMillimes).toBe(1681n);
    // a tie: 0.0105 TND is not representable; use 0.003 at 100% -> 0.0015 -> 0.002
    expect(computeInvoiceAmounts('0.003', '0', '100').totalHtMillimes).toBe(2n);
  });

  it('handles a zero stamp, a zero rate and a stamp larger than the total', () => {
    const noStamp = computeInvoiceAmounts('50', '0', '19');
    expect(noStamp.stampMillimes).toBe(0n);
    const noVat = computeInvoiceAmounts('50', '1', '0');
    expect(noVat.totalHtMillimes).toBe(49000n);
    expect(noVat.vatMillimes).toBe(0n);
    const tiny = computeInvoiceAmounts('0.500', '1', '19');
    expect(tiny.stampMillimes).toBe(500n);
    expect(tiny.totalHtMillimes).toBe(0n);
    expect(tiny.vatMillimes).toBe(0n);
  });

  it('rejects a negative total', () => {
    expect(() => computeInvoiceAmounts('-1', '1', '19')).toThrow();
  });
});

describe('formatting', () => {
  it('prints decimals and French thousands', () => {
    expect(millimesToDecimalString(99160n)).toBe('99.160');
    expect(millimesToDecimalString(5n)).toBe('0.005');
    expect(formatTnd(1234567n)).toBe('1 234,567');
    expect(formatTnd(0n)).toBe('0,000');
  });
});

describe('numberToFrenchWords', () => {
  it.each([
    [0, 'zéro'],
    [1, 'un'],
    [16, 'seize'],
    [21, 'vingt et un'],
    [22, 'vingt-deux'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [77, 'soixante-dix-sept'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [280, 'deux cent quatre-vingts'],
    [999, 'neuf cent quatre-vingt-dix-neuf'],
    [1000, 'mille'],
    [1001, 'mille un'],
    [2000, 'deux mille'],
    [80000, 'quatre-vingt mille'],
    [200000, 'deux cent mille'],
    [1_000_000, 'un million'],
    [2_000_000, 'deux millions'],
    [1_234_567, 'un million deux cent trente-quatre mille cinq cent soixante-sept'],
  ])('%i -> %s', (n, words) => {
    expect(numberToFrenchWords(n)).toBe(words);
  });

  it('rejects out-of-range and non-integer numbers', () => {
    expect(() => numberToFrenchWords(-1)).toThrow();
    expect(() => numberToFrenchWords(1.5)).toThrow();
  });
});

describe('tndInFrenchWords', () => {
  it('writes dinars and millimes', () => {
    expect(tndInFrenchWords(119000n)).toBe('cent dix-neuf dinars');
    expect(tndInFrenchWords(119880n)).toBe('cent dix-neuf dinars et huit cent quatre-vingts millimes');
    expect(tndInFrenchWords(1000n)).toBe('un dinar');
    expect(tndInFrenchWords(1001n)).toBe('un dinar et un millime');
    expect(tndInFrenchWords(500n)).toBe('zéro dinar et cinq cents millimes');
    expect(tndInFrenchWords(0n)).toBe('zéro dinar');
  });
});
