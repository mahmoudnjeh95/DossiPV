import { describe, expect, it } from 'vitest';
import { TUNISIAN_GOVERNORATES, findGovernorate } from '../src';

describe('governorates', () => {
  it('lists the 24 governorates with plausible coordinates', () => {
    expect(TUNISIAN_GOVERNORATES).toHaveLength(24);
    for (const g of TUNISIAN_GOVERNORATES) {
      expect(g.lat).toBeGreaterThanOrEqual(30.2);
      expect(g.lat).toBeLessThanOrEqual(37.6);
      expect(g.lon).toBeGreaterThanOrEqual(7.5);
      expect(g.lon).toBeLessThanOrEqual(11.7);
    }
  });

  it('finds a governorate regardless of case and accents', () => {
    const gafsa = findGovernorate('GAFSA');
    expect(gafsa?.capital).toBe('Gafsa');
    expect(gafsa?.lat).toBeCloseTo(34.42, 1);
    expect(gafsa?.lon).toBeCloseTo(8.78, 1);
    expect(findGovernorate('Médenine')).not.toBeNull();
    expect(findGovernorate('medenine')).not.toBeNull();
    expect(findGovernorate('Paris')).toBeNull();
    expect(findGovernorate(null)).toBeNull();
  });
});
