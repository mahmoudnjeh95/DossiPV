import type { PaymentMethod } from '@dossipv/db';
import { fakeProvider, isFakeEnabled } from './fake';
import { flouciProvider } from './flouci';
import type { PaymentProvider } from './types';

/**
 * The online providers offered to clients. Flouci is implemented against its official API docs.
 * izi and D17 publish no merchant API documentation we could verify (docs/runbooks/online-payments.md),
 * so they are listed as « non configuré » and never called. Konnect is not offered.
 */
const IMPLEMENTED: Partial<Record<PaymentMethod, PaymentProvider>> = { FLOUCI: flouciProvider };

export const ONLINE_PROVIDER_IDS = ['FLOUCI', 'IZI', 'D17'] as const satisfies readonly PaymentMethod[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MANUAL: 'Manuel',
  KONNECT: 'Konnect',
  FLOUCI: 'Flouci',
  IZI: 'izi',
  D17: 'D17',
};

/** The provider that serves `id`, or null when none is implemented (fake stands in for Flouci in development). */
export function getProvider(id: PaymentMethod): PaymentProvider | null {
  if (id === 'FLOUCI' && isFakeEnabled()) return fakeProvider;
  return IMPLEMENTED[id] ?? null;
}

/** Same as `getProvider` but only when its credentials are set. */
export function getEnabledProvider(id: PaymentMethod): PaymentProvider | null {
  const provider = getProvider(id);
  return provider?.isEnabled() ? provider : null;
}

export interface ProviderListing {
  id: PaymentMethod;
  label: string;
  enabled: boolean;
}

/** Every online provider with whether it can be used now (disabled ones are shown as « non configuré »). */
export function listProviders(): ProviderListing[] {
  return ONLINE_PROVIDER_IDS.map((id) => {
    const provider = getProvider(id);
    return { id, label: provider?.label ?? PAYMENT_METHOD_LABELS[id], enabled: provider?.isEnabled() ?? false };
  });
}

/** `flouci` (URL segment) to FLOUCI; null for anything that is not an online provider. */
export function providerFromSlug(slug: string): PaymentMethod | null {
  return ONLINE_PROVIDER_IDS.find((id) => id.toLowerCase() === slug.toLowerCase()) ?? null;
}
