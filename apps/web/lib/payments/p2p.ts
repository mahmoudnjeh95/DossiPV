import { db, type PaymentMethod } from '@dossipv/db';
import { PLATFORM_SETTINGS_ID } from '../platform-settings';

/**
 * Flouci, izi and D17 are used as person-to-person transfers: the installer sends the money from
 * its own app to the platform's number, then declares it with a screenshot that the admin checks.
 */
export const P2P_PROVIDER_IDS = ['FLOUCI', 'IZI', 'D17'] as const;
export type P2pProviderId = (typeof P2P_PROVIDER_IDS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MANUAL: 'Manuel',
  KONNECT: 'Konnect',
  FLOUCI: 'Flouci',
  IZI: 'izi',
  D17: 'D17',
};

/** How long the screenshot of a transfer stays in the database before the worker erases it. */
export const PROOF_RETENTION_DAYS = 30;
/** Largest screenshot accepted, before it is re-encoded. */
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
/** Intents a company can leave open (PENDING) at once. */
export const MAX_OPEN_INTENTS = 3;

export interface P2pSettings {
  accountHolder: string | null;
  numbers: Record<P2pProviderId, string | null>;
  instructions: string | null;
}

export interface OfferedProvider {
  id: P2pProviderId;
  label: string;
  number: string;
}

export async function loadP2pSettings(): Promise<P2pSettings> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return {
    accountHolder: settings?.p2pAccountHolder ?? null,
    numbers: { FLOUCI: settings?.p2pFlouciNumber ?? null, IZI: settings?.p2pIziNumber ?? null, D17: settings?.p2pD17Number ?? null },
    instructions: settings?.p2pInstructions ?? null,
  };
}

/** The providers with a number set: a provider without one is not offered. */
export function offeredProviders(settings: P2pSettings): OfferedProvider[] {
  return P2P_PROVIDER_IDS.flatMap((id) => {
    const number = settings.numbers[id]?.trim();
    return number ? [{ id, label: PAYMENT_METHOD_LABELS[id], number }] : [];
  });
}

/** The reference the payer writes in the transfer's comment: « DPV- » + 6 characters of the intent id. */
export function paymentReference(intentId: string): string {
  return `DPV-${intentId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Why this user cannot pay (French), or null: only the company's owner, never a support session. */
export function payerRefusal(user: { role: 'OWNER' | 'MEMBER'; impersonatedBySuperAdminId?: string | null }): string | null {
  if (user.impersonatedBySuperAdminId) return 'Mode support : le paiement est désactivé.';
  if (user.role !== 'OWNER') return 'Seul le responsable du compte peut payer l’abonnement.';
  return null;
}

export type IntentDisplayStatus = 'TO_DECLARE' | 'WAITING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export const INTENT_DISPLAY_LABELS: Record<IntentDisplayStatus, string> = {
  TO_DECLARE: 'À déclarer',
  WAITING: 'En attente de validation',
  CONFIRMED: 'Confirmé',
  REJECTED: 'Refusé',
  CANCELLED: 'Annulé',
};

export function intentDisplayStatus(intent: { status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'; declaredAt: Date | null }): IntentDisplayStatus {
  if (intent.status === 'PAID') return 'CONFIRMED';
  if (intent.status === 'FAILED') return 'REJECTED';
  if (intent.status === 'CANCELLED') return 'CANCELLED';
  return intent.declaredAt ? 'WAITING' : 'TO_DECLARE';
}

/** A refusal with a message fit for the user (French). */
export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}
