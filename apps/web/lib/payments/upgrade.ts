import { db } from '@dossipv/db';
import type { SubscriptionSummary } from '../subscription';
import { planHighlights } from './billing';

export interface PremiumUpgrade {
  planName: string;
  monthlyTnd: number;
  highlights: string[];
}

/**
 * The Premium offer shown on the home page to an installer paying for Standard (not the free trial,
 * which already has its own call to action). Null when there is nothing to push.
 */
export async function loadPremiumUpgrade(subscription: SubscriptionSummary | null): Promise<PremiumUpgrade | null> {
  if (!subscription || subscription.isTrial || subscription.tier !== 'STANDARD') return null;
  const plan = await db.plan.findFirst({
    where: { tier: 'PREMIUM', audience: 'INSTALLER', isTrial: false, archivedAt: null },
    orderBy: { priceTnd: 'asc' },
  });
  if (!plan) return null;
  return { planName: plan.name, monthlyTnd: Number(plan.priceTnd), highlights: planHighlights('PREMIUM', plan.monthlyDossierLimit) };
}
