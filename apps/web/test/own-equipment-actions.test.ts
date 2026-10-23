import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockRevalidatePath: vi.fn(),
    mockValidateSession: vi.fn(),
    pvModuleFindFirst: vi.fn(),
    pvModuleCreate: vi.fn(),
    pvModuleDelete: vi.fn(),
    cableFindFirst: vi.fn(),
    cableUpdate: vi.fn(),
    cableDelete: vi.fn(),
    sectionDeleteMany: vi.fn(),
    sectionCreateMany: vi.fn(),
    libraryItemCreate: vi.fn(),
    fileCreate: vi.fn(),
    fileFindUnique: vi.fn(),
    fileDelete: vi.fn(),
    saveFile: vi.fn(),
    deleteFile: vi.fn(),
    validateUploadedFile: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  const client = {
    pvModule: { findFirst: m.pvModuleFindFirst, create: m.pvModuleCreate, delete: m.pvModuleDelete },
    cable: { findFirst: m.cableFindFirst, update: m.cableUpdate, delete: m.cableDelete },
    cableSection: { deleteMany: m.sectionDeleteMany, createMany: m.sectionCreateMany },
    libraryItem: { create: m.libraryItemCreate },
    file: { create: m.fileCreate, findUnique: m.fileFindUnique, delete: m.fileDelete },
  };
  return {
    ...actual,
    db: { ...actual.db, ...client, $transaction: (fn: (tx: typeof client) => Promise<unknown>): Promise<unknown> => fn(client) },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: m.saveFile, deleteFile: m.deleteFile, validateUploadedFile: m.validateUploadedFile };
});

import {
  createOwnEquipmentAction,
  updateOwnEquipmentAction,
  deleteOwnEquipmentAction,
} from '../app/(app)/library/own-equipment-actions';

const MODULE = {
  brand: 'LONGi', model: 'LR7-72HGD-620M', pmaxW: '620', vmpV: '46.5', impA: '13.33', vocV: '55.9', iscA: '13.92',
  tempCoeffVocPct: '-0.25', tempCoeffIscPct: '0.045', tempCoeffPmaxPct: '-0.28', irmA: '25', maxSystemVoltageV: '1500',
  lengthMm: '2278', widthMm: '1134', weightKg: '33.5',
};

const CABLE = {
  brand: 'Nexans', model: 'H1Z2Z2-K', usage: 'DC_SOLAR', conductor: 'Cuivre', insulation: 'XLPE',
  sections: JSON.stringify([{ sectionMm2: 4, izA: 55, izReferenceMethod: 'C' }, { sectionMm2: 6, izA: 70, izReferenceMethod: 'C' }]),
};

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [key, value] of Object.entries(values)) {
    f.set(key, value);
  }
  return f;
}

function pdf(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'token' });
  m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', fullName: 'Test' });
  m.validateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
  m.saveFile.mockImplementation((_buffer: Buffer, name: string) => Promise.resolve({ storageKey: `equipment/${name}` }));
  m.fileCreate.mockImplementation(({ data }: { data: { fileName: string } }) => Promise.resolve({ id: `file-${data.fileName}` }));
  m.fileFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, storageKey: `key-${where.id}` }));
  m.pvModuleCreate.mockResolvedValue({ id: 'module-new' });
});

