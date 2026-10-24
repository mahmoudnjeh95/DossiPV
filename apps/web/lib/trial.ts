import { adminEmailAddress } from '@dossipv/email';
import type { SubscriptionSummary } from './subscription';

/** Spec 2026-10-23 §7: each bill import is a paid Claude call, so the trial gets a fixed number in total. */
export const TRIAL_BILL_IMPORT_LIMIT = 10;

/** « contactez DossiPV », with the admin address when one is configured. */
export function contactDossipv(): string {
  const email = adminEmailAddress();
  return email ? `contactez DossiPV (${email})` : 'contactez DossiPV';
}

export function trialQuotaMessage(limit: number): string {
  return `Essai gratuit terminé (${limit} dossiers utilisés) : ${contactDossipv()} pour passer à un abonnement.`;
}

export function trialBillImportLimitMessage(): string {
  return `Limite de ${TRIAL_BILL_IMPORT_LIMIT} factures importées pendant l'essai atteinte : ${contactDossipv()} pour passer à un abonnement.`;
}

export function trialExpiredMessage(): string {
  return `Essai gratuit expiré : ${contactDossipv()} pour passer à un abonnement.`;
}

/** Why an inactive subscription refuses `action` ("génération" or "import de facture"). */
export function inactiveSubscriptionMessage(subscription: SubscriptionSummary | null, action: string): string {
  if (subscription?.isTrial && subscription.effectiveStatus === 'EXPIRED') {
    return trialExpiredMessage();
  }
  return `Votre abonnement n'est pas actif : ${action} impossible.`;
}

/** Dossiers a trial still allows, never below zero. */
export function trialDossiersLeft(limit: number, used: number): number {
  return Math.max(0, limit - used);
}
