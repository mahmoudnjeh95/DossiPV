import { describe, it, expect } from 'vitest';
import { summarizeSubscription, checkQuota, projectsCountedThisMonth } from '../lib/subscription';

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
