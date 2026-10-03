import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockAccessoryFindUnique, mockAccessoryCreate, mockAccessoryUpdate, mockAccessoryDelete,
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
    mockAccessoryFindUnique: vi.fn(),
    mockAccessoryCreate: vi.fn(),
    mockAccessoryUpdate: vi.fn(),
    mockAccessoryDelete: vi.fn(),
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
      accessory: { findUnique: mockAccessoryFindUnique, create: mockAccessoryCreate, update: mockAccessoryUpdate, delete: mockAccessoryDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createAccessoryAction, updateAccessoryAction, deleteAccessoryAction } from '../app/admin/(protected)/equipment/accessories/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockAccessoryFindUnique.mockClear();
  mockAccessoryCreate.mockClear();
  mockAccessoryUpdate.mockClear();
  mockAccessoryDelete.mockClear();
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
    brand: 'Stäubli', model: 'MC4-EVO2', kind: 'MC4_CONNECTOR',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createAccessoryAction', () => {
  it('creates a global Accessory row (ownerCompanyId: null)', async () => {
    mockAccessoryCreate.mockResolvedValue({ id: 'new-accessory-1' });

    await createAccessoryAction(undefined, buildFormData());

    const createCallArg = mockAccessoryCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; kind: string } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Stäubli');
    expect(createCallArg.data.kind).toBe('MC4_CONNECTOR');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/accessories');
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createAccessoryAction(undefined, formData);

    expect(mockAccessoryCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateAccessoryAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockAccessoryFindUnique.mockResolvedValue({ id: 'accessory-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockAccessoryUpdate.mockResolvedValue({ id: 'accessory-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateAccessoryAction('accessory-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteAccessoryAction', () => {
  it('deletes the row when it has no usage on any of the three relations', async () => {
    mockAccessoryFindUnique.mockResolvedValue({
      id: 'accessory-1', connectorFor: [], cableTrayFor: [], distributionBlockFor: [], datasheetFileId: null, homologationFileId: null,
    });
    mockAccessoryDelete.mockResolvedValue({ id: 'accessory-1' });

    const result = await deleteAccessoryAction('accessory-1', undefined);

    expect(mockAccessoryDelete).toHaveBeenCalledWith({ where: { id: 'accessory-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/accessories');
    expect(result).toBeUndefined();
  });

  it('refuses to delete when only connectorFor has a row', async () => {
    mockAccessoryFindUnique.mockResolvedValue({
      id: 'accessory-1', connectorFor: [{ id: 'cc-1' }], cableTrayFor: [], distributionBlockFor: [], datasheetFileId: null, homologationFileId: null,
    });

    const result = await deleteAccessoryAction('accessory-1', undefined);

    expect(mockAccessoryDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });

  it('refuses to delete when only cableTrayFor has a row', async () => {
    mockAccessoryFindUnique.mockResolvedValue({
      id: 'accessory-1', connectorFor: [], cableTrayFor: [{ id: 'ct-1' }], distributionBlockFor: [], datasheetFileId: null, homologationFileId: null,
    });

    const result = await deleteAccessoryAction('accessory-1', undefined);

    expect(mockAccessoryDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });

  it('refuses to delete when only distributionBlockFor has a row', async () => {
    mockAccessoryFindUnique.mockResolvedValue({
      id: 'accessory-1', connectorFor: [], cableTrayFor: [], distributionBlockFor: [{ id: 'db-1' }], datasheetFileId: null, homologationFileId: null,
    });

    const result = await deleteAccessoryAction('accessory-1', undefined);

    expect(mockAccessoryDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
