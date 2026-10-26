import { db } from '@dossipv/db';
import { monthStart } from './subscription';
import { loadOption3dPrice } from './payments/pricing';

/**
 * The money figures of the admin dashboard. Months follow Africa/Tunis (see `monthStart`), amounts
 * are in TND as charged (no VAT, no stamp: see `computeAmount`).
 */

export interface RevenueSubscriptionRow {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  periodEnd: Date;
  option3dUntil: Date | null;
  plan: { priceTnd: number; isTrial: boolean };
  /** The installer is sponsored: its own row only holds the 3D option, its plan is its supplier's. */
  sponsored: boolean;
}

export interface RevenueEstimate {
  /** What the running paid subscriptions and 3D options bring in a month. */
  monthlyEstimateTnd: number;
  /** Paid subscriptions and 3D options ending between now and the end of the month: one month of each. */
  renewalsDueTnd: number;
  renewalsDueCount: number;
}

const toCentimes = (tnd: number): number => Math.round(tnd * 100);

/** Midnight (Africa/Tunis) of the 1st of the month after the one containing `now`. */
export function nextMonthStart(now: Date): Date {
  return monthStart(new Date(monthStart(now).getTime() + 32 * 24 * 60 * 60 * 1000));
}

/**
 * The monthly estimate counts every paid plan still running (trials and the sponsored installers'
 * placeholder rows excluded) plus every 3D option still running. A renewal is due when that period
 * ends before `monthEnd`.
 */
export function estimateRevenue(rows: RevenueSubscriptionRow[], option3dPriceTnd: number | null, now: Date, monthEnd: Date): RevenueEstimate {
  let monthly = 0;
  let due = 0;
  let renewalsDueCount = 0;
  const count = (priceCentimes: number, end: Date): void => {
    monthly += priceCentimes;
    if (end < monthEnd) {
      due += priceCentimes;
      renewalsDueCount += 1;
    }
  };
  for (const row of rows) {
    const plan = toCentimes(row.plan.priceTnd);
    if (!row.sponsored && row.status === 'ACTIVE' && !row.plan.isTrial && plan > 0 && row.periodEnd > now) {
      count(plan, row.periodEnd);
    }
    const option = option3dPriceTnd === null ? 0 : toCentimes(option3dPriceTnd);
    if (row.sponsored && option > 0 && row.option3dUntil && row.option3dUntil > now) {
      count(option, row.option3dUntil);
    }
  }
  return { monthlyEstimateTnd: monthly / 100, renewalsDueTnd: due / 100, renewalsDueCount };
}

export interface MonthRevenue extends RevenueEstimate {
  /** Payments recorded this month: confirmed P2P transfers and the admin's manual payments. */
  confirmedThisMonthTnd: number;
  /** Transfers declared this month that the admin has not confirmed or rejected yet. */
  pendingThisMonthTnd: number;
  pendingThisMonthCount: number;
}

export async function computeMonthRevenue(now: Date): Promise<MonthRevenue> {
  const start = monthStart(now);
  const [confirmed, pending, subscriptions, option3dPrice] = await Promise.all([
    db.payment.aggregate({ _sum: { amountTnd: true }, where: { createdAt: { gte: start } } }),
    db.paymentIntent.aggregate({
      _sum: { amountTnd: true },
      _count: true,
      where: { status: 'PENDING', declaredAt: { gte: start } },
    }),
    db.subscription.findMany({
      where: { OR: [{ status: 'ACTIVE', periodEnd: { gt: now } }, { option3dUntil: { gt: now } }] },
      select: {
        status: true,
        periodEnd: true,
        option3dUntil: true,
        plan: { select: { priceTnd: true, isTrial: true } },
        company: { select: { sponsorCompanyId: true } },
      },
    }),
    loadOption3dPrice(),
  ]);

  const rows = subscriptions.map((s) => ({
    status: s.status,
    periodEnd: s.periodEnd,
    option3dUntil: s.option3dUntil,
    plan: { priceTnd: Number(s.plan.priceTnd), isTrial: s.plan.isTrial },
    sponsored: s.company.sponsorCompanyId !== null,
  }));

  return {
    ...estimateRevenue(rows, option3dPrice, now, nextMonthStart(now)),
    confirmedThisMonthTnd: Number(confirmed._sum.amountTnd ?? 0),
    pendingThisMonthTnd: Number(pending._sum.amountTnd ?? 0),
    pendingThisMonthCount: pending._count,
  };
}
