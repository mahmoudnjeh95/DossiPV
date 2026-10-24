'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuthenticatedCompanyUser } from '../(app)/layout';
import { postCompanyMessage } from '../../lib/payments/chat';
import { cancelIntent, createIntent, declareIntent } from '../../lib/payments/intents';
import { P2P_PROVIDER_IDS, PaymentError, payerRefusal, type P2pProviderId } from '../../lib/payments/p2p';

export interface PaymentActionState {
  error?: string;
  saved?: boolean;
}

/**
 * Opens a payment of the signed-in company (installer or supplier) and sends the browser to its
 * payment page. Only the company's owner pays; a super admin in a support session cannot.
 * Returns the French refusal when there is one.
 */
export async function createIntentAction(
  purpose: 'SUBSCRIPTION' | 'OPTION_3D',
  planId: string | null,
  months: number,
  provider: string,
): Promise<PaymentActionState | undefined> {
  const user = await requireAuthenticatedCompanyUser();
  const refusal = payerRefusal(user);
  if (refusal) return { error: refusal };
  if (purpose !== 'SUBSCRIPTION' && purpose !== 'OPTION_3D') return { error: 'Achat inconnu.' };
  if (!(P2P_PROVIDER_IDS as readonly string[]).includes(provider)) return { error: 'Moyen de paiement inconnu.' };

  let intentId: string;
  try {
    ({ intentId } = await createIntent(user.companyId, { purpose, planId: typeof planId === 'string' ? planId : null, months: Number(months), provider: provider as P2pProviderId }));
  } catch (error) {
    if (error instanceof PaymentError) return { error: error.message };
    throw error;
  }
  redirect(`/paiement/${intentId}`);
}

/** The payer declares the transfer: screenshot and sender number or reference. Can be repeated until the admin decides. */
export async function declareIntentAction(
  intentId: string,
  _prevState: PaymentActionState | undefined,
  formData: FormData,
): Promise<PaymentActionState | undefined> {
  const user = await requireAuthenticatedCompanyUser();
  const refusal = payerRefusal(user);
  if (refusal) return { error: refusal };

  const field = formData.get('proof');
  const reference = formData.get('reference');
  const file = field instanceof File && field.size > 0 ? { buffer: Buffer.from(await field.arrayBuffer()), type: field.type, size: field.size } : null;
  try {
    await declareIntent(user.companyId, intentId, { file, reference: typeof reference === 'string' ? reference : '' });
  } catch (error) {
    if (error instanceof PaymentError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/paiement/${intentId}`);
  revalidatePath('/facturation');
  revalidatePath('/fournisseur/facturation');
  return { saved: true };
}

/**
 * The payer writes in the chat of one of its payments. Only the company's owner, never a support
 * session; a payment of another company answers "introuvable". The panel refreshes itself after.
 */
export async function sendPaymentMessageAction(intentId: string, formData: FormData): Promise<PaymentActionState | undefined> {
  const user = await requireAuthenticatedCompanyUser();
  const result = await postCompanyMessage(user, intentId, formData.get('body'));
  return result.ok ? { saved: true } : { error: result.error };
}

/** The payer cancels its own open payment. */
export async function cancelIntentAction(intentId: string): Promise<void> {
  const user = await requireAuthenticatedCompanyUser();
  if (payerRefusal(user)) return;
  try {
    await cancelIntent(user.companyId, intentId);
  } catch (error) {
    if (!(error instanceof PaymentError)) throw error;
  }
  revalidatePath(`/paiement/${intentId}`);
  redirect(`/paiement/${intentId}`);
}
