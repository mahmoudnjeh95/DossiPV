import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockValidateSession: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockStoreAnnexFiles: vi.fn(),
    mockStructureFindUnique: vi.fn(),
    mockStructureUpdate: vi.fn(),
    mockFileCreate: vi.fn(),
    mockFileFindUnique: vi.fn(),
    mockFileDelete: vi.fn(),
    mockSaveFile: vi.fn(),
    mockDeleteFile: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: m.mockSaveFile, deleteFile: m.mockDeleteFile };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      project: { findFirst: m.mockProjectFindFirst },
      projectStructure: { findUnique: m.mockStructureFindUnique, update: m.mockStructureUpdate },
      file: { create: m.mockFileCreate, findUnique: m.mockFileFindUnique, delete: m.mockFileDelete },
    },
  };
});
// The project papers' store is mocked; the structure attestation's runs for real on mocked db/storage.
vi.mock('../lib/annex-upload', async () => {
  const actual = await vi.importActual<typeof import('../lib/annex-upload')>('../lib/annex-upload');
  return { ...actual, storeAnnexFiles: m.mockStoreAnnexFiles };
});

import { uploadStegPieceAction } from '../app/(app)/projects/[id]/summary/actions';

const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n% synthetic\n');

function form(piece: string, file?: File): FormData {
  const data = new FormData();
  data.append('piece', piece);
  if (file) data.append('file', file);
  return data;
}
const pdf = (name = 'piece.pdf'): File => new File([PDF_BYTES], name, { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'valid-token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockProjectFindFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' });
  m.mockStoreAnnexFiles.mockResolvedValue(null);
  m.mockStructureFindUnique.mockResolvedValue({ structureAttestationFileId: null });
  m.mockStructureUpdate.mockResolvedValue({});
  m.mockFileCreate.mockResolvedValue({ id: 'file-new' });
  m.mockSaveFile.mockResolvedValue({ storageKey: 'uploads/new.pdf' });
});

describe('uploadStegPieceAction', () => {
  it('guards first: an unauthenticated caller is redirected and nothing is stored', async () => {
    m.mockValidateSession.mockResolvedValue(null);

    await expect(uploadStegPieceAction('p1', undefined, form('stegContract', pdf()))).rejects.toThrow('NEXT_REDIRECT');
    expect(m.mockStoreAnnexFiles).not.toHaveBeenCalled();
    expect(m.mockSaveFile).not.toHaveBeenCalled();
  });

  it("refuses another company's project before reading the form", async () => {
    m.mockProjectFindFirst.mockResolvedValue(null);

    expect(await uploadStegPieceAction('p2', undefined, form('stegContract', pdf()))).toEqual({ error: 'Projet introuvable.' });
    expect(m.mockProjectFindFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'p2', companyId: 'company-1' } });
    expect(m.mockStoreAnnexFiles).not.toHaveBeenCalled();
    expect(m.mockStructureFindUnique).not.toHaveBeenCalled();
  });

  it('refuses an unknown piece and an empty file', async () => {
    expect(await uploadStegPieceAction('p1', undefined, form('extraFiles', pdf()))).toEqual({ error: 'Pièce inconnue.' });
    expect(await uploadStegPieceAction('p1', undefined, form('stegContract'))).toEqual({ error: 'Choisissez une photo ou un fichier PDF.' });
    expect(m.mockStoreAnnexFiles).not.toHaveBeenCalled();
    expect(m.mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('stores the syndic authorization through the annex store, under its own field only', async () => {
    const file = pdf('syndic.pdf');

    expect(await uploadStegPieceAction('p1', undefined, form('syndicAuthorization', file))).toEqual({ saved: true });

    expect(m.mockStoreAnnexFiles).toHaveBeenCalledTimes(1);
    const [projectId, upload] = m.mockStoreAnnexFiles.mock.calls[0] as [string, FormData];
    expect(projectId).toBe('p1');
    expect([...upload.keys()]).toEqual(['syndicAuthorization']);
    expect((upload.get('syndicAuthorization') as File).name).toBe('syndic.pdf');
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/projects/p1/summary');
  });

  it("passes the annex store's refusal on without revalidating", async () => {
    m.mockStoreAnnexFiles.mockResolvedValue({ error: 'Type de fichier non autorisé.' });

    expect(await uploadStegPieceAction('p1', undefined, form('stegContract', pdf()))).toEqual({ error: 'Type de fichier non autorisé.' });
    expect(m.mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('no longer accepts a structure attestation upload (the piece is not required)', async () => {
    expect(await uploadStegPieceAction('p1', undefined, form('structureAttestation', pdf()))).toEqual({ error: 'Pièce inconnue.' });
    expect(m.mockSaveFile).not.toHaveBeenCalled();
  });
});
