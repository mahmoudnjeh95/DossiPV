import { db } from '@dossipv/db';

/**
 * Pure helpers for the installer-facing subscription banner and quota — no I/O, so they can be
 * unit tested directly and reused by the dashboard, the project overview and the generate action.
 */
export interface SubscriptionLike {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  periodStart?: Date;
  periodEnd: Date;
  plan: { name: string; monthlyDossierLimit: number; tier: 'STANDARD' | 'PREMIUM'; isTrial?: boolean };
}

export interface SubscriptionSummary {
  planName: string;
  tier: 'STANDARD' | 'PREMIUM';
  monthlyDossierLimit: number;
  /** The free trial: its dossiers (and bill imports) are counted over the whole period, not per month. */
  isTrial: boolean;
  /** Start of the period; where a trial's counting begins. Null when the row carries none. */
  periodStart: Date | null;
  periodEnd: Date;
  daysLeft: number;
  /** Status computed from periodEnd as well as the stored status: an ACTIVE row past its end is treated as expired. */
  effectiveStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  /** True within 7 days of periodEnd while still active — spec §8 notification window. */
  isExpiringSoon: boolean;
  canGenerate: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRY_WARNING_DAYS = 7;

export function summarizeSubscription(subscription: SubscriptionLike | null, now: Date): SubscriptionSummary | null {
  if (!subscription) {
    return null;
  }
  const daysLeft = Math.ceil((subscription.periodEnd.getTime() - now.getTime()) / DAY_MS);
  const effectiveStatus =
    subscription.status === 'SUSPENDED' ? 'SUSPENDED' : daysLeft <= 0 ? 'EXPIRED' : subscription.status;
  return {
    planName: subscription.plan.name,
    tier: subscription.plan.tier,
    monthlyDossierLimit: subscription.plan.monthlyDossierLimit,
    isTrial: subscription.plan.isTrial === true,
    periodStart: subscription.periodStart ?? null,
    periodEnd: subscription.periodEnd,
    daysLeft,
    effectiveStatus,
    isExpiringSoon: effectiveStatus === 'ACTIVE' && daysLeft <= EXPIRY_WARNING_DAYS,
    canGenerate: effectiveStatus === 'ACTIVE',
  };
}

export interface QuotaJobLike {
  projectId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  startedAt: Date;
}

export function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Where the quota counting starts: the calendar month, except for the free trial, which counts
 * over its whole period (spec 2026-10-23 §7).
 */
export function quotaWindowStart(subscription: SubscriptionSummary | null, now: Date): Date {
  return subscription?.isTrial && subscription.periodStart ? subscription.periodStart : monthStart(now);
}

/** The company's dossier jobs inside the quota window of its subscription. */
export function quotaJobs(
  companyId: string,
  subscription: SubscriptionSummary | null,
  now: Date,
): Promise<QuotaJobLike[]> {
  return db.dossierJob.findMany({
    where: { project: { companyId }, startedAt: { gte: quotaWindowStart(subscription, now) } },
    select: { projectId: true, status: true, startedAt: true },
  });
}

/**
 * Spec §5 quota rule: one project counts once against the limit however many times it is
 * regenerated, and a FAILED job never consumes quota. Returns the set of project ids that already
 * consumed a slot since `since` (the start of the month unless a trial counts from its period start).
 */
export function projectsCountedThisMonth(jobs: QuotaJobLike[], now: Date, since: Date = monthStart(now)): Set<string> {
  const start = since;
  const counted = new Set<string>();
  for (const job of jobs) {
    if (job.status !== 'FAILED' && job.startedAt >= start) {
      counted.add(job.projectId);
    }
  }
  return counted;
}

export interface QuotaCheck {
  used: number;
  limit: number;
  /** True when generating `projectId` would need a new slot and none is left. */
  blocked: boolean;
}

export function checkQuota(
  jobs: QuotaJobLike[],
  limit: number,
  projectId: string,
  now: Date,
  since: Date = monthStart(now),
): QuotaCheck {
  const counted = projectsCountedThisMonth(jobs, now, since);
  const used = counted.size;
  const needsNewSlot = !counted.has(projectId);
  return { used, limit, blocked: needsNewSlot && used >= limit };
}

/** `date` moved by whole calendar months, the day kept within the target month (31 Jan + 1 → end of Feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

/**
 * The periodEnd after a payment covering `months` more months: counted from the current end while
 * the subscription still runs, from today once it has ended, so a late payment never pays for days
 * that already passed.
 */
export function extendedPeriodEnd(periodEnd: Date, now: Date, months: number): Date {
  return addMonths(periodEnd > now ? periodEnd : now, months);
}

/**
 * Spec §1: a project's tier comes from the company's current plan, never from the request.
 * Companies without a subscription fall back to STANDARD.
 */
export async function companyProjectTier(companyId: string): Promise<'STANDARD' | 'PREMIUM'> {
  const subscription = await db.subscription.findUnique({ where: { companyId }, include: { plan: true } });
  return subscription?.plan.tier ?? 'STANDARD';
}

/**
 * Spec 2026-10-23 §2.1: the dossier's 3D view of the array on the roof is a Premium feature (later
 * also the paid 3D option of sponsored installers). Recorded on the project at creation, like its tier.
 */
export function tierIncludes3d(tier: 'STANDARD' | 'PREMIUM'): boolean {
  return tier === 'PREMIUM';
}
