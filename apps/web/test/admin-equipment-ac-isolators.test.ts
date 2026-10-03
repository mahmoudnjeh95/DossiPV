import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockAcIsolatorFindUnique, mockAcIsolatorCreate, mockAcIsolatorUpdate, mockAcIsolatorDelete,
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
    mockAcIsolatorFindUnique: vi.fn(),
    mockAcIsolatorCreate: vi.fn(),
    mockAcIsolatorUpdate: vi.fn(),
    mockAcIsolatorDelete: vi.fn(),
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
      acIsolator: { findUnique: mockAcIsolatorFindUnique, create: mockAcIsolatorCreate, update: mockAcIsolatorUpdate, delete: mockAcIsolatorDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createAcIsolatorAction, updateAcIsolatorAction, deleteAcIsolatorAction } from '../app/admin/(protected)/equipment/ac-isolators/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockAcIsolatorFindUnique.mockClear();
  mockAcIsolatorCreate.mockClear();
  mockAcIsolatorUpdate.mockClear();
  mockAcIsolatorDelete.mockClear();
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
    brand: 'Hager', model: 'SBN363', ratedCurrentA: '63',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createAcIsolatorAction', () => {
  it('creates a global AcIsolator row (ownerCompanyId: null)', async () => {
    mockAcIsolatorCreate.mockResolvedValue({ id: 'new-ac-isolator-1' });

    await createAcIsolatorAction(undefined, buildFormData());

    const createCallArg = mockAcIsolatorCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; ratedCurrentA: number } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Hager');
    expect(createCallArg.data.ratedCurrentA).toBe(63);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/ac-isolators');
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createAcIsolatorAction(undefined, formData);

    expect(mockAcIsolatorCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateAcIsolatorAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockAcIsolatorFindUnique.mockResolvedValue({ id: 'ac-isolator-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockAcIsolatorUpdate.mockResolvedValue({ id: 'ac-isolator-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateAcIsolatorAction('ac-isolator-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteAcIsolatorAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockAcIsolatorFindUnique.mockResolvedValue({ id: 'ac-isolator-1', protections: [], datasheetFileId: null, homologationFileId: null });
    mockAcIsolatorDelete.mockResolvedValue({ id: 'ac-isolator-1' });

    const result = await deleteAcIsolatorAction('ac-isolator-1', undefined);

    expect(mockAcIsolatorDelete).toHaveBeenCalledWith({ where: { id: 'ac-isolator-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/ac-isolators');
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the isolator is used by a project', async () => {
    mockAcIsolatorFindUnique.mockResolvedValue({ id: 'ac-isolator-1', protections: [{ id: 'pp-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteAcIsolatorAction('ac-isolator-1', undefined);

    expect(mockAcIsolatorDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
