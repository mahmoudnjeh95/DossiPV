import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  sendExpiryReminders: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, dossierJob: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } } };
});

vi.mock('../src/send-expiry-reminders', () => ({ sendExpiryReminders: mocks.sendExpiryReminders }));

import { claimNextJob, resetExpiryReminderScheduleForTests, resetStaleRunningJobs, runExpiryRemindersIfDue } from '../src/run-worker';

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

describe('runExpiryRemindersIfDue', () => {
  const START = new Date('2026-10-24T08:00:00.000Z');
  const minutesLater = (minutes: number): Date => new Date(START.getTime() + minutes * 60_000);

  beforeEach(() => {
    resetExpiryReminderScheduleForTests();
    mocks.sendExpiryReminders.mockResolvedValue({ checked: 0, sent: 0 });
  });

  it('runs on the first call (startup), then at most once an hour', async () => {
    await runExpiryRemindersIfDue(START);
    await runExpiryRemindersIfDue(minutesLater(1));
    await runExpiryRemindersIfDue(minutesLater(59));
    expect(mocks.sendExpiryReminders).toHaveBeenCalledTimes(1);

    await runExpiryRemindersIfDue(minutesLater(60));
    expect(mocks.sendExpiryReminders).toHaveBeenCalledTimes(2);
    expect(mocks.sendExpiryReminders).toHaveBeenLastCalledWith(minutesLater(60));
  });

  it('never throws when the check fails, and waits an hour before trying again', async () => {
    mocks.sendExpiryReminders.mockRejectedValue(new Error('database unreachable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runExpiryRemindersIfDue(START)).resolves.toBeUndefined();
    await runExpiryRemindersIfDue(minutesLater(5));

    expect(mocks.sendExpiryReminders).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('Expiry reminders check failed:', expect.any(Error));
    error.mockRestore();
  });
});
