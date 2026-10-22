import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockValidateSession,
  mockCompanyFindUnique, mockCompanyUpdate,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockCompanyFindUnique: vi.fn(),
    mockCompanyUpdate: vi.fn(),
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
  return { ...actual, validateSession: mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      company: { findUnique: mockCompanyFindUnique, update: mockCompanyUpdate },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { saveCompanyAction } from '../app/(app)/settings/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-session-token' });
  mockRedirect.mockClear();
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
  mockCompanyFindUnique.mockClear();
  mockCompanyUpdate.mockClear();
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
    name: 'SolarPro', address: '12 Rue de la Paix', phone: '20123456', email: 'contact@solarpro.tn',
    legalRepFullName: 'Ahmed Ben Ali', legalRepRole: 'Gérant', anmeCode: 'ANME-001',
    anmeCategory: 'BT', anmeValidFrom: '2026-01-01', anmeValidTo: '2027-01-01',
    defaultTMinC: '-10', defaultTMaxC: '85', defaultMaxVoltageDropPct: '3', defaultMaxAcVoltageDropPct: '1',
    defaultDesignWindSpeedKmh: '120', defaultCosPhi: '0.95',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('saveCompanyAction — logo and ANME certificate uploads', () => {
  it('uploads and links a new logo file', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'png' });
    mockSaveFile.mockResolvedValue({ storageKey: 'company/abc-logo.png' });
    mockFileCreate.mockResolvedValue({ id: 'file-logo-1' });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });

    const formData = buildFormData();
    const fakeLogo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' });
    formData.set('logo', fakeLogo);

    await saveCompanyAction(undefined, formData);

    const updateCallArg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { logoFileId?: string } };
    expect(updateCallArg.data.logoFileId).toBe('file-logo-1');
    expect(mockRedirect).toHaveBeenCalledWith('/settings?saved=1');
  });

  it('rejects the action with a French error when the uploaded logo fails validation', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'image/png' });
    formData.set('logo', fakeFile);

    const result = await saveCompanyAction(undefined, formData);

    expect(mockCompanyUpdate).not.toHaveBeenCalled();
    expect(result?.error).toContain('Type de fichier non autorisé.');
  });

  it('deletes the OLD logo file only after the new one is successfully saved', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: 'old-logo-file', anmeCertificateFileId: null });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'png' });
    mockSaveFile.mockResolvedValue({ storageKey: 'company/new-logo.png' });
    mockFileCreate.mockResolvedValue({ id: 'file-logo-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-logo-file', storageKey: 'company/old-logo.png' });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });

    const formData = buildFormData();
    const fakeLogo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'new-logo.png', { type: 'image/png' });
    formData.set('logo', fakeLogo);

    await saveCompanyAction(undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });

  it('uploads and links a new ANME certificate file independently of the logo', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'company/abc-anme.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-anme-1' });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });

    const formData = buildFormData();
    const fakeCert = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'anme.pdf', { type: 'application/pdf' });
    formData.set('anmeCertificate', fakeCert);

    await saveCompanyAction(undefined, formData);

    const updateCallArg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { anmeCertificateFileId?: string } };
    expect(updateCallArg.data.anmeCertificateFileId).toBe('file-anme-1');
  });

  it('accepts a scanned (JPEG) ANME agreement, since it is now mandatory and often only a scan', async () => {
    const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
    mockValidateUploadedFile.mockImplementation(actual.validateUploadedFile);
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockSaveFile.mockResolvedValue({ storageKey: 'company/anme.jpg' });
    mockFileCreate.mockResolvedValue({ id: 'file-anme-jpg' });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });
    const formData = buildFormData();
    formData.set('anmeCertificate', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], 'agrement.jpg', { type: 'image/jpeg' }));

    const result = await saveCompanyAction(undefined, formData);

    expect(result).toBeUndefined();
    expect(mockFileCreate).toHaveBeenCalledWith({ data: { fileName: 'agrement.jpg', mimeType: 'jpeg', storageKey: 'company/anme.jpg' } });
    const updateCallArg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { anmeCertificateFileId?: string } };
    expect(updateCallArg.data.anmeCertificateFileId).toBe('file-anme-jpg');
  });

  it('does not write a file to disk when a non-file field fails validation (no orphaned upload)', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'png' });
    mockSaveFile.mockResolvedValue({ storageKey: 'company/abc-logo.png' });

    const formData = buildFormData({ anmeValidTo: '2020-01-01' }); // before anmeValidFrom -> rejected
    const fakeLogo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' });
    formData.set('logo', fakeLogo);

    const result = await saveCompanyAction(undefined, formData);

    expect(result?.error).toContain('postérieure au début');
    expect(mockSaveFile).not.toHaveBeenCalled();
    expect(mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('saves successfully with no files uploaded, keeping existing file ids untouched', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: 'existing-logo', anmeCertificateFileId: 'existing-anme' });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });

    await saveCompanyAction(undefined, buildFormData());

    const updateCallArg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { logoFileId?: string; anmeCertificateFileId?: string } };
    expect(updateCallArg.data.logoFileId).toBeUndefined();
    expect(updateCallArg.data.anmeCertificateFileId).toBeUndefined();
    expect(mockSaveFile).not.toHaveBeenCalled();
  });

  it('saves both the DC and the AC voltage-drop defaults', async () => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });

    await saveCompanyAction(undefined, buildFormData({ defaultMaxVoltageDropPct: '2.5', defaultMaxAcVoltageDropPct: '0.8' }));

    const arg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { defaultMaxVoltageDropPct: number; defaultMaxAcVoltageDropPct: number } };
    expect(arg.data.defaultMaxVoltageDropPct).toBe(2.5);
    expect(arg.data.defaultMaxAcVoltageDropPct).toBe(0.8);
  });

  it.each(['0', '11'])('rejects an AC voltage-drop default of %s', async (value) => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });

    const result = await saveCompanyAction(undefined, buildFormData({ defaultMaxAcVoltageDropPct: value }));

    expect(result?.error).toContain('Chute de tension maximale AC');
    expect(mockCompanyUpdate).not.toHaveBeenCalled();
  });
});

