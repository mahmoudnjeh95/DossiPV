/* eslint-disable @typescript-eslint/explicit-function-return-type -- inline test doubles */
import { describe, expect, it, vi } from 'vitest';
import { describeDatabase, runPurge, selectTestItems, type SharedItemRow } from '../src/purge-test-items';

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

describe('runPurge', () => {
  function fakeDb() {
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    const delegate = (name: string, rows: Record<string, unknown>[] = []) => {
      calls[name] = vi.fn().mockResolvedValue({ count: 1 });
      return { findMany: vi.fn().mockResolvedValue(rows), deleteMany: calls[name] };
    };
    const base = { brand: 'Generic', datasheetSourceUrl: null, libraryItems: [] };
    const tx = {
      cableSection: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      cable: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      spd: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const db = {
      cable: { findMany: vi.fn().mockResolvedValue([{ ...base, id: 'c1', model: 'C', cableRuns: [], earthingCableFor: [] }]), deleteMany: vi.fn() },
      spd: {
        findMany: vi.fn().mockResolvedValue([
          { ...base, id: 's1', model: 'S1', protectionsDc: [{ projectId: 'p1' }], protectionsAc: [] },
          { ...base, id: 's2', model: 'S2', protectionsDc: [], protectionsAc: [] },
        ]),
        deleteMany: vi.fn(),
      },
      pvModule: delegate('x1'), inverter: delegate('x2'), dcSwitch: delegate('x3'), dcFuse: delegate('x4'),
      acBreaker: delegate('x5'), acIsolator: delegate('x6'), accessory: delegate('x7'),
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };
    return { db, tx };
  }
  const run = (db: unknown, apply: boolean) => runPurge(db as never, { apply, log: () => {} });

  it('dry run deletes nothing', async () => {
    const { db, tx } = fakeDb();
    const result = await run(db, false);
    expect(result).toEqual({ deleted: 0, referenced: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.cable.deleteMany).not.toHaveBeenCalled();
    expect(db.spd.deleteMany).not.toHaveBeenCalled();
    expect(tx.cable.deleteMany).not.toHaveBeenCalled();
    expect(tx.cableSection.deleteMany).not.toHaveBeenCalled();
  });

  it('apply deletes only the deletable ids', async () => {
    const { db, tx } = fakeDb();
    const result = await run(db, true);
    expect(result).toEqual({ deleted: 2, referenced: 1 });
    expect(tx.spd.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.spd.deleteMany).toHaveBeenCalledWith({ where: { id: 's2' } });
    expect(tx.cable.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('apply deletes cable sections before the cable, inside the transaction', async () => {
    const { db, tx } = fakeDb();
    await run(db, true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.cableSection.deleteMany).toHaveBeenCalledWith({ where: { cableId: 'c1' } });
    expect(tx.cableSection.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.cable.deleteMany.mock.invocationCallOrder[0]!);
  });
});

describe('describeDatabase', () => {
  it('shows host:port/database without the password', () => {
    const text = describeDatabase('postgresql://user:secret@localhost:5432/dossipv_dev');
    expect(text).toBe('localhost:5432/dossipv_dev');
    expect(text).not.toContain('secret');
  });
});
