import { db, type Prisma } from '@dossipv/db';
import { logAdminAction } from '../admin-audit';
import { unlinkInstaller } from '../sponsorship';
import { addMonths } from '../subscription';
import { extendOption3dUntil, periodExtensionData } from '../subscription-extension';
import { PAYMENT_METHOD_LABELS, paymentReference } from './p2p';

type Tx = Prisma.TransactionClient;
type SettledIntent = { id: string; companyId: string; purpose: 'SUBSCRIPTION' | 'OPTION_3D'; planId: string | null; months: number };

export type DecisionResult = { ok: true } | { ok: false; error: string };

/**
 * Gives the company what an intent paid for. Runs inside the approval transaction.
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
 * The admin confirms a declared P2P payment, at most once. One transaction marks the intent PAID
 * (a conditional update on PENDING, so two concurrent approvals settle once), records the Payment
 * and gives the company what it bought. The screenshot is never read here.
 */
export async function approveIntent(intentId: string, adminId: string, now: Date = new Date()): Promise<DecisionResult> {
  const intent = await db.paymentIntent.findUnique({
    where: { id: intentId },
    select: { id: true, companyId: true, purpose: true, planId: true, months: true, amountTnd: true, provider: true, providerReference: true, status: true, declaredAt: true },
  });
  if (!intent) return { ok: false, error: 'Paiement introuvable.' };
  if (intent.status !== 'PENDING') return { ok: false, error: 'Ce paiement est déjà traité.' };
  if (!intent.declaredAt) return { ok: false, error: 'Le client n’a pas encore déclaré ce paiement.' };

  const settled = await db.$transaction(async (tx) => {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING', declaredAt: { not: null } },
      data: { status: 'PAID', paidAt: now },
    });
    if (claimed.count !== 1) return false; // another call decided it first
    const payment = await tx.payment.create({
      data: {
        companyId: intent.companyId,
        amountTnd: intent.amountTnd,
        method: intent.provider,
        gatewayReference: intent.providerReference,
        note: `Paiement P2P ${PAYMENT_METHOD_LABELS[intent.provider]}, référence ${paymentReference(intent.id)}`,
        recordedByAdmin: true,
      },
    });
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { paymentId: payment.id } });
    await applyIntent(tx, intent, now);
    return true;
  });
  if (!settled) return { ok: false, error: 'Ce paiement est déjà traité.' };

  await logAdminAction(adminId, 'payment.p2pApprove', intent.companyId, {
    intentId: intent.id,
    amountTnd: Number(intent.amountTnd),
    method: intent.provider,
    months: intent.months,
  });
  return { ok: true };
}

/** The admin rejects a declared P2P payment, with the reason the payer will read. */
export async function rejectIntent(intentId: string, adminId: string, reason: string): Promise<DecisionResult> {
  const trimmed = reason.trim();
  if (trimmed === '') return { ok: false, error: 'Indiquez le motif du refus.' };
  if (trimmed.length > 300) return { ok: false, error: 'Motif trop long (300 caractères au plus).' };
  const result = await db.paymentIntent.updateMany({
    where: { id: intentId, status: 'PENDING' },
    data: { status: 'FAILED', failureReason: trimmed },
  });
  if (result.count !== 1) return { ok: false, error: 'Ce paiement est déjà traité ou introuvable.' };
  const intent = await db.paymentIntent.findUnique({ where: { id: intentId }, select: { companyId: true, amountTnd: true, provider: true } });
  await logAdminAction(adminId, 'payment.p2pReject', intent?.companyId ?? null, {
    intentId,
    amountTnd: intent ? Number(intent.amountTnd) : 0,
    method: intent?.provider ?? '',
    reason: trimmed,
  });
  return { ok: true };
}
