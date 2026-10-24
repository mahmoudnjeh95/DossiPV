import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

const mocks = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockCookies: vi.fn(() => Promise.resolve({ get: mocks.mockGet })),
  mockValidateSession: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockJobFindFirst: vi.fn(),
  mockFileFindUnique: vi.fn(),
  mockGetFilePath: vi.fn(),
  mockCreateReadStream: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mocks.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: { ...actual.db, project: { findFirst: mocks.mockProjectFindFirst }, dossierJob: { findFirst: mocks.mockJobFindFirst }, file: { findUnique: mocks.mockFileFindUnique } },
  };
});
vi.mock('@dossipv/file-storage', () => ({ getFilePath: mocks.mockGetFilePath }));
vi.mock('fs', () => ({ createReadStream: mocks.mockCreateReadStream, default: { createReadStream: mocks.mockCreateReadStream } }));

vi.mock('fs/promises', () => ({ stat: mocks.mockStat, default: { stat: mocks.mockStat } }));

import { GET } from '../app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockStat.mockResolvedValue({});
  mocks.mockGet.mockReturnValue({ value: 'valid-session-token' });
  mocks.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
});

function makeRequest(): Request {
  return new Request('http://localhost/projects/p1/jobs/j1/files/pdf');
}

describe('GET /projects/[id]/jobs/[jobId]/files/[kind]', () => {
  it('returns 404 when the project is not owned by the caller', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue(null);

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(404);
  });

  it('returns 404 when the job has no pdfFileId yet', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1' });
    mocks.mockJobFindFirst.mockResolvedValue({ id: 'j1', projectId: 'p1', pdfFileId: null, docxFileId: null, annexesPdfFileId: null });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(404);
  });

  it('streams the file with the correct content type when everything is found', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1' });
    mocks.mockJobFindFirst.mockResolvedValue({ id: 'j1', projectId: 'p1', pdfFileId: 'file-1', docxFileId: null, annexesPdfFileId: null });
    mocks.mockFileFindUnique.mockResolvedValue({ id: 'file-1', fileName: 'dossier.pdf', mimeType: 'pdf', storageKey: 'dossier/abc.pdf' });
    mocks.mockGetFilePath.mockReturnValue('/fake/storage/dossier/abc.pdf');
    mocks.mockCreateReadStream.mockReturnValue(Readable.from(['fake pdf bytes']));

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('.pdf');
  });

  it("downloads under the client's name and the day the job generated the file", async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1', client: { fullName: 'Hélène Ben Ali' } });
    mocks.mockJobFindFirst.mockResolvedValue({
      id: 'j1',
      projectId: 'p1',
      pdfFileId: null,
      docxFileId: null,
      annexesPdfFileId: 'file-2',
      startedAt: new Date('2026-10-22T08:00:00Z'),
      completedAt: new Date('2026-10-23T08:05:00Z'),
    });
    mocks.mockFileFindUnique.mockResolvedValue({ id: 'file-2', fileName: 'annexes.pdf', mimeType: 'pdf', storageKey: 'dossier/def.pdf' });
    mocks.mockGetFilePath.mockReturnValue('/fake/storage/dossier/def.pdf');
    mocks.mockCreateReadStream.mockReturnValue(Readable.from(['fake pdf bytes']));

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'annexes' }) });

    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="Annexes - Helene Ben Ali - 23-10-2026.pdf"; filename*=UTF-8''${encodeURIComponent('Annexes - Hélène Ben Ali - 23-10-2026.pdf')}`,
    );
  });

  it('returns 404 when the job does not belong to the project', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1', client: null });
    mocks.mockJobFindFirst.mockResolvedValue(null);

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(404);
  });

  it('answers in French (not an empty 404) when the stored file is missing on disk', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ id: 'p1', client: null });
    mocks.mockJobFindFirst.mockResolvedValue({ id: 'j1', projectId: 'p1', pdfFileId: 'file-1', docxFileId: null, annexesPdfFileId: null });
    mocks.mockFileFindUnique.mockResolvedValue({ id: 'file-1', fileName: 'dossier.pdf', mimeType: 'pdf', storageKey: 'dossier/abc.pdf' });
    mocks.mockGetFilePath.mockReturnValue('/fake/storage/dossier/abc.pdf');
    mocks.mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1', jobId: 'j1', kind: 'pdf' }) });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('introuvable');
    expect(mocks.mockCreateReadStream).not.toHaveBeenCalled();
  });
});
