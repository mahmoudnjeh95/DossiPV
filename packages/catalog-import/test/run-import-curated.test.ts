/* eslint-disable @typescript-eslint/explicit-function-return-type -- inline test doubles */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  spdFindMany: vi.fn(),
  spdCreate: vi.fn(),
  accessoryFindMany: vi.fn(),
  accessoryCreate: vi.fn(),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});
vi.mock('@dossipv/file-storage', () => ({ saveFile: vi.fn() }));
vi.mock('@dossipv/db', () => ({
  db: {
    cable: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    spd: { findMany: mocks.spdFindMany, create: mocks.spdCreate },
    accessory: { findMany: mocks.accessoryFindMany, create: mocks.accessoryCreate },
  },
}));

import { importCurated } from '../src/run-import';

const spd = (model: string) => ({ kind: 'SPD', brand: 'ABB', model, side: 'DC', type: 2, poles: 2, ucV: 600, upKV: 2.8, inKA: 20, imaxKA: 40, iscpvKA: 10, source: `https://x/${model}.pdf` });
const accessory = (model: string) => ({ kind: 'CABLE_TRAY', brand: 'Legrand', model, spec: null, source: `https://x/${model}.pdf` });

const dataOf = (fn: { mock: { calls: unknown[][] } }): Record<string, unknown> => (fn.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFile.mockImplementation((path: string) => {
    const name = String(path).replace(/\\/g, '/').split('/').pop();
    if (name === 'protections.json') return Promise.resolve(JSON.stringify([spd('NEW-SPD'), spd('OLD-SPD')]));
    if (name === 'accessories.json') return Promise.resolve(JSON.stringify([accessory('NEW-TRAY'), accessory('OLD-TRAY')]));
    return Promise.resolve('[]');
  });
  mocks.spdFindMany.mockImplementation(({ where }: { where: { model: string } }) =>
    Promise.resolve(where.model === 'OLD-SPD' ? [{ datasheetSourceUrl: 'https://x/OLD-SPD.pdf' }] : []));
  mocks.accessoryFindMany.mockImplementation(({ where }: { where: { model: string } }) =>
    Promise.resolve(where.model === 'OLD-TRAY' ? [{ datasheetSourceUrl: 'https://x/OLD-TRAY.pdf' }] : []));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('importCurated — datasheets', () => {
  it('creates a new SPD and a new accessory with their datasheet file and skips existing ones', async () => {
    const datasheet = vi.fn().mockResolvedValue({ datasheetFileId: 'file-1', notes: [] });
    await importCurated(false, () => {}, datasheet);

    expect(datasheet).toHaveBeenCalledTimes(2);
    expect(datasheet).toHaveBeenCalledWith('https://x/NEW-SPD.pdf', 'NEW-SPD');
    expect(datasheet).toHaveBeenCalledWith('https://x/NEW-TRAY.pdf', 'NEW-TRAY');
    expect(mocks.spdCreate).toHaveBeenCalledTimes(1);
    expect(dataOf(mocks.spdCreate)).toMatchObject({ model: 'NEW-SPD', datasheetFileId: 'file-1', datasheetSourceUrl: 'https://x/NEW-SPD.pdf', catalogStatus: 'DRAFT' });
    expect(mocks.accessoryCreate).toHaveBeenCalledTimes(1);
    expect(dataOf(mocks.accessoryCreate)).toMatchObject({ kind: 'CABLE_TRAY', model: 'NEW-TRAY', datasheetFileId: 'file-1', ownerCompanyId: null });
  });

  it('keeps the failure note when the datasheet cannot be fetched', async () => {
    const datasheet = vi.fn().mockResolvedValue({ datasheetFileId: null, notes: ['Fiche technique non téléchargée : u'] });
    await importCurated(false, () => {}, datasheet);
    expect(dataOf(mocks.accessoryCreate).datasheetFileId).toBeNull();
    expect(dataOf(mocks.accessoryCreate).importNotes).toContain('Fiche technique non téléchargée');
  });

  it('downloads nothing in a dry run', async () => {
    const datasheet = vi.fn();
    await importCurated(true, () => {}, datasheet);
    expect(datasheet).not.toHaveBeenCalled();
    expect(mocks.spdCreate).not.toHaveBeenCalled();
  });
});
