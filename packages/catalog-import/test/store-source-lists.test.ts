/* eslint-disable @typescript-eslint/explicit-function-return-type -- inline test doubles */
import { describe, expect, it, vi } from 'vitest';
import { runStoreSourceLists } from '../src/store-source-lists';
import { SOURCE_LISTS } from '../src/sources';

const PDF = (n: number) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(n)]);

function fakeDb() {
  let fileCount = 0;
  return {
    file: { create: vi.fn().mockImplementation(() => Promise.resolve({ id: `file-${(fileCount += 1)}` })) },
    catalogSourceDocument: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

function stubs() {
  const download = vi.fn().mockImplementation((url: string) => Promise.resolve(url === SOURCE_LISTS.stegInverters ? PDF(100) : PDF(50)));
  const save = vi.fn().mockImplementation((_buffer: Buffer, name: string) => Promise.resolve({ storageKey: `catalog/${name}` }));
  return { download, save };
}

describe('runStoreSourceLists', () => {
  it('apply upserts one document per kind', async () => {
    const db = fakeDb();
    const { download, save } = stubs();

    await runStoreSourceLists(db, { apply: true, log: () => {}, download, save });

    expect(download).toHaveBeenCalledWith(SOURCE_LISTS.stegInverters);
    expect(download).toHaveBeenCalledWith(SOURCE_LISTS.anmePanels);
    expect(save).toHaveBeenCalledTimes(2);
    expect(db.file.create).toHaveBeenCalledWith({ data: { fileName: 'liste-steg-onduleurs.pdf', mimeType: 'pdf', storageKey: 'catalog/liste-steg-onduleurs.pdf' } });
    const upserts = db.catalogSourceDocument.upsert.mock.calls.map((call) => call[0] as { where: { kind: string }; create: Record<string, unknown>; update: Record<string, unknown> });
    expect(upserts.map((u) => u.where.kind)).toEqual(['STEG_INVERTER_LIST', 'ANME_PANEL_LIST']);
    expect(upserts[0]!.create).toMatchObject({ kind: 'STEG_INVERTER_LIST', fileId: 'file-1', sourceUrl: SOURCE_LISTS.stegInverters });
    expect(upserts[0]!.update).toMatchObject({ fileId: 'file-1', sourceUrl: SOURCE_LISTS.stegInverters });
    expect(upserts[0]!.update.fetchedAt).toBeInstanceOf(Date);
    expect(upserts[1]!.create).toMatchObject({ kind: 'ANME_PANEL_LIST', fileId: 'file-2', sourceUrl: SOURCE_LISTS.anmePanels });
  });

  it('dry run prints the URLs and byte sizes and stores nothing', async () => {
    const db = fakeDb();
    const { download, save } = stubs();
    const log = vi.fn();

    await runStoreSourceLists(db, { apply: false, log, download, save });

    expect(log).toHaveBeenCalledWith(`STEG_INVERTER_LIST : ${SOURCE_LISTS.stegInverters} — 109 octets`);
    expect(log).toHaveBeenCalledWith(`ANME_PANEL_LIST : ${SOURCE_LISTS.anmePanels} — 59 octets`);
    expect(save).not.toHaveBeenCalled();
    expect(db.file.create).not.toHaveBeenCalled();
    expect(db.catalogSourceDocument.upsert).not.toHaveBeenCalled();
  });

  it('refuses a download that is not a PDF', async () => {
    const db = fakeDb();
    const { save } = stubs();
    const download = vi.fn().mockResolvedValue(Buffer.from('<html>maintenance</html>'));

    const log = vi.fn();

    await expect(runStoreSourceLists(db as never, { apply: true, log, download, save })).rejects.toThrow('Liste(s) non téléchargée(s) : STEG_INVERTER_LIST, ANME_PANEL_LIST.');
    expect(log).toHaveBeenCalledWith(`  cause : Le fichier téléchargé n'est pas un PDF : ${SOURCE_LISTS.stegInverters}`);
    expect(db.catalogSourceDocument.upsert).not.toHaveBeenCalled();
  });

  it('still stores the ANME list when the STEG site is down, then reports the failure', async () => {
    const db = fakeDb();
    const { save } = stubs();
    const download = vi.fn().mockImplementation((url: string) => (url === SOURCE_LISTS.stegInverters ? Promise.reject(new Error('fetch failed')) : Promise.resolve(PDF(50))));
    const log = vi.fn();

    await expect(runStoreSourceLists(db as never, { apply: true, log, download, save })).rejects.toThrow('Liste(s) non téléchargée(s) : STEG_INVERTER_LIST.');
    expect(log).toHaveBeenCalledWith(`liste non téléchargée : ${SOURCE_LISTS.stegInverters}`);
    expect(db.catalogSourceDocument.upsert).toHaveBeenCalledTimes(1);
    expect((db.catalogSourceDocument.upsert.mock.calls[0]![0] as { where: { kind: string } }).where.kind).toBe('ANME_PANEL_LIST');
  });
});
