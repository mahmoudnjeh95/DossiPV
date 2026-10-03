import { describe, it, expect } from 'vitest';
import { assertNoRawNumbers, RawNumberLeakError } from '../src/validate-no-raw-numbers';
import type { DossierTextSections } from '../src/types';

const base: DossierTextSections = {
  introduction: 'Introduction avec {P_DC_W}.',
  solution: 'Solution avec {NS} modules.',
  cabling: 'Câblage conforme {NORME_REF}.',
  earthing: '{EARTH_ROD_COUNT} piquets de terre.',
  structure: 'Structure en aluminium.',
  conclusion: 'Conclusion.',
};

describe('assertNoRawNumbers', () => {
  it('does not throw when every section only uses {PLACEHOLDER} tokens for numbers', () => {
    expect(() => assertNoRawNumbers(base)).not.toThrow();
  });

  it('throws RawNumberLeakError when a section has a literal digit outside braces', () => {
    const dirty: DossierTextSections = { ...base, introduction: 'Installation de 3100 Wc.' };
    expect(() => assertNoRawNumbers(dirty)).toThrow(RawNumberLeakError);
  });

  it('allows a digit inside a placeholder name (e.g. {P_DC_W} itself is fine)', () => {
    const withDigitInPlaceholder: DossierTextSections = {
      ...base,
      solution: 'Puissance {P1_DC_W} et {P2_DC_W}.',
    };
    expect(() => assertNoRawNumbers(withDigitInPlaceholder)).not.toThrow();
  });

  it('identifies which section leaked, in the error message', () => {
    const dirty: DossierTextSections = { ...base, earthing: '3 piquets installés.' };
    try {
      assertNoRawNumbers(dirty);
      throw new Error('expected assertNoRawNumbers to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RawNumberLeakError);
      expect((error as Error).message).toContain('earthing');
    }
  });
});
