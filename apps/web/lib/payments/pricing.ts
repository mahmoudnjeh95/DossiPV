import { db } from '@dossipv/db';
import { audienceMismatchError } from '../plan-audience';
import { PaymentError } from './p2p';

export const CHECKOUT_MONTHS = [1, 3, 6, 12] as const;
export type PaymentPurposeName = 'SUBSCRIPTION' | 'OPTION_3D';

/**
 * Amount to pay in TND: unit price × months, no VAT and no stamp. Computed in whole centimes because
 * Payment.amountTnd and PaymentIntent.amountTnd store two decimals.
 */
export function computeAmount(unitPriceTnd: number, months: number): number {
  return (Math.round(unitPriceTnd * 100) * months) / 100;
}

export interface BuyerCompany {
  kind: 'INSTALLER' | 'SUPPLIER';
  sponsored: boolean;
}

export interface PurchasablePlan {
  tier: 'STANDARD' | 'PREMIUM';
  audience: 'INSTALLER' | 'SUPPLIER';
  archivedAt: Date | null;
  isTrial: boolean;
}

/**
 * Why this company cannot buy this plan (French), or null. A sponsored installer's Standard is paid
 * by its supplier: it may buy Premium (which ends the sponsoring) but not Standard. A supplier can
 * only renew the pack it holds.
 */
export function planPurchaseError(company: BuyerCompany, plan: PurchasablePlan, planId: string, currentPlanId: string | null): string | null {
  if (plan.archivedAt) return 'Ce plan n’est plus proposé : contactez SolarixPro.';
  const mismatch = audienceMismatchError(company.kind, plan.audience);
  if (mismatch) return mismatch;
  if (plan.isTrial) return 'L’essai gratuit ne s’achète pas.';
  if (company.kind === 'SUPPLIER' && planId !== currentPlanId) return 'Un fournisseur ne peut renouveler que son pack actuel : contactez SolarixPro pour changer de pack.';
  if (company.sponsored && plan.tier !== 'PREMIUM') return 'Votre plan Standard est offert par votre fournisseur : vous pouvez acheter Premium ou l’option 3D.';
  return null;
}

/** Monthly price of the 3D option in TND, or null while none is set. */
export async function loadOption3dPrice(): Promise<number | null> {
  const settings = await db.platformSettings.findUnique({ where: { id: 'singleton' } });
  return settings?.option3dPriceTnd == null ? null : Number(settings.option3dPriceTnd);
}

export interface PricedCheckout {
  purpose: PaymentPurposeName;
  planId: string | null;
  months: number;
  amountTnd: number;
}

/** Prices a purchase for a company, refusing (PaymentError, French) what it cannot buy. */
export async function priceCheckout(
  companyId: string,
  input: { purpose: PaymentPurposeName; planId: string | null; months: number },
): Promise<PricedCheckout> {
  if (!(CHECKOUT_MONTHS as readonly number[]).includes(input.months)) throw new PaymentError('Durée invalide : choisissez 1, 3, 6 ou 12 mois.');
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { kind: true, sponsorCompanyId: true, subscription: { select: { planId: true } } },
  });
  if (!company) throw new PaymentError('Société introuvable.');
  const buyer: BuyerCompany = { kind: company.kind, sponsored: company.sponsorCompanyId !== null };

  if (input.purpose === 'OPTION_3D') {
    if (buyer.kind !== 'INSTALLER' || !buyer.sponsored) {
      throw new PaymentError('L’option 3D est réservée aux installateurs parrainés : passez au plan Premium, qui inclut la 3D.');
    }
    const price = await loadOption3dPrice();
    if (price === null || price <= 0) throw new PaymentError('L’option 3D n’est pas encore en vente : contactez SolarixPro.');
    return { purpose: 'OPTION_3D', planId: null, months: input.months, amountTnd: computeAmount(price, input.months) };
  }

  const plan = input.planId ? await db.plan.findUnique({ where: { id: input.planId } }) : null;
  if (!plan) throw new PaymentError('Plan introuvable.');
  const refusal = planPurchaseError(buyer, plan, plan.id, company.subscription?.planId ?? null);
  if (refusal) throw new PaymentError(refusal);
  return { purpose: 'SUBSCRIPTION', planId: plan.id, months: input.months, amountTnd: computeAmount(Number(plan.priceTnd), input.months) };
}
