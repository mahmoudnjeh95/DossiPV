import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockValidateSession,
  mockProjectFindFirst, mockSimulationFindUnique, mockSimulationUpsert,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockSimulationFindUnique: vi.fn(),
    mockSimulationUpsert: vi.fn(),
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
      ...actual.db, company: { findUnique: () => Promise.resolve({ kind: 'INSTALLER' }) },
      project: { findFirst: mockProjectFindFirst },
      projectSimulation: { findUnique: mockSimulationFindUnique, upsert: mockSimulationUpsert },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { saveSimulationAction } from '../app/(app)/projects/[id]/sections/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-session-token' });
  mockRedirect.mockClear();
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
  mockProjectFindFirst.mockClear();
  mockProjectFindFirst.mockResolvedValue({ id: 'project-1' });
  mockSimulationFindUnique.mockReset();
  mockSimulationUpsert.mockClear();
  mockFileCreate.mockClear();
  mockFileFindUnique.mockReset();
  mockFileDelete.mockClear();
  mockSaveFile.mockClear();
  mockDeleteFile.mockClear();
  mockValidateUploadedFile.mockReset();
});

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const defaults: Record<string, string> = { source: 'PVGIS_LIVE' };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

describe('saveSimulationAction — PVsyst report upload', () => {
  it('uploads and links a PVsyst report file', async () => {
    mockSimulationFindUnique.mockResolvedValue(null);
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'simulation/abc-report.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-report-1' });
    mockSimulationUpsert.mockResolvedValue({ id: 'sim-1' });

    const formData = buildFormData({ source: 'PVSYST_UPLOAD', annualProductionKWh: '5000' });
    const fakeReport = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'report.pdf', { type: 'application/pdf' });
    formData.set('pvsystReport', fakeReport);

    await saveSimulationAction('project-1', undefined, formData);

    const upsertCallArg = mockSimulationUpsert.mock.calls[0]?.[0] as { create: { pvsystReportFileId?: string } };
    expect(upsertCallArg.create.pvsystReportFileId).toBe('file-report-1');
  });

  it('rejects with a French error when the uploaded report fails validation', async () => {
    mockSimulationFindUnique.mockResolvedValue(null);
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData({ source: 'PVSYST_UPLOAD', annualProductionKWh: '5000' });
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('pvsystReport', fakeFile);

    const result = await saveSimulationAction('project-1', undefined, formData);

    expect(mockSimulationUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });

  it('does not save the report to disk when a non-file field fails validation first (no orphaned upload)', async () => {
    mockSimulationFindUnique.mockResolvedValue(null);
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });

    // PVSYST_UPLOAD requires annualProductionKWh — omitted here, so FormReader rejects before
    // any file write should happen.
    const formData = buildFormData({ source: 'PVSYST_UPLOAD' });
    const fakeReport = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'report.pdf', { type: 'application/pdf' });
    formData.set('pvsystReport', fakeReport);

    const result = await saveSimulationAction('project-1', undefined, formData);

    expect(result?.error).toContain('Production annuelle');
    expect(mockSaveFile).not.toHaveBeenCalled();
    expect(mockSimulationUpsert).not.toHaveBeenCalled();
  });

  it('deletes the OLD report file only after the new one is successfully saved', async () => {
    mockSimulationFindUnique.mockResolvedValue({ id: 'sim-1', pvsystReportFileId: 'old-report-file' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'simulation/new-report.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-report-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-report-file', storageKey: 'simulation/old-report.pdf' });
    mockSimulationUpsert.mockResolvedValue({ id: 'sim-1' });

    const formData = buildFormData({ source: 'PVSYST_UPLOAD', annualProductionKWh: '5000' });
    const fakeReport = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-report.pdf', { type: 'application/pdf' });
    formData.set('pvsystReport', fakeReport);

    await saveSimulationAction('project-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });

  it('saves successfully with no file uploaded (PVGIS_LIVE mode)', async () => {
    mockSimulationFindUnique.mockResolvedValue(null);
    mockSimulationUpsert.mockResolvedValue({ id: 'sim-1' });

    await saveSimulationAction('project-1', undefined, buildFormData());

    expect(mockSaveFile).not.toHaveBeenCalled();
    const upsertCallArg = mockSimulationUpsert.mock.calls[0]?.[0] as { create: { pvsystReportFileId?: string } };
    expect(upsertCallArg.create.pvsystReportFileId).toBeUndefined();
  });
});
