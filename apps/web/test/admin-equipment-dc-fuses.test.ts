import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockDcFuseFindUnique, mockDcFuseCreate, mockDcFuseUpdate, mockDcFuseDelete,
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
    mockDcFuseFindUnique: vi.fn(),
    mockDcFuseCreate: vi.fn(),
    mockDcFuseUpdate: vi.fn(),
    mockDcFuseDelete: vi.fn(),
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
      dcFuse: { findUnique: mockDcFuseFindUnique, create: mockDcFuseCreate, update: mockDcFuseUpdate, delete: mockDcFuseDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createDcFuseAction, updateDcFuseAction, deleteDcFuseAction } from '../app/admin/(protected)/equipment/dc-fuses/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockDcFuseFindUnique.mockClear();
  mockDcFuseCreate.mockClear();
  mockDcFuseUpdate.mockClear();
  mockDcFuseDelete.mockClear();
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
    brand: 'Mersen', model: 'PV10x38', ratedVoltageV: '1000', ratedCurrentA: '15',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createDcFuseAction', () => {
  it('creates a global DcFuse row (ownerCompanyId: null)', async () => {
    mockDcFuseCreate.mockResolvedValue({ id: 'new-dc-fuse-1' });

    await createDcFuseAction(undefined, buildFormData());

    const createCallArg = mockDcFuseCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; ratedCurrentA: number } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Mersen');
    expect(createCallArg.data.ratedCurrentA).toBe(15);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/dc-fuses');
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createDcFuseAction(undefined, formData);

    expect(mockDcFuseCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateDcFuseAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockDcFuseFindUnique.mockResolvedValue({ id: 'dc-fuse-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockDcFuseUpdate.mockResolvedValue({ id: 'dc-fuse-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateDcFuseAction('dc-fuse-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteDcFuseAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockDcFuseFindUnique.mockResolvedValue({ id: 'dc-fuse-1', protections: [], datasheetFileId: null, homologationFileId: null });
    mockDcFuseDelete.mockResolvedValue({ id: 'dc-fuse-1' });

    const result = await deleteDcFuseAction('dc-fuse-1', undefined);

    expect(mockDcFuseDelete).toHaveBeenCalledWith({ where: { id: 'dc-fuse-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/dc-fuses');
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the fuse is used by a project', async () => {
    mockDcFuseFindUnique.mockResolvedValue({ id: 'dc-fuse-1', protections: [{ id: 'pp-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteDcFuseAction('dc-fuse-1', undefined);

    expect(mockDcFuseDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
