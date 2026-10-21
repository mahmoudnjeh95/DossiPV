import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet, mockCookies, mockRedirect, mockValidateSession,
  mockProjectFindFirst, mockAnnexesFindUnique, mockAnnexesUpsert,
  mockExtraFileDeleteMany, mockExtraFileCreateMany,
  mockFileCreate, mockFileFindUnique, mockFileDelete,
  mockSaveFile, mockDeleteFile, mockValidateUploadedFile,
  mockTransaction, mockBillImportCount,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockAnnexesFindUnique: vi.fn(),
    mockAnnexesUpsert: vi.fn(),
    mockExtraFileDeleteMany: vi.fn(),
    mockExtraFileCreateMany: vi.fn(),
    mockFileCreate: vi.fn(),
    mockFileFindUnique: vi.fn(),
    mockFileDelete: vi.fn(),
    mockSaveFile: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockValidateUploadedFile: vi.fn(),
    mockTransaction: vi.fn(),
    mockBillImportCount: vi.fn(),
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
      project: { findFirst: mockProjectFindFirst },
      projectAnnexes: { findUnique: mockAnnexesFindUnique, upsert: mockAnnexesUpsert },
      projectAnnexExtraFile: { deleteMany: mockExtraFileDeleteMany, createMany: mockExtraFileCreateMany },
      file: { create: mockFileCreate, findUnique: mockFileFindUnique, delete: mockFileDelete },
      projectBillImport: { count: mockBillImportCount },
      $transaction: mockTransaction,
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: mockSaveFile, deleteFile: mockDeleteFile, validateUploadedFile: mockValidateUploadedFile };
});

import { saveAnnexesAction } from '../app/(app)/projects/[id]/sections/actions';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-session-token' });
  mockRedirect.mockClear();
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
  mockProjectFindFirst.mockClear();
  mockProjectFindFirst.mockResolvedValue({ id: 'project-1' });
  mockAnnexesFindUnique.mockReset();
  mockAnnexesUpsert.mockClear();
  mockExtraFileDeleteMany.mockClear();
  mockExtraFileCreateMany.mockClear();
  mockFileCreate.mockClear();
  mockFileFindUnique.mockReset();
  mockFileDelete.mockClear();
  mockSaveFile.mockClear();
  mockDeleteFile.mockClear();
  mockValidateUploadedFile.mockReset();
  mockTransaction.mockReset();
  mockBillImportCount.mockReset();
  mockBillImportCount.mockResolvedValue(0);
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      projectAnnexes: { upsert: mockAnnexesUpsert },
      projectAnnexExtraFile: { deleteMany: mockExtraFileDeleteMany, createMany: mockExtraFileCreateMany },
      file: { create: mockFileCreate },
    });
  });
});

function buildFormData(): FormData {
  return new FormData();
}

