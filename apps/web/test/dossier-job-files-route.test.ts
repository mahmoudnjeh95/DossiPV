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

import { GET } from '../app/(app)/projects/[id]/jobs/[jobId]/files/[kind]/route';

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(response.headers.get('Content-Disposition')).toContain('dossier.pdf');
  });
});
