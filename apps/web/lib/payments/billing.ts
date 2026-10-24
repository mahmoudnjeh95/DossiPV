import { db } from '@dossipv/db';
import { loadEffectiveSubscription } from '../sponsorship';
import { summarizeSubscription, type SubscriptionSummary } from '../subscription';
import { CHECKOUT_MONTHS, computePrice, loadPlatformPricing, planPurchaseError, type PaymentPurposeName, type PriceBreakdown } from './pricing';
import { listProviders, type ProviderListing } from './registry';

export interface OfferOption extends PriceBreakdown {
  months: number;
}

/** One thing the company can buy online, with its price for each duration. */
export interface BillingOffer {
  key: string;
  purpose: PaymentPurposeName;
  planId: string | null;
  title: string;
  buttonLabel: string;
  note: string | null;
  /** Monthly price excluding VAT. */
  monthlyHtTnd: number;
  options: OfferOption[];
}

export interface BillingPayment {
  id: string;
  createdAt: Date;
  amountTnd: number;
  method: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface BillingPendingIntent {
  id: string;
  createdAt: Date;
  amountTnd: number;
  provider: string;
}

export interface BillingView {
  kind: 'INSTALLER' | 'SUPPLIER';
  sponsored: boolean;
  subscription: SubscriptionSummary | null;
  option3dUntil: Date | null;
  offers: BillingOffer[];
  providers: ProviderListing[];
  payments: BillingPayment[];
  pendingIntents: BillingPendingIntent[];
  vatRatePct: number;
  stampDutyTnd: number;
}

/** Intents opened in the last day and not settled yet: the ones worth re-checking by hand. */
const PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAYMENT_ROWS = 20;

/** Everything the billing page (installer or supplier) shows for a company. */
export async function loadBilling(companyId: string, now: Date = new Date()): Promise<BillingView> {
  const [company, effective, pricing, plans] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { kind: true, sponsorCompanyId: true, subscription: { select: { planId: true } } },
    }),
    loadEffectiveSubscription(companyId),
    loadPlatformPricing(),
    db.plan.findMany({ where: { archivedAt: null, isTrial: false }, orderBy: { priceTnd: 'asc' } }),
  ]);
  if (!company) throw new Error(`Société ${companyId} introuvable`);
  const buyer = { kind: company.kind, sponsored: company.sponsorCompanyId !== null };
  const currentPlanId = company.subscription?.planId ?? null;

  const priceFor = (unitPriceTnd: number): OfferOption[] =>
    CHECKOUT_MONTHS.map((months) => ({ months, ...computePrice({ unitPriceTnd, months, vatRatePct: pricing.vatRatePct, stampDutyTnd: pricing.stampDutyTnd }) }));

  const offers: BillingOffer[] = [];
  for (const plan of plans) {
    if (planPurchaseError(buyer, plan, plan.id, currentPlanId) !== null) continue;
    const isCurrent = plan.id === currentPlanId;
    const unit = Number(plan.priceTnd);
    offers.push({
      key: `plan-${plan.id}`,
      purpose: 'SUBSCRIPTION',
      planId: plan.id,
      title: plan.name,
      buttonLabel: isCurrent ? 'Renouveler' : plan.tier === 'PREMIUM' ? 'Passer à Premium' : 'Passer à Standard',
      note: buyer.sponsored ? 'Vous quittez le parrainage de votre fournisseur : vos panneaux et onduleurs ne sont plus limités.' : null,
      monthlyHtTnd: unit,
      options: priceFor(unit),
    });
  }
  // The current plan first, then the others by price.
  offers.sort((a, b) => Number(b.planId === currentPlanId) - Number(a.planId === currentPlanId));
  if (buyer.kind === 'INSTALLER' && buyer.sponsored && pricing.option3dPriceTnd !== null && pricing.option3dPriceTnd > 0) {
    offers.push({
      key: 'option-3d',
      purpose: 'OPTION_3D',
      planId: null,
      title: 'Option 3D',
      buttonLabel: 'Acheter l’option 3D',
      note: 'La vue 3D du champ sur le toit dans vos dossiers, en plus du Standard offert par votre fournisseur.',
      monthlyHtTnd: pricing.option3dPriceTnd,
      options: priceFor(pricing.option3dPriceTnd),
    });
  }

  const [payments, pendingIntents] = await Promise.all([
    db.payment.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: PAYMENT_ROWS, include: { invoice: { select: { id: true, number: true } } } }),
    db.paymentIntent.findMany({
      where: { companyId, status: 'PENDING', providerReference: { not: null }, createdAt: { gt: new Date(now.getTime() - PENDING_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    kind: company.kind,
    sponsored: buyer.sponsored,
    subscription: summarizeSubscription(effective, now),
    option3dUntil: effective?.option3dUntil ?? null,
    offers,
    providers: listProviders(),
    payments: payments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      amountTnd: Number(p.amountTnd),
      method: p.method,
      invoiceId: p.invoice?.id ?? null,
      invoiceNumber: p.invoice?.number ?? null,
    })),
    pendingIntents: pendingIntents.map((i) => ({ id: i.id, createdAt: i.createdAt, amountTnd: Number(i.amountTnd), provider: i.provider })),
    vatRatePct: pricing.vatRatePct,
    stampDutyTnd: pricing.stampDutyTnd,
  };
}