describe('saveAnnexesAction', () => {
  it('rejects with a French error when the project is not owned by the caller', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const result = await saveAnnexesAction('project-1', undefined, buildFormData());

    expect(result).toEqual({ error: 'Projet introuvable.' });
    expect(mockAnnexesUpsert).not.toHaveBeenCalled();
  });

  it('uploads and links the CIN file', async () => {
    mockAnnexesFindUnique.mockResolvedValue(null);
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'annexes/abc-cin.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-cin-1' });
    mockAnnexesUpsert.mockResolvedValue({ id: 'annexes-1' });

    const formData = buildFormData();
    const fakeCin = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cin.pdf', { type: 'application/pdf' });
    formData.set('cin', fakeCin);

    await saveAnnexesAction('project-1', undefined, formData);

    const upsertCallArg = mockAnnexesUpsert.mock.calls[0]?.[0] as { create: { cinFileId?: string } };
    expect(upsertCallArg.create.cinFileId).toBe('file-cin-1');
  });

  it('rejects the action with a French error when an uploaded file fails validation', async () => {
    mockAnnexesFindUnique.mockResolvedValue(null);
    mockValidateUploadedFile.mockReturnValue({ valid: false, error: 'Type de fichier non autorisé.' });

    const formData = buildFormData();
    const fakeFile = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('stegContract', fakeFile);

    const result = await saveAnnexesAction('project-1', undefined, formData);

    expect(mockAnnexesUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
  });

  it('does not save an earlier valid file to disk when a later field fails validation (no orphaned upload)', async () => {
    mockAnnexesFindUnique.mockResolvedValue(null);
    // cin (processed first) is valid; stegContract (processed later) is rejected.
    mockValidateUploadedFile.mockImplementation((_buf: Buffer, mimeType: string) =>
      mimeType === 'application/pdf' && _buf[0] === 0x25
        ? { valid: true, mimeType: 'pdf' }
        : { valid: false, error: 'Type de fichier non autorisé.' },
    );

    const formData = buildFormData();
    const validCin = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cin.pdf', { type: 'application/pdf' });
    const invalidContract = new File([new Uint8Array([0, 0, 0])], 'malware.exe', { type: 'application/pdf' });
    formData.set('cin', validCin);
    formData.set('stegContract', invalidContract);

    const result = await saveAnnexesAction('project-1', undefined, formData);

    expect(result).toEqual({ error: 'Type de fichier non autorisé.' });
    expect(mockSaveFile).not.toHaveBeenCalled();
    expect(mockAnnexesUpsert).not.toHaveBeenCalled();
  });

  it('deletes the OLD last-paid-bill file only after the new one is successfully saved', async () => {
    mockAnnexesFindUnique.mockResolvedValue({ id: 'annexes-1', lastPaidBillFileId: 'old-bill-file' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'annexes/new-bill.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-bill-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-bill-file', storageKey: 'annexes/old-bill.pdf' });
    mockAnnexesUpsert.mockResolvedValue({ id: 'annexes-1' });

    const formData = buildFormData();
    const fakeBill = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-bill.pdf', { type: 'application/pdf' });
    formData.set('lastPaidBill', fakeBill);

    await saveAnnexesAction('project-1', undefined, formData);

    const saveFileCallOrder = mockSaveFile.mock.invocationCallOrder[0]!;
    const deleteFileCallOrder = mockDeleteFile.mock.invocationCallOrder[0];
    if (deleteFileCallOrder !== undefined) {
      expect(saveFileCallOrder).toBeLessThan(deleteFileCallOrder);
    }
  });

  it('deletes the replaced last-paid-bill File row and bytes when nothing else references it', async () => {
    mockAnnexesFindUnique.mockResolvedValue({ id: 'annexes-1', lastPaidBillFileId: 'old-bill-file' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'annexes/new-bill.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-bill-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'old-bill-file', storageKey: 'annexes/old-bill.pdf' });
    mockAnnexesUpsert.mockResolvedValue({ id: 'annexes-1' });
    const formData = buildFormData();
    formData.set('lastPaidBill', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-bill.pdf', { type: 'application/pdf' }));

    await saveAnnexesAction('project-1', undefined, formData);

    expect(mockDeleteFile).toHaveBeenCalledWith('annexes/old-bill.pdf');
    expect(mockFileDelete).toHaveBeenCalledWith({ where: { id: 'old-bill-file' } });
  });

  it('keeps the replaced bill File row and bytes when the project bill import still references it (only relinks the annex)', async () => {
    mockAnnexesFindUnique.mockResolvedValue({ id: 'annexes-1', lastPaidBillFileId: 'imported-bill-file' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'annexes/new-bill.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-bill-2' });
    mockFileFindUnique.mockResolvedValue({ id: 'imported-bill-file', storageKey: 'equipment/imported-bill.webp' });
    mockAnnexesUpsert.mockResolvedValue({ id: 'annexes-1' });
    mockBillImportCount.mockResolvedValue(1);
    const formData = buildFormData();
    formData.set('lastPaidBill', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'new-bill.pdf', { type: 'application/pdf' }));

    const result = await saveAnnexesAction('project-1', undefined, formData);

    const upsertCallArg = mockAnnexesUpsert.mock.calls[0]?.[0] as { update: { lastPaidBillFileId?: string } };
    expect(upsertCallArg.update.lastPaidBillFileId).toBe('file-bill-2');
    expect(mockBillImportCount).toHaveBeenCalledWith({ where: { fileId: 'imported-bill-file' } });
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockFileDelete).not.toHaveBeenCalled();
    expect(result?.error).toBeUndefined();
  });

  it('replaces all extra files (delete then recreate) inside the transaction', async () => {
    mockAnnexesFindUnique.mockResolvedValue({ id: 'annexes-1' });
    mockValidateUploadedFile.mockReturnValue({ valid: true, mimeType: 'pdf' });
    mockSaveFile.mockResolvedValue({ storageKey: 'annexes/extra-1.pdf' });
    mockFileCreate.mockResolvedValue({ id: 'file-extra-1' });
    mockAnnexesUpsert.mockResolvedValue({ id: 'annexes-1' });

    const formData = buildFormData();
    const fakeExtra = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'extra.pdf', { type: 'application/pdf' });
    formData.append('extraFiles', fakeExtra);

    await saveAnnexesAction('project-1', undefined, formData);

    expect(mockExtraFileDeleteMany).toHaveBeenCalledWith({ where: { annexesId: 'annexes-1' } });
    expect(mockExtraFileCreateMany).toHaveBeenCalled();
  });
});
