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
