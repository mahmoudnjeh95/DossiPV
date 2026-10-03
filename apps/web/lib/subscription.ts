/**
 * Pure helpers for the installer-facing subscription banner and quota — no I/O, so they can be
 * unit tested directly and reused by the dashboard, the project overview and the generate action.
 */
export interface SubscriptionLike {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  periodEnd: Date;
  plan: { name: string; monthlyDossierLimit: number; tier: 'STANDARD' | 'PREMIUM' };
}

export interface SubscriptionSummary {
  planName: string;
  tier: 'STANDARD' | 'PREMIUM';
  monthlyDossierLimit: number;
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
 * Spec §5 quota rule: one project counts once against the monthly limit however many times it
 * is regenerated, and a FAILED job never consumes quota. Returns the set of project ids that
 * already consumed a slot this month.
 */
export function projectsCountedThisMonth(jobs: QuotaJobLike[], now: Date): Set<string> {
  const start = monthStart(now);
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

export function checkQuota(jobs: QuotaJobLike[], limit: number, projectId: string, now: Date): QuotaCheck {
  const counted = projectsCountedThisMonth(jobs, now);
  const used = counted.size;
  const needsNewSlot = !counted.has(projectId);
  return { used, limit, blocked: needsNewSlot && used >= limit };
}
