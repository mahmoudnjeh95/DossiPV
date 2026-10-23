import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockCookies: vi.fn(() => Promise.resolve({ get: mocks.mockGet })),
  mockValidateSession: vi.fn(),
  mockJobFindMany: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mocks.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, dossierJob: { findMany: mocks.mockJobFindMany } } };
});

import { GET } from '../app/api/dossier-jobs/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGet.mockReturnValue({ value: 'valid-session-token' });
  mocks.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com' });
  mocks.mockJobFindMany.mockResolvedValue([]);
});

function queriedWhere(): { project: { companyId: string }; OR: unknown[] } {
  return (mocks.mockJobFindMany.mock.calls[0]?.[0] as { where: { project: { companyId: string }; OR: unknown[] } }).where;
}

describe('GET /api/dossier-jobs', () => {
  it('returns 401 without a valid session', async () => {
    mocks.mockValidateSession.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/dossier-jobs'));

    expect(response.status).toBe(401);
    expect(mocks.mockJobFindMany).not.toHaveBeenCalled();
  });

  it("returns the company's queued and running jobs as progress views", async () => {
    mocks.mockJobFindMany.mockResolvedValue([
      {
        id: 'job-1',
        projectId: 'project-1',
        status: 'RUNNING',
        failedStep: null,
        failureReason: null,
        progressStep: 'text',
        progressAt: new Date(Date.now() - 4000),
        startedAt: new Date(Date.now() - 10_000),
        project: { client: { fullName: 'Ali Ben Salah' } },
      },
    ]);

    const response = await GET(new Request('http://localhost/api/dossier-jobs'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(queriedWhere()).toEqual({ project: { companyId: 'company-1' }, OR: [{ status: { in: ['PENDING', 'RUNNING'] } }] });
    const body = (await response.json()) as { jobs: { id: string; clientName: string; progressStep: string; stepElapsedMs: number }[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({ id: 'job-1', clientName: 'Ali Ben Salah', progressStep: 'text' });
    expect(body.jobs[0]!.stepElapsedMs).toBeGreaterThanOrEqual(4000);
  });

  it('also returns the watched jobs named in ?ids=, at most 20, still scoped to the company', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `job-${i}`);

    await GET(new Request(`http://localhost/api/dossier-jobs?ids=${[' ', ...ids].join(',')}`));

    const where = queriedWhere();
    expect(where.project).toEqual({ companyId: 'company-1' });
    expect(where.OR[1]).toEqual({ id: { in: ids.slice(0, 20) } });
  });
});
