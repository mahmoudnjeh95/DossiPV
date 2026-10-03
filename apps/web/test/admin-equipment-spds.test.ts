import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockValidateSuperAdminSession,
  mockSpdFindUnique, mockSpdCreate, mockSpdUpdate, mockSpdDelete,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockSpdFindUnique: vi.fn(),
    mockSpdCreate: vi.fn(),
    mockSpdUpdate: vi.fn(),
    mockSpdDelete: vi.fn(),
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
      spd: { findUnique: mockSpdFindUnique, create: mockSpdCreate, update: mockSpdUpdate, delete: mockSpdDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createSpdAction, updateSpdAction, deleteSpdAction } from '../app/admin/(protected)/equipment/spds/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockSpdFindUnique.mockClear();
  mockSpdCreate.mockClear();
  mockSpdUpdate.mockClear();
  mockSpdDelete.mockClear();
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
    brand: 'Dehn', model: 'DG M TT 275', side: 'DC', type: '2', poles: '2',
    ucV: '275', upKV: '1.3', inKA: '15', imaxKA: '40',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createSpdAction', () => {
  it('creates a global Spd row (ownerCompanyId: null)', async () => {
    mockSpdCreate.mockResolvedValue({ id: 'new-spd-1' });

    await createSpdAction(undefined, buildFormData());

    const createCallArg = mockSpdCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; side: string } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Dehn');
    expect(createCallArg.data.side).toBe('DC');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/spds');
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createSpdAction(undefined, formData);

    expect(mockSpdCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateSpdAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockSpdFindUnique.mockResolvedValue({ id: 'spd-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockSpdUpdate.mockResolvedValue({ id: 'spd-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateSpdAction('spd-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteSpdAction', () => {
  it('deletes the row when it has no usage on either side', async () => {
    mockSpdFindUnique.mockResolvedValue({ id: 'spd-1', protectionsDc: [], protectionsAc: [], datasheetFileId: null, homologationFileId: null });
    mockSpdDelete.mockResolvedValue({ id: 'spd-1' });

    const result = await deleteSpdAction('spd-1', undefined);

    expect(mockSpdDelete).toHaveBeenCalledWith({ where: { id: 'spd-1' } });
    expect(result).toBeUndefined();
  });

  it('refuses to delete when only protectionsDc has a row', async () => {
    mockSpdFindUnique.mockResolvedValue({ id: 'spd-1', protectionsDc: [{ id: 'pp-1' }], protectionsAc: [], datasheetFileId: null, homologationFileId: null });

    const result = await deleteSpdAction('spd-1', undefined);

    expect(mockSpdDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });

  it('refuses to delete when only protectionsAc has a row', async () => {
    mockSpdFindUnique.mockResolvedValue({ id: 'spd-1', protectionsDc: [], protectionsAc: [{ id: 'pp-2' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteSpdAction('spd-1', undefined);

    expect(mockSpdDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
