import { describe, it, expect } from 'vitest';
import { planImport } from '../src/plan-import';

const required = ['pmaxW', 'vocV'] as const;

describe('planImport', () => {
  it('creates a draft for a new item', () => {
    expect(planImport(null, { errors: [], values: { pmaxW: 585, vocV: 53.2 } }, required)).toEqual({ kind: 'create' });
  });

  it('skips a record missing a value the database requires', () => {
    expect(planImport(null, { errors: ['vocV manquant sur la fiche.'], values: { pmaxW: 585, vocV: null } }, required)).toEqual({
      kind: 'skip', reason: 'vocV manquant',
    });
  });

  it('overwrites an existing draft', () => {
    const existing = { id: 'a', catalogStatus: 'DRAFT' as const, values: { pmaxW: 580, vocV: 53.2 } };
    expect(planImport(existing, { errors: [], values: { pmaxW: 585, vocV: 53.2 } }, required)).toEqual({ kind: 'update-draft' });
  });

  it('never changes the values of a published item, only reports the differences', () => {
    const existing = { id: 'a', catalogStatus: 'PUBLISHED' as const, values: { pmaxW: 580, vocV: 53.2 } };
    expect(planImport(existing, { errors: [], values: { pmaxW: 585, vocV: 53.2 } }, required)).toEqual({
      kind: 'refresh-published', differences: ['pmaxW : 580 → 585'],
    });
  });
});
