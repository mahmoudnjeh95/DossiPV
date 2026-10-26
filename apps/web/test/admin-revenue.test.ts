import { describe, it, expect } from 'vitest';
import { estimateRevenue, nextMonthStart, type RevenueSubscriptionRow } from '../lib/admin-revenue';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-26T10:00:00.000Z');
const MONTH_END = nextMonthStart(NOW);
const inDays = (days: number): Date => new Date(NOW.getTime() + days * DAY_MS);

function row(overrides: Partial<RevenueSubscriptionRow> = {}): RevenueSubscriptionRow {
  return {
    status: 'ACTIVE',
    periodEnd: inDays(20),
    option3dUntil: null,
    plan: { priceTnd: 49.9, isTrial: false },
    sponsored: false,
    ...overrides,
  };
}

describe('nextMonthStart', () => {
  it('is midnight in Tunis on the 1st of the next month', () => {
    expect(MONTH_END.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(nextMonthStart(new Date('2026-12-15T12:00:00Z')).toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});

describe('estimateRevenue', () => {
  it('sums the running paid plans and flags those ending before the month ends', () => {
    const estimate = estimateRevenue([row({ periodEnd: inDays(3) }), row({ plan: { priceTnd: 99.9, isTrial: false } })], null, NOW, MONTH_END);
    expect(estimate).toEqual({ monthlyEstimateTnd: 149.8, renewalsDueTnd: 49.9, renewalsDueCount: 1 });
  });

  it('leaves out trials, ended or suspended plans and the sponsored installers’ placeholder rows', () => {
    const estimate = estimateRevenue(
      [
        row({ plan: { priceTnd: 0, isTrial: true } }),
        row({ periodEnd: inDays(-1) }),
        row({ status: 'SUSPENDED' }),
        row({ sponsored: true, status: 'SUSPENDED' }),
      ],
      null,
      NOW,
      MONTH_END,
    );
    expect(estimate).toEqual({ monthlyEstimateTnd: 0, renewalsDueTnd: 0, renewalsDueCount: 0 });
  });

  it('counts a running 3D option at its monthly price', () => {
    const option = row({ sponsored: true, status: 'SUSPENDED', option3dUntil: inDays(2) });
    expect(estimateRevenue([option], 15, NOW, MONTH_END)).toEqual({ monthlyEstimateTnd: 15, renewalsDueTnd: 15, renewalsDueCount: 1 });
    expect(estimateRevenue([option], null, NOW, MONTH_END).monthlyEstimateTnd).toBe(0);
  });
});
