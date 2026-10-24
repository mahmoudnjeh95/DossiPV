import { describe, it, expect } from 'vitest';
import { monthStart, dayStart, summarizeSubscription, checkQuota, projectsCountedThisMonth, addMonths, extendedPeriodEnd } from '../lib/subscription';

const now = new Date('2026-10-15T12:00:00Z');
const plan = { name: 'Standard', monthlyDossierLimit: 2, tier: 'STANDARD' as const };

describe('summarizeSubscription', () => {
  it('returns null without a subscription', () => {
    expect(summarizeSubscription(null, now)).toBeNull();
  });

  it('flags an active subscription ending within 7 days as expiring soon and still able to generate', () => {
    const summary = summarizeSubscription(
      { status: 'ACTIVE', periodEnd: new Date('2026-10-20T00:00:00Z'), plan },
      now,
    );
    expect(summary).toMatchObject({
      effectiveStatus: 'ACTIVE',
      isExpiringSoon: true,
      canGenerate: true,
      daysLeft: 5,
    });
  });

  it('treats an ACTIVE row whose periodEnd has passed as expired', () => {
    const summary = summarizeSubscription(
      { status: 'ACTIVE', periodEnd: new Date('2026-10-01T00:00:00Z'), plan },
      now,
    );
    expect(summary).toMatchObject({
      effectiveStatus: 'EXPIRED',
      isExpiringSoon: false,
      canGenerate: false,
    });
  });

  it('keeps a suspended subscription suspended regardless of dates', () => {
    const summary = summarizeSubscription(
      { status: 'SUSPENDED', periodEnd: new Date('2027-01-01T00:00:00Z'), plan },
      now,
    );
    expect(summary).toMatchObject({ effectiveStatus: 'SUSPENDED', canGenerate: false });
  });
});

describe('quota', () => {
  const jobs = [
    { projectId: 'p1', status: 'SUCCEEDED' as const, startedAt: new Date('2026-10-02T00:00:00Z') },
    { projectId: 'p1', status: 'SUCCEEDED' as const, startedAt: new Date('2026-10-05T00:00:00Z') },
    { projectId: 'p2', status: 'FAILED' as const, startedAt: new Date('2026-10-06T00:00:00Z') },
    { projectId: 'p3', status: 'SUCCEEDED' as const, startedAt: new Date('2026-09-28T00:00:00Z') },
  ];

  it('counts a project once however many times it was regenerated, ignores FAILED jobs and last month', () => {
    expect([...projectsCountedThisMonth(jobs, now)]).toEqual(['p1']);
  });

  it('does not block regenerating a project that already holds a slot', () => {
    expect(checkQuota(jobs, 1, 'p1', now)).toEqual({ used: 1, limit: 1, blocked: false });
  });

  it('blocks a new project once the limit is reached', () => {
    expect(checkQuota(jobs, 1, 'p9', now)).toEqual({ used: 1, limit: 1, blocked: true });
    expect(checkQuota(jobs, 2, 'p9', now)).toEqual({ used: 1, limit: 2, blocked: false });
  });
});

describe('addMonths', () => {
  const ymd = (date: Date): [number, number, number] => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

  it('keeps the day of the month', () => {
    expect(ymd(addMonths(new Date(2026, 9, 15), 1))).toEqual([2026, 11, 15]);
    expect(ymd(addMonths(new Date(2026, 10, 15), 3))).toEqual([2027, 2, 15]);
  });

  it('stops at the last day of a shorter month instead of spilling into the next one', () => {
    expect(ymd(addMonths(new Date(2027, 0, 31), 1))).toEqual([2027, 2, 28]);
    expect(ymd(addMonths(new Date(2028, 0, 31), 1))).toEqual([2028, 2, 29]);
    expect(ymd(addMonths(new Date(2026, 7, 31), 1))).toEqual([2026, 9, 30]);
  });
});

describe('extendedPeriodEnd', () => {
  it('counts from the current end while the subscription still runs', () => {
    const periodEnd = new Date(2026, 11, 1);
    expect(extendedPeriodEnd(periodEnd, new Date(2026, 9, 15), 2)).toEqual(addMonths(periodEnd, 2));
  });

  it('counts from today once the subscription has ended, so a late payment does not pay for past days', () => {
    const today = new Date(2026, 9, 15);
    expect(extendedPeriodEnd(new Date(2026, 8, 1), today, 1)).toEqual(addMonths(today, 1));
  });
});

describe('Tunis month and day boundaries', () => {
  it('starts the month at midnight Africa/Tunis whatever the server zone', () => {
    // 2026-10-31 23:30 UTC is already 1 November in Tunis (UTC+1).
    expect(monthStart(new Date('2026-10-31T23:30:00Z')).toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(monthStart(new Date('2026-10-31T22:59:00Z')).toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(monthStart(new Date('2026-01-01T00:30:00Z')).toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });

  it('starts the day at midnight Africa/Tunis', () => {
    expect(dayStart(new Date('2026-10-15T23:30:00Z')).toISOString()).toBe('2026-10-15T23:00:00.000Z');
    expect(dayStart(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-14T23:00:00.000Z');
  });
});