describe('saveCompanyAction — dossier numbering', () => {
  beforeEach(() => {
    mockCompanyFindUnique.mockResolvedValue({ id: 'company-1', logoFileId: null, anmeCertificateFileId: null });
    mockCompanyUpdate.mockResolvedValue({ id: 'company-1' });
  });

  it('saves the prefix and the next number (dossierCounter = next - 1)', async () => {
    await saveCompanyAction(undefined, buildFormData({ dossierPrefix: '434', dossierNextNumber: '303', dossierNextNumberShown: '1' }));

    const arg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { dossierPrefix: string | null; dossierCounter?: number } };
    expect(arg.data.dossierPrefix).toBe('434');
    expect(arg.data.dossierCounter).toBe(302);
  });

  it('stores an empty prefix as none', async () => {
    await saveCompanyAction(undefined, buildFormData({ dossierPrefix: '', dossierNextNumber: '1', dossierNextNumberShown: '5' }));

    const arg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: { dossierPrefix: string | null; dossierCounter?: number } };
    expect(arg.data.dossierPrefix).toBeNull();
    expect(arg.data.dossierCounter).toBe(0);
  });

  it.each(['0', '-3', '2.5'])('rejects a next number of %s', async (value) => {
    const result = await saveCompanyAction(undefined, buildFormData({ dossierPrefix: '434', dossierNextNumber: value, dossierNextNumberShown: '1' }));

    expect(result?.error).toContain('Prochain numéro de dossier');
    expect(mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('rejects a prefix longer than 20 characters', async () => {
    const result = await saveCompanyAction(undefined, buildFormData({ dossierPrefix: 'x'.repeat(21), dossierNextNumber: '1', dossierNextNumberShown: '1' }));

    expect(result?.error).toContain('Préfixe de numérotation des dossiers');
    expect(mockCompanyUpdate).not.toHaveBeenCalled();
  });

  it('leaves the counter alone when the next number was not changed, so a dossier numbered meanwhile is not reused', async () => {
    await saveCompanyAction(undefined, buildFormData({ dossierPrefix: '434', dossierNextNumber: '303', dossierNextNumberShown: '303' }));

    const arg = mockCompanyUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data).not.toHaveProperty('dossierCounter');
  });
});
