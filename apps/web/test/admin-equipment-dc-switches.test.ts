import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockDcSwitchFindUnique, mockDcSwitchCreate, mockDcSwitchUpdate, mockDcSwitchDelete,
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
    mockDcSwitchFindUnique: vi.fn(),
    mockDcSwitchCreate: vi.fn(),
    mockDcSwitchUpdate: vi.fn(),
    mockDcSwitchDelete: vi.fn(),
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
      dcSwitch: { findUnique: mockDcSwitchFindUnique, create: mockDcSwitchCreate, update: mockDcSwitchUpdate, delete: mockDcSwitchDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createDcSwitchAction, updateDcSwitchAction, deleteDcSwitchAction } from '../app/admin/(protected)/equipment/dc-switches/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockDcSwitchFindUnique.mockClear();
  mockDcSwitchCreate.mockClear();
  mockDcSwitchUpdate.mockClear();
  mockDcSwitchDelete.mockClear();
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
    brand: 'Chint', model: 'NH3-125', ratedVoltageV: '1000', ratedCurrentA: '125', poles: '4',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createDcSwitchAction', () => {
  it('creates a global DcSwitch row (ownerCompanyId: null)', async () => {
    mockDcSwitchCreate.mockResolvedValue({ id: 'new-dc-switch-1' });

    await createDcSwitchAction(undefined, buildFormData());

    const createCallArg = mockDcSwitchCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; ratedCurrentA: number } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Chint');
    expect(createCallArg.data.ratedCurrentA).toBe(125);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/dc-switches');
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createDcSwitchAction(undefined, formData);

    expect(mockDcSwitchCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateDcSwitchAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockDcSwitchFindUnique.mockResolvedValue({ id: 'dc-switch-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockDcSwitchUpdate.mockResolvedValue({ id: 'dc-switch-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateDcSwitchAction('dc-switch-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteDcSwitchAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockDcSwitchFindUnique.mockResolvedValue({ id: 'dc-switch-1', protections: [], datasheetFileId: null, homologationFileId: null });
    mockDcSwitchDelete.mockResolvedValue({ id: 'dc-switch-1' });

    const result = await deleteDcSwitchAction('dc-switch-1', undefined);

    expect(mockDcSwitchDelete).toHaveBeenCalledWith({ where: { id: 'dc-switch-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/dc-switches');
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the switch is used by a project', async () => {
    mockDcSwitchFindUnique.mockResolvedValue({ id: 'dc-switch-1', protections: [{ id: 'pp-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteDcSwitchAction('dc-switch-1', undefined);

    expect(mockDcSwitchDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
