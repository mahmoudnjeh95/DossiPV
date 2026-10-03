import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockValidateSuperAdminSession,
  mockInverterFindUnique, mockInverterCreate, mockInverterUpdate, mockInverterDelete,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockInverterFindUnique: vi.fn(),
    mockInverterCreate: vi.fn(),
    mockInverterUpdate: vi.fn(),
    mockInverterDelete: vi.fn(),
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
      inverter: { findUnique: mockInverterFindUnique, create: mockInverterCreate, update: mockInverterUpdate, delete: mockInverterDelete },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { createInverterAction, updateInverterAction, deleteInverterAction } from '../app/admin/(protected)/equipment/inverters/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-admin-token' });
  mockRedirect.mockClear();
  mockValidateSuperAdminSession.mockReset();
  mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'admin@dossipv.tn' });
  mockInverterFindUnique.mockClear();
  mockInverterCreate.mockClear();
  mockInverterUpdate.mockClear();
  mockInverterDelete.mockClear();
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
    brand: 'Sofar', model: '1-4KTL2-G3', phases: '1', pacW: '3000', sacVA: '3000',
    vdcMaxV: '500', mpptMinV: '80', mpptMaxV: '500', startUpV: '90', mpptCount: '1',
    inputsPerMppt: '2', idcMaxPerMpptA: '15', iscMaxPerMpptA: '18', vacNomV: '230', iacMaxA: '14',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('createInverterAction', () => {
  it('creates a global Inverter row (ownerCompanyId: null)', async () => {
    mockInverterCreate.mockResolvedValue({ id: 'new-inverter-1' });

    await createInverterAction(undefined, buildFormData());

    const createCallArg = mockInverterCreate.mock.calls[0]?.[0] as { data: { ownerCompanyId: string | null; brand: string; pacW: number } };
    expect(createCallArg.data.ownerCompanyId).toBeNull();
    expect(createCallArg.data.brand).toBe('Sofar');
    expect(createCallArg.data.pacW).toBe(3000);
    expect(mockRedirect).toHaveBeenCalledWith('/admin/equipment/inverters');
  });

  it('rejects the action with a French error when the uploaded file fails validation, without creating the row', async () => {
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    const result = await createInverterAction(undefined, formData);

    expect(mockInverterCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });
});

describe('updateInverterAction', () => {
  it('deletes the OLD file only after the new one is successfully saved', async () => {
    mockInverterFindUnique.mockResolvedValue({ id: 'inverter-1', datasheetFileId: 'old-file-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'equipment/new-datasheet.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-file-1', storageKey: 'equipment/old-datasheet.pdf' });
    mockInverterUpdate.mockResolvedValue({ id: 'inverter-1' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-datasheet.pdf', { type: 'application/pdf' });
    formData.set('datasheet', fakeFile);

    await updateInverterAction('inverter-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });
});

describe('deleteInverterAction', () => {
  it('deletes the row when it has no usage', async () => {
    mockInverterFindUnique.mockResolvedValue({ id: 'inverter-1', arrayInverters: [], datasheetFileId: null, homologationFileId: null });
    mockInverterDelete.mockResolvedValue({ id: 'inverter-1' });

    const result = await deleteInverterAction('inverter-1', undefined);

    expect(mockInverterDelete).toHaveBeenCalledWith({ where: { id: 'inverter-1' } });
    expect(result).toBeUndefined();
  });

  it('refuses to delete and returns a French error when the inverter is used by a project', async () => {
    mockInverterFindUnique.mockResolvedValue({ id: 'inverter-1', arrayInverters: [{ id: 'array-inverter-1' }], datasheetFileId: null, homologationFileId: null });

    const result = await deleteInverterAction('inverter-1', undefined);

    expect(mockInverterDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' });
  });
});
