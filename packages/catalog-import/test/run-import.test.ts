import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  cachedDatasheet: vi.fn(),
  saveFile: vi.fn(),
  fileCreate: vi.fn(),
  pvModuleCreate: vi.fn(),
  inverterCreate: vi.fn(),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});
vi.mock('../src/datasheet-cache', () => ({ cachedDatasheet: mocks.cachedDatasheet }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: mocks.saveFile }));
vi.mock('@dossipv/db', () => ({
  db: {
    pvModule: { findMany: vi.fn().mockResolvedValue([]), create: mocks.pvModuleCreate },
    inverter: { findMany: vi.fn().mockResolvedValue([]), create: mocks.inverterCreate },
    file: { create: mocks.fileCreate },
    $disconnect: vi.fn(),
  },
}));

import { runImport } from '../src/run-import';

const BROKEN_URL = 'https://example.test/broken.pdf';
const GOOD_URL = 'https://example.test/good.pdf';

const moduleEntry = (model: string, datasheetSourceUrl: string): Record<string, unknown> => ({
  brand: 'TestBrand', model, datasheetSourceUrl, homologationReference: 'REF-1', homologationValidTo: '2027-01-01', errors: [], warnings: [],
  pmaxW: 500, vmpV: 40, impA: 12, vocV: 48, iscA: 13, tempCoeffVocPct: -0.25, tempCoeffIscPct: 0.05, tempCoeffPmaxPct: -0.3,
  irmA: 25, maxSystemVoltageV: 1500, lengthMm: 2000, widthMm: 1100, weightKg: 25,
});
const inverterEntry = {
  brand: 'TestBrand', model: 'INV-1', datasheetSourceUrl: BROKEN_URL, homologationValidTo: '2027-01-01', errors: [], warnings: [],
  phases: 1, pacW: 5000, sacVA: 5000, vdcMaxV: 600, mpptMinV: 80, mpptMaxV: 550, startUpV: 100, mpptCount: 2, inputsPerMppt: 1,
  idcMaxPerMpptA: 16, iscMaxPerMpptA: 20, vacNomV: 230, iacMaxA: 25, integratedDcSwitch: true,
};

beforeEach(() => {
  process.env.FILE_STORAGE_ROOT = '/tmp/test-storage';
  vi.clearAllMocks();
  mocks.readFile.mockImplementation((path: string) => {
    const name = String(path).replace(/\\/g, '/').split('/').pop();
    if (name === 'pv-modules.json') return Promise.resolve(JSON.stringify([moduleEntry('BROKEN-1', BROKEN_URL), moduleEntry('GOOD-1', GOOD_URL)]));
    if (name === 'inverters.json') return Promise.resolve(JSON.stringify([inverterEntry]));
    if (name === 'cables.json' || name === 'protections.json' || name === 'accessories.json') return Promise.resolve('[]');
    return Promise.resolve(Buffer.from('%PDF-datasheet'));
  });
  mocks.cachedDatasheet.mockImplementation((url: string) => (url === BROKEN_URL ? Promise.reject(new Error('Téléchargement impossible (404)')) : Promise.resolve('/cache/good.pdf')));
  mocks.saveFile.mockResolvedValue({ storageKey: 'catalog/good.pdf' });
  mocks.fileCreate.mockResolvedValue({ id: 'file-good' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('runImport — datasheet download failures', () => {
  it('imports an item whose datasheet cannot be downloaded without a datasheet, notes the url, and keeps going', async () => {
    await runImport({ dryRun: false });

    const created = mocks.pvModuleCreate.mock.calls.map(([arg]) => (arg as { data: { model: string; datasheetFileId: string | null; importNotes: string | null } }).data);
    expect(created.map((d) => d.model)).toEqual(['BROKEN-1', 'GOOD-1']);
    expect(created[0]!.datasheetFileId).toBeNull();
    expect(created[0]!.importNotes).toContain(`Fiche technique non téléchargée : ${BROKEN_URL}`);
    expect(created[1]!.datasheetFileId).toBe('file-good');
    expect(created[1]!.importNotes).toBeNull();

    const inverter = (mocks.inverterCreate.mock.calls[0]![0] as { data: { datasheetFileId: string | null; importNotes: string | null } }).data;
    expect(inverter.datasheetFileId).toBeNull();
    expect(inverter.importNotes).toContain(`Fiche technique non téléchargée : ${BROKEN_URL}`);
  });

  it('treats a failed save like a failed download', async () => {
    mocks.saveFile.mockRejectedValue(new Error('EACCES'));

    await runImport({ dryRun: false });

    const created = mocks.pvModuleCreate.mock.calls.map(([arg]) => (arg as { data: { datasheetFileId: string | null; importNotes: string | null } }).data);
    expect(created).toHaveLength(2);
    expect(created[1]!.datasheetFileId).toBeNull();
    expect(created[1]!.importNotes).toContain(`Fiche technique non téléchargée : ${GOOD_URL}`);
  });
});
