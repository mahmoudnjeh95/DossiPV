import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockCableFindUnique, mockCableCreate, mockCableUpdate, mockCableDelete,
  mockCableSectionDeleteMany, mockCableSectionCreateMany,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
  mockTransaction,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockCableFindUnique: vi.fn(),
    mockCableCreate: vi.fn(),
    mockCableUpdate: vi.fn(),
    mockCableDelete: vi.fn(),
    mockCableSectionDeleteMany: vi.fn(),
    mockCableSectionCreateMany: vi.fn(),
    mockFileCreate: vi.fn(),
    mockFileFindUnique: vi.fn(),
    mockFileDelete: vi.fn(),
    mockSaveFile: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockValidateUploadedFile: vi.fn(),
    mockTransaction: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSuperAdminSession: mockValidateSuperAdminSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      cable: { findUnique: mockCableFindUnique, create: mockCableCreate, update: mockCableUpdate, delete: mockCableDelete },
      cableSection: { deleteMany: mockCableSectionDeleteMany, createMany: mockCableSectionCreateMany },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
      $transaction: mockTransaction,
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createCableAction, updateCableAction, deleteCableAction } from '../app/admin/(protected)/equipment/cables/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockCableFindUnique.mockClear();
  mockCableCreate.mockClear();
  mockCableUpdate.mockClear();
  mockCableDelete.mockClear();
  mockCableSectionDeleteMany.mockClear();
  mockCableSectionCreateMany.mockClear();
  mockFileCreate.mockClear();
  mockFileFindUnique.mockReset();
  mockFileDelete.mockClear();
  mockSaveFile.mockClear();
  mockDeleteFile.mockClear();
  mockValidateUploadedFile.mockReset();
  mockTransaction.mockReset();
  mockTransaction.mockResolvedValue(undefined);
});

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    brand: 'Nexans', model: 'H1Z2Z2-K', usage: 'DC_SOLAR', conductor: 'Cuivre', insulation: 'XLPE',
    sections: JSON.stringify([{ sectionMm2: 6, izA: 55, izReferenceMethod: 'E' }]),
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createCableAction', () => {
  it('creates a global Cable row (ownerCompanyId: null) with at least one section', async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ cable: { create: mockCableCreate }, cableSection: { createMany: mockCableSectionCreateMany } });
    });
    mockCableCreate.mockResolvedValue({ id: 'new-cable-1' });

    await createCableAction(undefined, buildFormData());

    const createCallArg = mockCableCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; usage: string } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Nexans');
    expect(createCallArg.data.usage).toBe('DC_SOLAR');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/cables');
  });

  it('rejects the action with a French error when no sections are provided', async () => {
    const formData = buildFormData({ sections: JSON.stringify([]) });

    const result = await createCableAction(undefined, formData);

    expect(mockCableCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Au moins une section de câble est requise.' });
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createCableAction(undefined, formData);

    expect(mockCableCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateCableAction', () => {
  it('replaces all sections (delete then recreate) inside the transaction', async () => {
    mockCableFindUnique.mockResolvedValue({ id: 'cable-1', datasheetFileId: null });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        cable: { update: mockCableUpdate },
        cableSection: { deleteMany: mockCableSectionDeleteMany, createMany: mockCableSectionCreateMany },
      });
    });
    mockCableUpdate.mockResolvedValue({ id: 'cable-1' });

    await updateCableAction('cable-1', undefined, buildFormData());

    expect(mockCableSectionDeleteMany).toHaveBeenCalledWith({ where: { cableId: 'cable-1' } });
    expect(mockCableSectionCreateMany).toHaveBeenCalled();
  });
});

describe('deleteCableAction', () => {
  it('deletes the row when it has no usage on either relation', async () => {
    mockCableFindUnique.mockResolvedValue({ id: 'cable-1', cableRuns: [], earthingCableFor: [], datasheetFileId: null, homologationFileId: null });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ cableSection: { deleteMany: mockCableSectionDeleteMany }, cable: { delete: mockCableDelete } });
    });
    mockCableDelete.mockResolvedValue({ id: 'cable-1' });

    const result = await deleteCableAction('cable-1', undefined);

    expect(mockCableSectionDeleteMany).toHaveBeenCalledWith({ where: { cableId: 'cable-1' } });
    expect(mockCableDelete).toHaveBeenCalledWith({ where: { id: 'cable-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/cables');
    expect(result).toBeUndefined();
  });

  it('refuses to delete when only cableRuns has a row', async () => {
    mockCableFindUnique.mockResolvedValue({ id: 'cable-1', cableRuns: [{ id: 'run-1' }], earthingCableFor: [], datasheetFileId: null, homologationFileId: null });

    const result = await deleteCableAction('cable-1', undefined);

    expect(mockCableDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });

  it('refuses to delete when only earthingCableFor has a row', async () => {
    mockCableFindUnique.mockResolvedValue({ id: 'cable-1', cableRuns: [], earthingCableFor: [{ id: 'earth-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteCableAction('cable-1', undefined);

    expect(mockCableDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
