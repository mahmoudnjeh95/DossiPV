import { describe, it, expect } from 'vitest';
import { planCuratedImport } from '../src/plan-curated';

describe('planCuratedImport', () => {
  it('creates when no shared row exists', () => {
    expect(planCuratedImport([])).toBe('create');
  });
  it('skips when a shared row has import provenance', () => {
    expect(planCuratedImport([{ datasheetSourceUrl: null }, { datasheetSourceUrl: 'https://x.test/a.pdf' }])).toBe('skip');
  });
  it('creates alongside when only provenance-less rows exist', () => {
    expect(planCuratedImport([{ datasheetSourceUrl: null }])).toBe('create-alongside');
  });
});

import { pickPlanningRow } from '../src/plan-curated';

describe('pickPlanningRow', () => {
  it('returns no row and no conflict when nothing exists', () => {
    expect(pickPlanningRow([])).toEqual({ row: null, conflict: false });
  });
  it('returns the row that has provenance', () => {
    const withSource = { id: 'b', datasheetSourceUrl: 'https://x.test/a.pdf' };
    expect(pickPlanningRow([{ id: 'a', datasheetSourceUrl: null }, withSource])).toEqual({ row: withSource, conflict: false });
  });
  it('flags a conflict when only provenance-less rows exist', () => {
    expect(pickPlanningRow([{ id: 'a', datasheetSourceUrl: null }])).toEqual({ row: null, conflict: true });
  });
});
