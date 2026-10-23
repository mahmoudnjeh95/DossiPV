import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

const mocks = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockCookies: vi.fn(() => Promise.resolve({ get: mocks.mockGet })),
  mockValidateSession: vi.fn(),
  mockProjectFindFirst: vi.fn(),
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
  return { ...actual, db: { ...actual.db, project: { findFirst: mocks.mockProjectFindFirst } } };
});
vi.mock('@dossipv/file-storage', () => ({ getFilePath: mocks.mockGetFilePath }));
vi.mock('fs', () => ({ createReadStream: mocks.mockCreateReadStream, default: { createReadStream: mocks.mockCreateReadStream } }));

import { GET } from '../app/(app)/projects/[id]/site-image/route';

const request = (): Request => new Request('http://localhost/projects/p1/site-image?v=photo-1');
const params = { params: Promise.resolve({ id: 'p1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGet.mockReturnValue({ value: 'valid-session-token' });
  mocks.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
});

describe('GET /projects/[id]/site-image', () => {
  it('serves the project photo as a JPEG, cached for good (its URL changes with the photo)', async () => {
    mocks.mockProjectFindFirst.mockResolvedValue({ site: { siteImage: { storageKey: 'equipment/photo.jpg' } } });
    mocks.mockGetFilePath.mockReturnValue('/fake/storage/equipment/photo.jpg');
    mocks.mockCreateReadStream.mockReturnValue(Readable.from(['jpeg bytes']));

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(mocks.mockProjectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', companyId: 'company-1' } }));
  });

  it('answers 401 without a session and 404 for another company or a project without a photo', async () => {
    mocks.mockGet.mockReturnValueOnce(undefined);
    expect((await GET(request(), params)).status).toBe(401);

    mocks.mockProjectFindFirst.mockResolvedValueOnce(null);
    expect((await GET(request(), params)).status).toBe(404);

    mocks.mockProjectFindFirst.mockResolvedValueOnce({ site: { siteImage: null } });
    expect((await GET(request(), params)).status).toBe(404);
  });
});
