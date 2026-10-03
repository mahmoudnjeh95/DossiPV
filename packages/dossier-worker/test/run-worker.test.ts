import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, dossierJob: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } } };
});

import { claimNextJob, resetStaleRunningJobs } from '../src/run-worker';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('claimNextJob', () => {
  it('returns null when there is no PENDING job', async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await claimNextJob();

    expect(result).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('claims the oldest PENDING job by its id, conditioned on it still being PENDING', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'job-1' });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimNextJob();

    expect(result).toBe('job-1');
    const callArg = mocks.updateMany.mock.calls[0]?.[0] as { where: { id: string; status: string }; data: { status: string; startedAt: Date } };
    expect(callArg.where).toEqual({ id: 'job-1', status: 'PENDING' });
    expect(callArg.data.status).toBe('RUNNING');
    expect(callArg.data.startedAt).toBeInstanceOf(Date);
  });

  it('returns null when another process claims the same job first (updateMany affects 0 rows)', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'job-1' });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await claimNextJob();

    expect(result).toBeNull();
  });
});

describe('resetStaleRunningJobs', () => {
  it('resets any job RUNNING longer than the threshold back to PENDING', async () => {
    mocks.updateMany.mockResolvedValue({ count: 2 });

    const count = await resetStaleRunningJobs(600_000);

    expect(count).toBe(2);
    const callArg = mocks.updateMany.mock.calls[0]?.[0] as { where: { status: string; startedAt: { lt: Date } }; data: { status: string } };
    expect(callArg.where.status).toBe('RUNNING');
    expect(callArg.data.status).toBe('PENDING');
    expect(callArg.where.startedAt.lt.getTime()).toBeLessThan(Date.now());
  });
});
