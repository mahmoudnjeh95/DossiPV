import type { db } from '@dossipv/db';
import { extendedPeriodEnd } from './subscription';

/** The database or a transaction of it: the extension rules run in either. */
export type SubscriptionClient = Pick<typeof db, 'subscription' | 'plan'>;

/**
 * The single rule for moving a subscription's end after a payment, shared by the admin's manual
 * payment and the online settlement: counted from the current end while it still runs, from today
 * once it has ended. `reactivate` says which stored statuses become ACTIVE again: the admin form
 * only revives an EXPIRED row (a suspension stays until the admin lifts it); a payment settled
 * online makes the subscription ACTIVE.
 */
export function periodExtensionData(
  subscription: { periodEnd: Date; status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' },
  now: Date,
  months: number,
  reactivate: 'expired' | 'always',
): { periodEnd: Date; status?: 'ACTIVE' } {
  const periodEnd = extendedPeriodEnd(subscription.periodEnd, now, months);
  const revive = reactivate === 'always' ? subscription.status !== 'ACTIVE' : subscription.status === 'EXPIRED';
  return { periodEnd, ...(revive ? { status: 'ACTIVE' as const } : {}) };
}

/**
 * Extends the 3D option (spec 2026-10-23 §2.1) of a sponsored installer by `months`, counted from
 * the current end of the option while it still runs, from today otherwise. The option lives on the
 * Subscription row; a sponsored installer normally has none, so a SUSPENDED Standard installer row
 * is created to hold the date (a suspended row never grants generation, quota or 3D by itself and
 * the expiry reminders skip it). Throws a French message when there is no Standard plan to use.
 */
export async function extendOption3dUntil(
  client: SubscriptionClient,
  companyId: string,
  months: number,
  now: Date,
  current: Date | null | undefined,
  hasSubscription: boolean,
): Promise<Date> {
  const option3dUntil = extendedPeriodEnd(current ?? now, now, months);
  if (hasSubscription) {
    await client.subscription.update({ where: { companyId }, data: { option3dUntil } });
    return option3dUntil;
  }
  const standard = await client.plan.findFirst({
    where: { audience: 'INSTALLER', tier: 'STANDARD', isTrial: false },
    orderBy: { createdAt: 'asc' },
  });
  if (!standard) {
    throw new Error('Aucun plan Standard installateur : créez-le dans Plans avant de vendre l’option 3D.');
  }
  await client.subscription.create({
    data: { companyId, planId: standard.id, status: 'SUSPENDED', periodStart: now, periodEnd: option3dUntil, option3dUntil },
  });
  return option3dUntil;
}
