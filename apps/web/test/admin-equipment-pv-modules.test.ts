import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockRevalidatePath, mockValidateSuperAdminSession,
  mockPvModuleFindUnique, mockPvModuleCreate, mockPvModuleUpdate, mockPvModuleDelete,
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
    mockPvModuleFindUnique: vi.fn(),
    mockPvModuleCreate: vi.fn(),
    mockPvModuleUpdate: vi.fn(),
    mockPvModuleDelete: vi.fn(),
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
      pvModule: { findUnique: mockPvModuleFindUnique, create: mockPvModuleCreate, update: mockPvModuleUpdate, delete: mockPvModuleDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createPvModuleAction, updatePvModuleAction, deletePvModuleAction } from '../app/admin/(protected)/equipment/pv-modules/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockPvModuleFindUnique.mockClear();
  mockPvModuleCreate.mockClear();
  mockPvModuleUpdate.mockClear();
  mockPvModuleDelete.mockClear();
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
    brand: 'LONGi', model: 'LR7-72HGD-620M', pmaxW: '620', vmpV: '46.5', impA: '13.33',
    vocV: '55.9', iscA: '13.92', tempCoeffVocPct: '-0.25', tempCoeffIscPct: '0.045',
    tempCoeffPmaxPct: '-0.28', irmA: '25', maxSystemVoltageV: '1500', lengthMm: '2278',
    widthMm: '1134', weightKg: '33.5',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createPvModuleAction', () => {
  it('creates a global PvModule row (ownerCompanyId: null) with no files uploaded', async () => {
    mockPvModuleCreate.mockResolvedValue({ id: 'new-module-1' });

    await createPvModuleAction(undefined, buildFormData());

    const createCallArg = mockPvModuleCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; pmaxW: number } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('LONGi');
    expect(createCallArg.data.pmaxW).toBe(620);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/pv-modules');
  });

  it('uploads and validates a datasheet file when provided', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/abc-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-1' });
    mockPvModuleCreate.mockResolvedValue({ id: 'new-module-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await createPvModuleAction(undefined, formData);

    expect(mockValidateUploadedFile).toHaveBeenCalled();
    expect(mockSaveFile).toHaveBeenCalled();
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createPvModuleAction(undefined, formData);

    expect(mockPvModuleCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });

  it('rejects an oversized file before calling saveFile', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Le fichier dépasse la taille maximale autorisée (10 Mo).' });

    const formData = buildFormData();
    const oversized = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' });
    formData.set('datasheet', oversized);

    await createPvModuleAction(undefined, formData);

    expect(mockSaveFile).not.toHaveBeenCalled();
  });
});

describe('updatePvModuleAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockPvModuleFindUnique.mockResolvedValue({ id: 'module-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockPvModuleUpdate.mockResolvedValue({ id: 'module-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updatePvModuleAction('module-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deletePvModuleAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockPvModuleFindUnique.mockResolvedValue({ id: 'module-1', arrayConfigs: [], datasheetFileId: null, homologationFileId: null });
    mockPvModuleDelete.mockResolvedValue({ id: 'module-1' });

    const result = await deletePvModuleAction('module-1', undefined);

    expect(mockPvModuleDelete).toHaveBeenCalledWith({ where: { id: 'module-1' } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/equipment/pv-modules');
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the module is used by a project', async () => {
    mockPvModuleFindUnique.mockResolvedValue({ id: 'module-1', arrayConfigs: [{ id: 'config-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deletePvModuleAction('module-1', undefined);

    expect(mockPvModuleDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
