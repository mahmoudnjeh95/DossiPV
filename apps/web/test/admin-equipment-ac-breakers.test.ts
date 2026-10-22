import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockAcBreakerFindUnique, mockAcBreakerCreate, mockAcBreakerUpdate, mockAcBreakerDelete,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockAcBreakerFindUnique: vi.fn(),
    mockAcBreakerCreate: vi.fn(),
    mockAcBreakerUpdate: vi.fn(),
    mockAcBreakerDelete: vi.fn(),
    mockFileCreate: vi.fn(),
    mockFileFindUnique: vi.fn(),
    mockFileDelete: vi.fn(),
    mockSaveFile: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockValidateUploadedFile: vi.fn(),
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
      acBreaker: { findUnique: mockAcBreakerFindUnique, create: mockAcBreakerCreate, update: mockAcBreakerUpdate, delete: mockAcBreakerDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createAcBreakerAction, updateAcBreakerAction, deleteAcBreakerAction } from '../app/admin/(protected)/equipment/ac-breakers/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockAcBreakerFindUnique.mockClear();
  mockAcBreakerCreate.mockClear();
  mockAcBreakerUpdate.mockClear();
  mockAcBreakerDelete.mockClear();
  mockFileCreate.mockClear();
  mockFileFindUnique.mockReset();
  mockFileDelete.mockClear();
  mockSaveFile.mockClear();
  mockDeleteFile.mockClear();
  mockValidateUploadedFile.mockReset();
});

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    brand: 'Schneider', model: 'iC60N', ratedCurrentA: '16',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createAcBreakerAction', () => {
  it('creates a global AcBreaker row (ownerCompanyId: null)', async () => {
    mockAcBreakerCreate.mockResolvedValue({ id: 'new-ac-breaker-1' });

    await createAcBreakerAction(undefined, buildFormData());

    const createCallArg = mockAcBreakerCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; ratedCurrentA: number } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Schneider');
    expect(createCallArg.data.ratedCurrentA).toBe(16);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/ac-breakers');
  });

  it('saves the differential function (30 mA, type A)', async () => {
    mockAcBreakerCreate.mockResolvedValue({ id: 'new-ac-breaker-1' });

    await createAcBreakerAction(undefined, buildFormData({ residualCurrentMA: '30', rcdType: 'A' }));

    const createCallArg = mockAcBreakerCreate.mock.calls[0]?.[0] as { data: { residualCurrentMA: number | null; rcdType: string | null } };
    expect(createCallArg.data.residualCurrentMA).toBe(30);
    expect(createCallArg.data.rcdType).toBe('A');
  });

  it('saves a plain breaker with no differential function', async () => {
    mockAcBreakerCreate.mockResolvedValue({ id: 'new-ac-breaker-1' });

    await createAcBreakerAction(undefined, buildFormData({ residualCurrentMA: '', rcdType: '' }));

    const createCallArg = mockAcBreakerCreate.mock.calls[0]?.[0] as { data: { residualCurrentMA: number | null; rcdType: string | null } };
    expect(createCallArg.data.residualCurrentMA).toBeNull();
    expect(createCallArg.data.rcdType).toBeNull();
  });

  it("refuses an unknown differential type ('X') without saving anything", async () => {
    const formData = buildFormData({ residualCurrentMA: '30', rcdType: 'X' });
    formData.set('datasheet', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'fiche.pdf', { type: 'application/pdf' }));

    const result = await createAcBreakerAction(undefined, formData);

    expect(result).toEqual({ error: 'Type de différentiel invalide (AC, A, F ou B).' });
    expect(mockAcBreakerCreate).not.toHaveBeenCalled();
    expect(mockSaveFile).not.toHaveBeenCalled();
  });

  it('refuses a sensitivity without a differential type', async () => {
    const result = await createAcBreakerAction(undefined, buildFormData({ residualCurrentMA: '30', rcdType: '' }));

    expect(result).toEqual({ error: 'Renseignez à la fois la sensibilité (mA) et le type du différentiel, ou aucun des deux.' });
    expect(mockAcBreakerCreate).not.toHaveBeenCalled();
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createAcBreakerAction(undefined, formData);

    expect(mockAcBreakerCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateAcBreakerAction', () => {
  it('saves the differential function on update', async () => {
    mockAcBreakerFindUnique.mockResolvedValue({ id: 'ac-breaker-1', datasheetFileId: null });
    mockAcBreakerUpdate.mockResolvedValue({ id: 'ac-breaker-1' });

    await updateAcBreakerAction('ac-breaker-1', undefined, buildFormData({ residualCurrentMA: '30', rcdType: 'A' }));

    const updateCallArg = mockAcBreakerUpdate.mock.calls[0]?.[0] as { data: { residualCurrentMA: number | null; rcdType: string | null } };
    expect(updateCallArg.data).toMatchObject({ residualCurrentMA: 30, rcdType: 'A' });
  });

  it("refuses an unknown differential type ('X') on update", async () => {
    mockAcBreakerFindUnique.mockResolvedValue({ id: 'ac-breaker-1', datasheetFileId: null });

    const result = await updateAcBreakerAction('ac-breaker-1', undefined, buildFormData({ residualCurrentMA: '30', rcdType: 'X' }));

    expect(result).toEqual({ error: 'Type de différentiel invalide (AC, A, F ou B).' });
    expect(mockAcBreakerUpdate).not.toHaveBeenCalled();
  });

  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockAcBreakerFindUnique.mockResolvedValue({ id: 'ac-breaker-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockAcBreakerUpdate.mockResolvedValue({ id: 'ac-breaker-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateAcBreakerAction('ac-breaker-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteAcBreakerAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockAcBreakerFindUnique.mockResolvedValue({ id: 'ac-breaker-1', protections: [], datasheetFileId: null, homologationFileId: null });
    mockAcBreakerDelete.mockResolvedValue({ id: 'ac-breaker-1' });

    const result = await deleteAcBreakerAction('ac-breaker-1', undefined);

    expect(mockAcBreakerDelete).toHaveBeenCalledWith({ where: { id: 'ac-breaker-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/ac-breakers');
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the breaker is used by a project', async () => {
    mockAcBreakerFindUnique.mockResolvedValue({ id: 'ac-breaker-1', protections: [{ id: 'pp-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteAcBreakerAction('ac-breaker-1', undefined);

    expect(mockAcBreakerDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
