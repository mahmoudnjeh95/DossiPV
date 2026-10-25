import Link from 'next/link';
import type { SubscriptionSummary } from '../lib/subscription';
import { SPONSOR_LAPSED_MESSAGE, contactDossipv, trialDossiersLeft } from '../lib/trial';
import { Alert } from '@/components/ui/alert';

/**
 * Spec §8 in-app banner: shown within 7 days of periodEnd, on expiry, and while suspended.
 * Renders nothing while the subscription is comfortably active. The free trial always shows its
 * remaining dossiers (spec 2026-10-23 §7), so it needs `trialUsed`, the dossiers counted since its start.
 */
export function SubscriptionBanner({
  subscription,
  trialUsed = 0,
  awaitingEmailConfirmation = false,
}: {
  subscription: SubscriptionSummary | null;
  trialUsed?: number;
  /** A self sign-up that has not confirmed its email: the free trial starts at confirmation. */
  awaitingEmailConfirmation?: boolean;
}): React.JSX.Element | null {
  if (!subscription && awaitingEmailConfirmation) {
    return (
      <Alert variant="warn" role="status">
        Votre essai gratuit démarrera dès que votre adresse e-mail sera confirmée : ouvrez le lien reçu par email à l&apos;inscription
        (pensez aux courriers indésirables).
      </Alert>
    );
  }
  if (!subscription) {
    return (
      <Alert variant="danger" role="status">
        Aucun abonnement : {contactDossipv()} pour Standard ou Premium. La génération de dossiers est désactivée.
      </Alert>
    );
  }
  if (subscription.sponsored && subscription.effectiveStatus !== 'ACTIVE') {
    return (
      <Alert variant="danger" role="status">
        {SPONSOR_LAPSED_MESSAGE}. Vous pouvez consulter vos projets mais plus générer de dossier.
      </Alert>
    );
  }
  if (subscription.effectiveStatus === 'SUSPENDED') {
    return (
      <Alert variant="danger" role="status">
        Votre abonnement est suspendu : la génération de dossiers est désactivée.
      </Alert>
    );
  }
  if (subscription.isTrial) {
    return <TrialBanner subscription={subscription} used={trialUsed} />;
  }
  if (subscription.effectiveStatus === 'EXPIRED') {
    return (
      <Alert variant="danger" role="status">
        Votre abonnement a expiré le {subscription.periodEnd.toLocaleDateString('fr-FR')}. Vous pouvez consulter vos
        projets mais plus générer de dossier tant qu&apos;il n&apos;est pas renouvelé.{' '}
        <Link href="/facturation">Renouveler</Link>
      </Alert>
    );
  }
  if (subscription.isExpiringSoon) {
    return (
      <Alert variant="warn" role="status">
        Votre abonnement expire dans {subscription.daysLeft} jour{subscription.daysLeft > 1 ? 's' : ''} (le{' '}
        {subscription.periodEnd.toLocaleDateString('fr-FR')}). Pensez à le renouveler.{' '}
        <Link href="/facturation">Renouveler</Link>
      </Alert>
    );
  }
  return null;
}

function TrialBanner({ subscription, used }: { subscription: SubscriptionSummary; used: number }): React.JSX.Element {
  const endDate = subscription.periodEnd.toLocaleDateString('fr-FR');
  if (subscription.effectiveStatus === 'EXPIRED') {
    return (
      <Alert variant="danger" role="status">
        Votre essai gratuit s&apos;est terminé le {endDate}. Vous pouvez consulter vos projets et dossiers, mais plus
        importer de facture ni générer de dossier : {contactDossipv()} pour passer à un abonnement.
      </Alert>
    );
  }
  const left = trialDossiersLeft(subscription.monthlyDossierLimit, used);
  if (left === 0) {
    return (
      <Alert variant="danger" role="status">
        Essai gratuit terminé ({subscription.monthlyDossierLimit} dossiers utilisés). Vous pouvez consulter vos projets
        et dossiers, mais plus importer de facture ni générer de nouveau dossier : {contactDossipv()} pour passer à un
        abonnement.
      </Alert>
    );
  }
  return (
    <Alert variant={subscription.isExpiringSoon ? 'warn' : 'ok'} role="status">
      Essai gratuit : {left} dossier{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''}, jusqu&apos;au {endDate}
      {subscription.isExpiringSoon ? ` (${subscription.daysLeft} jour${subscription.daysLeft > 1 ? 's' : ''})` : ''}.
    </Alert>
  );
}
