import { describe, expect, it } from 'vitest';
import { selectTestItems, type SharedItemRow } from '../src/purge-test-items';

const row = (overrides: Partial<SharedItemRow>): SharedItemRow => ({
  table: 'inverter', id: 'i1', brand: 'Sofar', model: 'X', datasheetSourceUrl: null, referencingProjectIds: [], ...overrides,
});

describe('selectTestItems', () => {
  it('keeps sourced items (imported or curated)', () => {
    expect(selectTestItems([row({ datasheetSourceUrl: 'https://x/y.pdf' })])).toEqual({ deletable: [], referenced: [] });
  });

  it('marks an unsourced unreferenced item deletable', () => {
    const item = row({});
    expect(selectTestItems([item])).toEqual({ deletable: [item], referenced: [] });
  });

  it('puts an unsourced referenced item in the referenced list only', () => {
    const item = row({ referencingProjectIds: ['p1'] });
    expect(selectTestItems([item])).toEqual({ deletable: [], referenced: [item] });
  });
});
