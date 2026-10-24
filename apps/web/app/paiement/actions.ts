'use server';

import { redirect } from 'next/navigation';
import type { PaymentMethod } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../(app)/layout';
import { startCheckout } from '../../lib/payments/checkout';
import { ONLINE_PROVIDER_IDS } from '../../lib/payments/registry';
import { CheckoutError } from '../../lib/payments/types';

export interface StartCheckoutState {
  error: string;
}

/**
 * Opens the online checkout of the signed-in company (installer or supplier) and sends the browser
 * to the provider. Only the company's owner pays; a super admin in a support session cannot.
 * Returns the French refusal when there is one.
 */
export async function startCheckoutAction(
  purpose: 'SUBSCRIPTION' | 'OPTION_3D',
  planId: string | null,
  months: number,
  provider: PaymentMethod,
): Promise<StartCheckoutState | undefined> {
  const user = await requireAuthenticatedCompanyUser();
  if (user.impersonatedBySuperAdminId) return { error: 'Mode support : le paiement en ligne est désactivé.' };
  if (user.role !== 'OWNER') return { error: 'Seul le responsable du compte peut payer l’abonnement.' };
  if (purpose !== 'SUBSCRIPTION' && purpose !== 'OPTION_3D') return { error: 'Achat inconnu.' };
  if (!(ONLINE_PROVIDER_IDS as readonly string[]).includes(provider)) return { error: 'Moyen de paiement inconnu.' };

  let checkoutUrl: string;
  try {
    ({ checkoutUrl } = await startCheckout(user.companyId, { purpose, planId: typeof planId === 'string' ? planId : null, months: Number(months), provider }));
  } catch (error) {
    if (error instanceof CheckoutError) return { error: error.message };
    throw error;
  }
  redirect(checkoutUrl);
}
