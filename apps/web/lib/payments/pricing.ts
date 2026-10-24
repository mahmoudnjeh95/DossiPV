import { db } from '@dossipv/db';
import { audienceMismatchError } from '../plan-audience';
import { CheckoutError } from './types';

export const CHECKOUT_MONTHS = [1, 3, 6, 12] as const;
export type PaymentPurposeName = 'SUBSCRIPTION' | 'OPTION_3D';

export interface PriceBreakdown {
  htTnd: number;
  vatTnd: number;
  stampTnd: number;
  /** What the client pays: HT + VAT + stamp duty. */
  ttcTnd: number;
}

/**
 * HT = unit price × months, VAT = HT × rate, stamp duty fixed, TTC = their sum. Computed in whole
 * centimes: Payment.amountTnd and PaymentIntent.amountTnd store two decimals, so the amount charged,
 * recorded and invoiced is the same figure to the centime (not to the millime).
 */
export function computePrice(input: { unitPriceTnd: number; months: number; vatRatePct: number; stampDutyTnd: number }): PriceBreakdown {
  const htCents = Math.round(input.unitPriceTnd * 100) * input.months;
  const vatCents = Math.round((htCents * input.vatRatePct) / 100);
  const stampCents = Math.round(input.stampDutyTnd * 100);
  return {
    htTnd: htCents / 100,
    vatTnd: vatCents / 100,
    stampTnd: stampCents / 100,
    ttcTnd: (htCents + vatCents + stampCents) / 100,
  };
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
 * Why this company cannot buy this plan online (French), or null. A sponsored installer's Standard
 * is paid by its supplier: it may buy Premium (which ends the sponsoring) but not Standard. A
 * supplier can only renew the pack it holds.
 */
export function planPurchaseError(company: BuyerCompany, plan: PurchasablePlan, planId: string, currentPlanId: string | null): string | null {
  if (plan.archivedAt) return 'Ce plan n’est plus proposé : contactez DossiPV.';
  const mismatch = audienceMismatchError(company.kind, plan.audience);
  if (mismatch) return mismatch;
  if (plan.isTrial) return 'L’essai gratuit ne s’achète pas.';
  if (company.kind === 'SUPPLIER' && planId !== currentPlanId) return 'Un fournisseur ne peut renouveler en ligne que son pack actuel : contactez DossiPV pour changer de pack.';
  if (company.sponsored && plan.tier !== 'PREMIUM') return 'Votre plan Standard est offert par votre fournisseur : vous pouvez acheter Premium ou l’option 3D.';
  return null;
}

export interface PlatformPricing {
  vatRatePct: number;
  stampDutyTnd: number;
  option3dPriceTnd: number | null;
}

export async function loadPlatformPricing(): Promise<PlatformPricing> {
  const settings = await db.platformSettings.findUnique({ where: { id: 'singleton' } });
  return {
    vatRatePct: settings ? Number(settings.vatRatePct) : 19,
    stampDutyTnd: settings ? Number(settings.stampDutyTnd) : 1,
    option3dPriceTnd: settings?.option3dPriceTnd == null ? null : Number(settings.option3dPriceTnd),
  };
}

export interface PricedCheckout extends PriceBreakdown {
  purpose: PaymentPurposeName;
  planId: string | null;
  months: number;
  description: string;
}

/** Prices a purchase for a company, refusing (CheckoutError, French) what it cannot buy. */
export async function priceCheckout(
  companyId: string,
  input: { purpose: PaymentPurposeName; planId: string | null; months: number },
): Promise<PricedCheckout> {
  if (!(CHECKOUT_MONTHS as readonly number[]).includes(input.months)) throw new CheckoutError('Durée invalide : choisissez 1, 3, 6 ou 12 mois.');
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { kind: true, sponsorCompanyId: true, subscription: { select: { planId: true } } },
  });
  if (!company) throw new CheckoutError('Société introuvable.');
  const buyer: BuyerCompany = { kind: company.kind, sponsored: company.sponsorCompanyId !== null };
  const pricing = await loadPlatformPricing();

  if (input.purpose === 'OPTION_3D') {
    if (buyer.kind !== 'INSTALLER' || !buyer.sponsored) {
      throw new CheckoutError('L’option 3D est réservée aux installateurs parrainés : passez au plan Premium, qui inclut la 3D.');
    }
    if (pricing.option3dPriceTnd === null || pricing.option3dPriceTnd <= 0) {
      throw new CheckoutError('L’option 3D n’est pas encore en vente : contactez DossiPV.');
    }
    return {
      purpose: 'OPTION_3D',
      planId: null,
      months: input.months,
      description: `Option 3D DossiPV, ${input.months} mois`,
      ...computePrice({ unitPriceTnd: pricing.option3dPriceTnd, months: input.months, vatRatePct: pricing.vatRatePct, stampDutyTnd: pricing.stampDutyTnd }),
    };
  }

  const plan = input.planId ? await db.plan.findUnique({ where: { id: input.planId } }) : null;
  if (!plan) throw new CheckoutError('Plan introuvable.');
  const refusal = planPurchaseError(buyer, plan, plan.id, company.subscription?.planId ?? null);
  if (refusal) throw new CheckoutError(refusal);
  return {
    purpose: 'SUBSCRIPTION',
    planId: plan.id,
    months: input.months,
    description: `Abonnement DossiPV ${plan.name}, ${input.months} mois`,
    ...computePrice({ unitPriceTnd: Number(plan.priceTnd), months: input.months, vatRatePct: pricing.vatRatePct, stampDutyTnd: pricing.stampDutyTnd }),
  };
}
