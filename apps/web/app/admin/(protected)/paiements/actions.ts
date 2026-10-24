'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { postAdminMessage } from '../../../../lib/payments/chat';
import { withNotice } from '../../../../lib/admin-notice';
import { approveIntent, rejectIntent } from '../../../../lib/payments/approve';

export interface PaymentDecisionState {
  error?: string;
}

/** Confirms a declared P2P payment: records it and extends the subscription, once. */
export async function approvePaymentAction(intentId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();
  const result = await approveIntent(intentId, admin.id);
  revalidatePath('/admin/paiements');
  redirect(result.ok ? withNotice('/admin/paiements', 'paymentApproved') : `/admin/paiements/${intentId}`);
}

/** The admin writes in the chat of a payment; the payer sees it as "SolarixPro". Nothing sensitive to audit. */
export async function sendAdminPaymentMessageAction(intentId: string, formData: FormData): Promise<PaymentDecisionState | undefined> {
  await requireAuthenticatedSuperAdmin();
  const result = await postAdminMessage(intentId, formData.get('body'));
  return result.ok ? undefined : { error: result.error };
}

/** Rejects a declared P2P payment with the reason the payer will read. */
export async function rejectPaymentAction(
  intentId: string,
  _prevState: PaymentDecisionState | undefined,
  formData: FormData,
): Promise<PaymentDecisionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();
  const reason = formData.get('reason');
  const result = await rejectIntent(intentId, admin.id, typeof reason === 'string' ? reason : '');
  if (!result.ok) return { error: result.error };
  revalidatePath('/admin/paiements');
  redirect(withNotice('/admin/paiements', 'paymentRejected'));
}
