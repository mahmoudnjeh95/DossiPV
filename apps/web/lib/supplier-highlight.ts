import { db } from '@dossipv/db';

/** A supplier cannot promote more than this many products at once (keeps the "Sponsorisé" slot meaningful). */
export const MAX_HIGHLIGHTED_PRODUCTS = 10;

export const NO_HIGHLIGHT_PACK_REASON = 'Votre pack n’inclut pas la mise en avant';
export const EXPIRED_SUBSCRIPTION_REASON = 'Abonnement expiré';

export type HighlightEligibility = { ok: true } | { ok: false; reason: string };

/**
 * Can this supplier highlight products right now? Its subscription must be active and not past its
 * end, and its pack must include highlighting (same rule as loadHighlightedProducts).
 */
export async function highlightEligibility(supplierId: string, now: Date = new Date()): Promise<HighlightEligibility> {
  const subscription = await db.subscription.findUnique({
    where: { companyId: supplierId },
    select: { status: true, periodEnd: true, plan: { select: { includesHighlight: true } } },
  });
  if (!subscription) return { ok: false, reason: NO_HIGHLIGHT_PACK_REASON };
  if (subscription.status !== 'ACTIVE' || subscription.periodEnd <= now) return { ok: false, reason: EXPIRED_SUBSCRIPTION_REASON };
  if (!subscription.plan.includesHighlight) return { ok: false, reason: NO_HIGHLIGHT_PACK_REASON };
  return { ok: true };
}
