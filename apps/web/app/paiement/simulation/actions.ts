'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../(app)/layout';
import { fakeReference, isFakeEnabled } from '../../../lib/payments/fake';

/** Development only (PAYMENTS_FAKE=1, never in production): picks the outcome of a simulated checkout. */
export async function simulatePaymentAction(intentId: string, outcome: 'paid' | 'failed'): Promise<void> {
  if (!isFakeEnabled()) redirect('/');
  const user = await requireAuthenticatedCompanyUser();
  await db.paymentIntent.updateMany({
    where: { id: intentId, companyId: user.companyId, status: 'PENDING' },
    data: { providerReference: fakeReference(outcome === 'paid' ? 'paid' : 'failed', intentId) },
  });
  redirect(`/paiement/retour?intent=${encodeURIComponent(intentId)}`);
}
