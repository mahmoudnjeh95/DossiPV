'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';

export interface RecordPaymentActionState {
  error: string;
}

export async function suspendSubscriptionAction(companyId: string): Promise<void> {
  await db.subscription.update({ where: { companyId }, data: { status: 'SUSPENDED' } });
  redirect(`/admin/installers/${companyId}`);
}

export async function activateSubscriptionAction(companyId: string): Promise<void> {
  await db.subscription.update({ where: { companyId }, data: { status: 'ACTIVE' } });
  redirect(`/admin/installers/${companyId}`);
}

export async function recordPaymentAction(
  companyId: string,
  _prevState: RecordPaymentActionState | undefined,
  formData: FormData,
): Promise<RecordPaymentActionState | undefined> {
  const amountField = formData.get('amountTnd');
  const methodField = formData.get('method');
  const noteField = formData.get('note');

  if (typeof amountField !== 'string' || typeof methodField !== 'string') {
    return { error: 'Montant invalide.' };
  }

  const amountTnd = Number(amountField);
  if (!Number.isFinite(amountTnd) || amountTnd <= 0) {
    return { error: 'Montant invalide.' };
  }

  await db.payment.create({
    data: {
      companyId,
      amountTnd,
      method: methodField as 'MANUAL' | 'KONNECT',
      note: typeof noteField === 'string' && noteField.length > 0 ? noteField : null,
      recordedByAdmin: true,
    },
  });

  redirect(`/admin/installers/${companyId}`);
}

export async function updatePeriodEndAction(companyId: string, formData: FormData): Promise<void> {
  const periodEndField = formData.get('periodEnd');

  if (typeof periodEndField !== 'string') {
    redirect(`/admin/installers/${companyId}`);
    return;
  }

  await db.subscription.update({ where: { companyId }, data: { periodEnd: new Date(periodEndField) } });
  redirect(`/admin/installers/${companyId}`);
}
