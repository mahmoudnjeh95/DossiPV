import { db, type Prisma } from '@dossipv/db';
import { issueInvoiceForPayment } from '../invoices';
import { unlinkInstaller } from '../sponsorship';
import { addMonths } from '../subscription';
import { extendOption3dUntil, periodExtensionData } from '../subscription-extension';
import { getProvider } from './registry';

export interface SettlementResult {
  status: 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'NOT_FOUND';
  /** Set when the provider could not be asked just now (the intent stays PENDING). */
  unreachable?: boolean;
}

type Tx = Prisma.TransactionClient;
type SettledIntent = { id: string; companyId: string; purpose: 'SUBSCRIPTION' | 'OPTION_3D'; planId: string | null; months: number };

/**
 * Gives the company what an intent paid for. Runs inside the settlement transaction.
 * SUBSCRIPTION: the same extension rule as the admin's payment (from the later of the period end and
 * now, by `months`), the plan changed when it differs, the status ACTIVE. A trial, or the suspended
 * row that only held a sponsored installer's 3D option, starts a fresh period from today instead.
 * Paying Premium ends a sponsored installer's sponsoring (spec 2026-10-23 §5.3).
 * OPTION_3D: extends `option3dUntil` from the later of its end and now.
 */
async function applyIntent(tx: Tx, intent: SettledIntent, now: Date): Promise<void> {
  if (intent.purpose === 'OPTION_3D') {
    const subscription = await tx.subscription.findUnique({ where: { companyId: intent.companyId }, select: { option3dUntil: true } });
    await extendOption3dUntil(tx, intent.companyId, intent.months, now, subscription?.option3dUntil, subscription !== null);
    return;
  }
  const [subscription, company, plan] = await Promise.all([
    tx.subscription.findUnique({ where: { companyId: intent.companyId }, include: { plan: true } }),
    tx.company.findUnique({ where: { id: intent.companyId }, select: { sponsorCompanyId: true } }),
    tx.plan.findUnique({ where: { id: intent.planId ?? '' } }),
  ]);
  if (!plan) throw new Error(`Plan ${intent.planId} introuvable pour l’intention ${intent.id}`);
  const sponsored = company?.sponsorCompanyId != null;
  const leavesSponsor = sponsored && plan.tier === 'PREMIUM';

  if (!subscription) {
    await tx.subscription.create({
      data: { companyId: intent.companyId, planId: plan.id, status: 'ACTIVE', periodStart: now, periodEnd: addMonths(now, intent.months) },
    });
  } else if (subscription.plan.isTrial || (sponsored && subscription.status === 'SUSPENDED')) {
    await tx.subscription.update({
      where: { companyId: intent.companyId },
      data: { planId: plan.id, status: 'ACTIVE', periodStart: now, periodEnd: addMonths(now, intent.months) },
    });
  } else {
    await tx.subscription.update({
      where: { companyId: intent.companyId },
      data: { ...periodExtensionData(subscription, now, intent.months, 'always'), ...(subscription.planId !== plan.id ? { planId: plan.id } : {}) },
    });
  }
  if (leavesSponsor) {
    await unlinkInstaller(intent.companyId, tx);
    await tx.subscription.updateMany({ where: { companyId: intent.companyId }, data: { option3dUntil: null } });
  }
}

/**
 * Settles an online payment, at most once. It never trusts the browser or the webhook body: it asks
 * the provider for the status. When PAID, one transaction marks the intent PAID (a conditional update
 * on PENDING, so two concurrent calls settle once), records the Payment and gives the company what
 * it bought. The invoice is issued afterwards and a failure there never undoes the settlement.
 */
export async function settlePaymentIntent(intentId: string, now: Date = new Date()): Promise<SettlementResult> {
  const intent = await db.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) return { status: 'NOT_FOUND' };
  if (intent.status !== 'PENDING') return { status: intent.status };

  const provider = getProvider(intent.provider);
  if (!provider || !intent.providerReference) return { status: 'PENDING' };

  let verified: Awaited<ReturnType<typeof provider.verify>>;
  try {
    verified = await provider.verify(intent.providerReference);
  } catch (error) {
    console.error(`payments: verify failed for intent ${intent.id}`, error);
    return { status: 'PENDING', unreachable: true };
  }

  if (verified === 'PENDING') return { status: 'PENDING' };
  if (verified === 'FAILED') {
    await db.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: 'Paiement refusé, annulé ou expiré chez le fournisseur.' },
    });
    const current = await db.paymentIntent.findUnique({ where: { id: intent.id }, select: { status: true } });
    return { status: current?.status ?? 'FAILED' };
  }

  const paymentId = await db.$transaction(async (tx) => {
    const claimed = await tx.paymentIntent.updateMany({ where: { id: intent.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: now } });
    if (claimed.count !== 1) return null; // another call settled it first
    const payment = await tx.payment.create({
      data: {
        companyId: intent.companyId,
        amountTnd: intent.amountTnd,
        method: intent.provider,
        gatewayReference: intent.providerReference,
        recordedByAdmin: false,
      },
    });
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { paymentId: payment.id } });
    await applyIntent(tx, intent, now);
    return payment.id;
  });

  if (paymentId !== null) {
    try {
      await issueInvoiceForPayment(paymentId);
    } catch (error) {
      console.error(`payments: invoice for payment ${paymentId} not issued`, error);
    }
  }
  return { status: 'PAID' };
}