describe('own equipment actions', () => {
  it('guards before anything', async () => {
    m.mockGet.mockReturnValue(undefined);
    await expect(createOwnEquipmentAction('PV_MODULE', undefined, form(MODULE))).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(updateOwnEquipmentAction('CABLE', 'cable-1', undefined, form(CABLE))).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(deleteOwnEquipmentAction('PV_MODULE', 'module-1')).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(m.pvModuleCreate).not.toHaveBeenCalled();
    expect(m.cableFindFirst).not.toHaveBeenCalled();
    expect(m.pvModuleFindFirst).not.toHaveBeenCalled();
  });

  it('creates a private module with its documents and puts it in the library at its price', async () => {
    const values = form({ ...MODULE, price: '310.5' });
    values.set('datasheet', pdf('fiche.pdf'));
    values.set('homologationDocument', pdf('anme.pdf'));

    await expect(createOwnEquipmentAction('PV_MODULE', undefined, values)).rejects.toThrow('NEXT_REDIRECT:/library');

    const created = m.pvModuleCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      ownerCompanyId: 'company-1',
      brand: 'LONGi',
      pmaxW: 620,
      datasheetFileId: 'file-fiche.pdf',
      homologationFileId: 'file-anme.pdf',
    });
    expect(m.libraryItemCreate).toHaveBeenCalledWith({
      data: { companyId: 'company-1', kind: 'PV_MODULE', pvModuleId: 'module-new', purchasePriceTnd: 310.5 },
    });
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/library');
  });

  it('refuses invalid characteristics before storing any file', async () => {
    const values = form({ ...MODULE, vocV: '' });
    values.set('datasheet', pdf('fiche.pdf'));

    const result = await createOwnEquipmentAction('PV_MODULE', undefined, values);

    expect(result).toEqual({ error: 'Tension Voc : valeur numérique obligatoire.' });
    expect(m.saveFile).not.toHaveBeenCalled();
    expect(m.pvModuleCreate).not.toHaveBeenCalled();
  });

  it('stores nothing when the second document is rejected', async () => {
    m.validateUploadedFile.mockReturnValueOnce({ valid: true, mimeType: 'pdf' }).mockReturnValueOnce({ valid: false, error: 'Type de fichier non autorisé.' });
    const values = form(MODULE);
    values.set('datasheet', pdf('fiche.pdf'));
    values.set('homologationDocument', pdf('anme.pdf'));

    const result = await createOwnEquipmentAction('PV_MODULE', undefined, values);

    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
    expect(m.saveFile).not.toHaveBeenCalled();
    expect(m.pvModuleCreate).not.toHaveBeenCalled();
  });

  it('refuses an unknown equipment type', async () => {
    const result = await createOwnEquipmentAction('ROCKET' as never, undefined, form(MODULE));
    expect(result).toEqual({ error: 'Type d’équipement invalide.' });
  });

  it("refuses to edit an item that is not the company's own", async () => {
    m.cableFindFirst.mockResolvedValue(null);

    const result = await updateOwnEquipmentAction('CABLE', 'cable-shared', undefined, form(CABLE));

    expect(result).toEqual({ error: 'Équipement introuvable dans votre matériel.' });
    expect(m.cableFindFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'cable-shared', ownerCompanyId: 'company-1' } });
    expect(m.cableUpdate).not.toHaveBeenCalled();
  });

  it('updates an own cable, replaces its sections and deletes the replaced datasheet', async () => {
    m.cableFindFirst.mockResolvedValue({ id: 'cable-1', datasheetFileId: 'old-sheet', homologationFileId: 'old-cert' });
    const values = form(CABLE);
    values.set('datasheet', pdf('new.pdf'));

    await expect(updateOwnEquipmentAction('CABLE', 'cable-1', undefined, values)).rejects.toThrow('NEXT_REDIRECT:/library');

    expect(m.cableUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'cable-1' },
      data: { brand: 'Nexans', usage: 'DC_SOLAR', datasheetFileId: 'file-new.pdf' },
    });
    expect(m.sectionDeleteMany).toHaveBeenCalledWith({ where: { cableId: 'cable-1' } });
    expect(m.sectionCreateMany).toHaveBeenCalledWith({
      data: [
        { cableId: 'cable-1', sectionMm2: 4, izA: 55, izReferenceMethod: 'C' },
        { cableId: 'cable-1', sectionMm2: 6, izA: 70, izReferenceMethod: 'C' },
      ],
    });
    expect(m.deleteFile).toHaveBeenCalledTimes(1);
    expect(m.deleteFile).toHaveBeenCalledWith('key-old-sheet');
    expect(m.fileDelete).toHaveBeenCalledWith({ where: { id: 'old-sheet' } });
  });

  it('refuses to delete an own item used by a project', async () => {
    m.pvModuleFindFirst
      .mockResolvedValueOnce({ id: 'module-1', datasheetFileId: null, homologationFileId: null })
      .mockResolvedValueOnce({ id: 'module-1', datasheetFileId: null, homologationFileId: null });

    const result = await deleteOwnEquipmentAction('PV_MODULE', 'module-1');

    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
    expect(m.pvModuleFindFirst.mock.calls[1]?.[0]).toMatchObject({ where: { id: 'module-1', OR: [{ arrayConfigs: { some: {} } }] } });
    expect(m.pvModuleDelete).not.toHaveBeenCalled();
  });

  it('deletes an unused own item and its documents', async () => {
    m.pvModuleFindFirst.mockResolvedValueOnce({ id: 'module-1', datasheetFileId: 'sheet-1', homologationFileId: null }).mockResolvedValueOnce(null);

    const result = await deleteOwnEquipmentAction('PV_MODULE', 'module-1');

    expect(result).toBeUndefined();
    expect(m.pvModuleDelete).toHaveBeenCalledWith({ where: { id: 'module-1' } });
    expect(m.deleteFile).toHaveBeenCalledWith('key-sheet-1');
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/library');
  });

  it("refuses to delete another company's item", async () => {
    m.pvModuleFindFirst.mockResolvedValue(null);

    const result = await deleteOwnEquipmentAction('PV_MODULE', 'module-x');

    expect(result).toEqual({ error: 'Équipement introuvable dans votre matériel.' });
    expect(m.pvModuleFindFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'module-x', ownerCompanyId: 'company-1' } });
    expect(m.pvModuleDelete).not.toHaveBeenCalled();
  });
});
