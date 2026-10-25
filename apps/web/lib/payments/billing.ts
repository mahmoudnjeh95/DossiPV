import { db } from '@dossipv/db';
import { loadEffectiveSubscription } from '../sponsorship';
import { summarizeSubscription, type SubscriptionSummary } from '../subscription';
import { unreadForCompany } from './chat';
import { intentDisplayStatus, loadP2pSettings, offeredProviders, paymentReference, type IntentDisplayStatus, type OfferedProvider } from './p2p';
import { CHECKOUT_MONTHS, computeAmount, loadOption3dPrice, planPurchaseError, type PaymentPurposeName } from './pricing';

export interface OfferOption {
  months: number;
  amountTnd: number;
}

/** One thing the company can buy, with its amount for each duration. */
export interface BillingOffer {
  key: string;
  purpose: PaymentPurposeName;
  planId: string | null;
  title: string;
  buttonLabel: string;
  note: string | null;
  /** What the plan includes, one short line each. */
  highlights: string[];
  /** The plan the company holds now (the offer is a renewal). */
  isCurrent: boolean;
  /** Plan tier, null for the 3D option. */
  tier: 'STANDARD' | 'PREMIUM' | null;
  monthlyTnd: number;
  options: OfferOption[];
}

export interface BillingPayment {
  id: string;
  createdAt: Date;
  amountTnd: number;
  method: string;
}

export interface BillingIntent {
  id: string;
  createdAt: Date;
  amountTnd: number;
  provider: string;
  months: number;
  reference: string;
  status: IntentDisplayStatus;
  failureReason: string | null;
  hasProof: boolean;
  /** Messages from SolarixPro the payer has not read yet. */
  unreadMessages: number;
}

export interface BillingView {
  kind: 'INSTALLER' | 'SUPPLIER';
  sponsored: boolean;
  subscription: SubscriptionSummary | null;
  option3dUntil: Date | null;
  offers: BillingOffer[];
  providers: OfferedProvider[];
  payments: BillingPayment[];
  intents: BillingIntent[];
}

/** The lines under a plan's price: its dossier quota and what Premium adds. */
export function planHighlights(tier: 'STANDARD' | 'PREMIUM', monthlyDossierLimit: number): string[] {
  const quota = `${monthlyDossierLimit} dossier${monthlyDossierLimit > 1 ? 's' : ''} par mois`;
  return tier === 'PREMIUM' ? [quota, 'Vue 3D du champ sur le toit', 'Contour du toit et remplissage automatique des panneaux'] : [quota];
}

const PAYMENT_ROWS = 20;
const INTENT_ROWS = 10;

/** Everything the « Abonnement et paiement » page (installer or supplier) shows for a company. */
export async function loadBilling(companyId: string, now: Date = new Date()): Promise<BillingView> {
  const [company, effective, option3dPrice, plans, p2p] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { kind: true, sponsorCompanyId: true, subscription: { select: { planId: true } } },
    }),
    loadEffectiveSubscription(companyId),
    loadOption3dPrice(),
    db.plan.findMany({ where: { archivedAt: null, isTrial: false }, orderBy: { priceTnd: 'asc' } }),
    loadP2pSettings(),
  ]);
  if (!company) throw new Error(`Société ${companyId} introuvable`);
  const buyer = { kind: company.kind, sponsored: company.sponsorCompanyId !== null };
  const currentPlanId = company.subscription?.planId ?? null;

  const optionsFor = (unitPriceTnd: number): OfferOption[] =>
    CHECKOUT_MONTHS.map((months) => ({ months, amountTnd: computeAmount(unitPriceTnd, months) }));

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
      highlights: planHighlights(plan.tier, plan.monthlyDossierLimit),
      isCurrent,
      tier: plan.tier,
      note: buyer.sponsored && plan.tier === 'PREMIUM' ? 'Vous quittez le parrainage de votre fournisseur : vos panneaux et onduleurs ne sont plus limités.' : null,
      monthlyTnd: unit,
      options: optionsFor(unit),
    });
  }
  // The current plan first, then the others by price.
  offers.sort((a, b) => Number(b.planId === currentPlanId) - Number(a.planId === currentPlanId));
  if (buyer.kind === 'INSTALLER' && buyer.sponsored && option3dPrice !== null && option3dPrice > 0) {
    offers.push({
      key: 'option-3d',
      purpose: 'OPTION_3D',
      planId: null,
      title: 'Option 3D',
      buttonLabel: 'Acheter l’option 3D',
      note: 'La vue 3D du champ sur le toit dans vos dossiers, en plus du Standard offert par votre fournisseur.',
      highlights: [],
      isCurrent: false,
      tier: null,
      monthlyTnd: option3dPrice,
      options: optionsFor(option3dPrice),
    });
  }

  // The screenshot itself is never selected here: only the capture routes read it.
  const [payments, intents, unread] = await Promise.all([
    db.payment.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: PAYMENT_ROWS }),
    db.paymentIntent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: INTENT_ROWS,
      select: { id: true, createdAt: true, amountTnd: true, provider: true, months: true, status: true, declaredAt: true, failureReason: true, proofMime: true },
    }),
    unreadForCompany(companyId),
  ]);

  return {
    kind: company.kind,
    sponsored: buyer.sponsored,
    subscription: summarizeSubscription(effective, now),
    option3dUntil: effective?.option3dUntil ?? null,
    offers,
    providers: offeredProviders(p2p),
    payments: payments.map((p) => ({ id: p.id, createdAt: p.createdAt, amountTnd: Number(p.amountTnd), method: p.method })),
    intents: intents.map((i) => ({
      id: i.id,
      createdAt: i.createdAt,
      amountTnd: Number(i.amountTnd),
      provider: i.provider,
      months: i.months,
      reference: paymentReference(i.id),
      status: intentDisplayStatus(i),
      failureReason: i.failureReason,
      hasProof: i.proofMime !== null,
      unreadMessages: unread.get(i.id) ?? 0,
    })),
  };
}
