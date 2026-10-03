import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    jobUpdateMany: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mocks.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mocks.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, dossierJob: { updateMany: mocks.jobUpdateMany } } };
});

import { cancelJobAction } from '../app/(app)/projects/[id]/jobs/[jobId]/actions';
import { CANCELLED_BY_INSTALLER_REASON } from '../lib/dossier-jobs';

beforeEach(() => {
  mocks.mockGet.mockReset();
  mocks.mockGet.mockReturnValue({ value: 'valid-token' });
  mocks.mockRedirect.mockClear();
  mocks.mockValidateSession.mockReset();
  mocks.mockValidateSession.mockResolvedValue({
    id: 'user-1',
    companyId: 'company-1',
    email: 'a@b.com',
    fullName: 'A',
    role: 'OWNER',
  });
  mocks.jobUpdateMany.mockReset();
});

describe('cancelJobAction', () => {
  it('cancels only a PENDING job of the caller company, in one conditional update', async () => {
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });

    const result = await cancelJobAction('project-1', 'job-1', undefined);

    expect(result).toBeUndefined();
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        status: 'PENDING',
        project: { id: 'project-1', companyId: 'company-1' },
      },
      data: {
        status: 'FAILED',
        failedStep: 'snapshot',
        failureReason: CANCELLED_BY_INSTALLER_REASON,
        completedAt: expect.any(Date) as Date,
      },
    });
    expect(mocks.mockRedirect).toHaveBeenCalledWith('/projects/project-1/jobs/job-1');
  });

  it('reports an error and does not redirect when the job was already picked up or belongs to someone else', async () => {
    mocks.jobUpdateMany.mockResolvedValue({ count: 0 });

    const result = await cancelJobAction('project-1', 'job-1', undefined);

    expect(result?.error).toContain('ne peut plus être annulée');
    expect(mocks.mockRedirect).not.toHaveBeenCalled();
  });
});
