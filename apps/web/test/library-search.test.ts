import { describe, it, expect } from 'vitest';
import { foldText, parseLibraryQuery } from '../lib/library-search';
import { searchWhere } from '../app/(app)/library/library-data';

describe('parseLibraryQuery', () => {
  it('folds accents and case', () => {
    expect(foldText('Parafoudré ÉTÉ')).toBe('parafoudre ete');
  });

  it.each([
    ['onduleur', 'INVERTER'],
    ['Onduleurs', 'INVERTER'],
    ['inverter', 'INVERTER'],
    ['panneau', 'PV_MODULE'],
    ['modules', 'PV_MODULE'],
    ['parafoudre', 'SPD'],
    ['Parafoudres', 'SPD'],
    ['surge arrester', 'SPD'],
    ['câble', 'CABLE'],
  ])('reads « %s » as the %s type', (query, kind) => {
    expect(parseLibraryQuery(query)).toEqual({ text: '', kinds: [kind], watts: null });
  });

  it('keeps the brand words next to a type word', () => {
    expect(parseLibraryQuery('onduleur huawei')).toEqual({ text: 'huawei', kinds: ['INVERTER'], watts: null });
  });

  it('reads a power with its unit in watts', () => {
    expect(parseLibraryQuery('5 kW')).toEqual({ text: '', kinds: [], watts: 5000 });
    expect(parseLibraryQuery('onduleur 5,5kW').watts).toBe(5500);
    expect(parseLibraryQuery('550w')).toEqual({ text: '', kinds: [], watts: 550 });
    expect(parseLibraryQuery('jinko 550 Wc')).toEqual({ text: 'jinko', kinds: [], watts: 550 });
  });
});

describe('searchWhere', () => {
  it('has no condition for an empty search or type words only', () => {
    expect(searchWhere('', 'pacW')).toEqual({});
    expect(searchWhere('onduleur', 'pacW')).toEqual({});
  });

  it('matches a bare number as a power, in W and (inverters) in kW, and as text', () => {
    expect(searchWhere('5', 'pacW')).toEqual({
      OR: [
        { brand: { contains: '5', mode: 'insensitive' } },
        { model: { contains: '5', mode: 'insensitive' } },
        { pacW: 5 },
        { pacW: 5000 },
      ],
    });
  });

  it('matches « 5 kW » exactly on the power column, and nothing for a type without power', () => {
    expect(searchWhere('5 kW', 'pacW')).toEqual({ pacW: 5000 });
    expect(searchWhere('550 W', 'pmaxW')).toEqual({ pmaxW: 550 });
    expect(searchWhere('5 kW', null)).toEqual({ id: { in: [] } });
  });
});
