import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), cachedDatasheet: vi.fn(), saveFile: vi.fn(), fileCreate: vi.fn() }));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});
vi.mock('../src/datasheet-cache', () => ({ cachedDatasheet: mocks.cachedDatasheet }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: mocks.saveFile }));
vi.mock('@dossipv/db', () => ({
  db: {
    file: { create: mocks.fileCreate },
    accessory: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    cable: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
  },
}));

import { assertStorageConfigured, importCurated, uploadDatasheet } from '../src/run-import';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cachedDatasheet.mockResolvedValue('/cache/x.pdf');
  mocks.saveFile.mockResolvedValue({ storageKey: 'k' });
  mocks.fileCreate.mockResolvedValue({ id: 'file-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('uploadDatasheet', () => {
  it('stores a real PDF', async () => {
    mocks.readFile.mockResolvedValue(Buffer.from('%PDF-1.7 body'));
    expect(await uploadDatasheet('https://x/a.pdf', 'M')).toBe('file-1');
  });

  it('rejects a download that is not a PDF and stores nothing', async () => {
    mocks.readFile.mockResolvedValue(Buffer.from('<!doctype html><html></html>'));
    await expect(uploadDatasheet('https://x/page', 'M')).rejects.toThrow("n'est pas un PDF");
    expect(mocks.saveFile).not.toHaveBeenCalled();
    expect(mocks.fileCreate).not.toHaveBeenCalled();
  });
});

describe('storage configuration', () => {
  it('assertStorageConfigured fails fast with a French message when FILE_STORAGE_ROOT is unset', () => {
    expect(() => assertStorageConfigured({})).toThrow("FILE_STORAGE_ROOT n'est pas défini");
    expect(() => assertStorageConfigured({ FILE_STORAGE_ROOT: '/data' })).not.toThrow();
  });

  it('a storage-config error propagates instead of being recorded as a download note', async () => {
    mocks.readFile.mockImplementation((path: string) => {
      const name = String(path).replace(/\\/g, '/').split('/').pop();
      if (name === 'accessories.json') return Promise.resolve(JSON.stringify([{ kind: 'CABLE_TRAY', brand: 'L', model: 'T', spec: null, source: 'https://x/t.pdf' }]));
      if (name === 'x.pdf') return Promise.resolve(Buffer.from('%PDF-1'));
      return Promise.resolve('[]');
    });
    mocks.saveFile.mockRejectedValue(new Error('FILE_STORAGE_ROOT is not set.'));
    await expect(importCurated(false, () => {})).rejects.toThrow('FILE_STORAGE_ROOT');
  });
});
