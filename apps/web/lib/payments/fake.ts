import type { CreateCheckoutInput, CreatedCheckout, PaymentProvider, ProviderPaymentStatus } from './types';

/**
 * Development-only provider that needs no network: its checkout page is /paiement/simulation, where
 * a button picks the outcome. The outcome is carried by the provider reference itself
 * (`fake-<outcome>-<intentId>`), which the simulation page rewrites on the intent. It stands in
 * for FLOUCI when PAYMENTS_FAKE=1 and is NEVER active in production, whatever the variable says.
 */
export function isFakeEnabled(): boolean {
  return process.env.PAYMENTS_FAKE === '1' && process.env.NODE_ENV !== 'production';
}

export const fakeReference = (outcome: 'pending' | 'paid' | 'failed', intentId: string): string => `fake-${outcome}-${intentId}`;

export const fakeProvider: PaymentProvider = {
  id: 'FLOUCI',
  label: 'Flouci (simulation)',
  isEnabled: isFakeEnabled,

  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    if (!isFakeEnabled()) return Promise.reject(new Error('Le paiement simulé est désactivé'));
    return Promise.resolve({ providerReference: fakeReference('pending', input.intentId), checkoutUrl: `/paiement/simulation?intent=${encodeURIComponent(input.intentId)}` });
  },

  verify(providerReference: string): Promise<ProviderPaymentStatus> {
    if (!isFakeEnabled()) return Promise.reject(new Error('Le paiement simulé est désactivé'));
    if (providerReference.startsWith('fake-paid-')) return Promise.resolve('PAID');
    if (providerReference.startsWith('fake-failed-')) return Promise.resolve('FAILED');
    return Promise.resolve('PENDING');
  },
};
