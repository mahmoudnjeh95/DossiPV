/* eslint-disable @typescript-eslint/explicit-function-return-type -- inline test doubles */
import { describe, expect, it, vi } from 'vitest';
import { runAttachCuratedDatasheets } from '../src/attach-curated-datasheets';

function fakeDb(spdRows: Record<string, unknown>[]) {
  const spdUpdate = vi.fn().mockResolvedValue({});
  const empty = () => ({ findMany: vi.fn().mockResolvedValue([]), update: vi.fn() });
  const spdFindMany = vi.fn().mockImplementation(({ where }: { where: { datasheetFileId: null } }) =>
    Promise.resolve(spdRows.filter((r) => r.datasheetFileId === undefined && where.datasheetFileId === null)));
  const db = {
    spd: { findMany: spdFindMany, update: spdUpdate },
    dcSwitch: empty(), dcFuse: empty(), acBreaker: empty(), acIsolator: empty(), cable: empty(), accessory: empty(),
  };
  return { db, spdUpdate, spdFindMany };
}

const row = (id: string, url: string) => ({ id, brand: 'ABB', model: `M-${id}`, datasheetSourceUrl: url });
const run = (db: unknown, apply: boolean, fetchPdf: (u: string, m: string) => Promise<string>, log: (l: string) => void = () => {}) =>
  runAttachCuratedDatasheets(db as never, { apply, log, fetchPdf });

describe('runAttachCuratedDatasheets', () => {
  it('dry run changes nothing', async () => {
    const { db, spdUpdate } = fakeDb([row('a', 'https://x/a.pdf')]);
    const fetchPdf = vi.fn();
    expect(await run(db, false, fetchPdf)).toEqual({ attached: 0, failed: 0 });
    expect(fetchPdf).not.toHaveBeenCalled();
    expect(spdUpdate).not.toHaveBeenCalled();
  });

  it('apply attaches the file id', async () => {
    const { db, spdUpdate } = fakeDb([row('a', 'https://x/a.pdf')]);
    const fetchPdf = vi.fn().mockResolvedValue('file-1');
    expect(await run(db, true, fetchPdf)).toEqual({ attached: 1, failed: 0 });
    expect(fetchPdf).toHaveBeenCalledWith('https://x/a.pdf', 'M-a');
    expect(spdUpdate).toHaveBeenCalledWith({ where: { id: 'a' }, data: { datasheetFileId: 'file-1' } });
  });

  it('a download failure is logged and skipped', async () => {
    const { db, spdUpdate } = fakeDb([row('a', 'https://x/bad.pdf'), row('b', 'https://x/b.pdf')]);
    const fetchPdf = vi.fn().mockImplementation((url: string) => (url.includes('bad') ? Promise.reject(new Error('404')) : Promise.resolve('file-b')));
    const log = vi.fn();
    expect(await run(db, true, fetchPdf, log)).toEqual({ attached: 1, failed: 1 });
    expect(log).toHaveBeenCalledWith('fiche non téléchargée : https://x/bad.pdf');
    expect(spdUpdate).toHaveBeenCalledTimes(1);
    expect(spdUpdate).toHaveBeenCalledWith({ where: { id: 'b' }, data: { datasheetFileId: 'file-b' } });
  });

  it('rows that already have a file are ignored', async () => {
    const { db, spdFindMany } = fakeDb([{ ...row('a', 'https://x/a.pdf'), datasheetFileId: 'existing' }]);
    const fetchPdf = vi.fn();
    expect(await run(db, true, fetchPdf)).toEqual({ attached: 0, failed: 0 });
    expect(fetchPdf).not.toHaveBeenCalled();
    expect((spdFindMany.mock.calls[0]![0] as { where: unknown }).where).toMatchObject({ ownerCompanyId: null, datasheetFileId: null, datasheetSourceUrl: { not: null } });
  });
});
