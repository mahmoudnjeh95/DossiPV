import type { SubscriptionSummary } from '../lib/subscription';
import { contactDossipv, trialDossiersLeft } from '../lib/trial';

/**
 * Spec §8 in-app banner: shown within 7 days of periodEnd, on expiry, and while suspended.
 * Renders nothing while the subscription is comfortably active. The free trial always shows its
 * remaining dossiers (spec 2026-10-23 §7), so it needs `trialUsed`, the dossiers counted since its start.
 */
export function SubscriptionBanner({
  subscription,
  trialUsed = 0,
}: {
  subscription: SubscriptionSummary | null;
  trialUsed?: number;
}): React.JSX.Element | null {
  if (!subscription) {
    return (
      <div className="banner banner-danger" role="status">
        Aucun abonnement actif : la génération de dossiers est désactivée. Contactez DossiPV pour activer votre offre.
      </div>
    );
  }
  if (subscription.effectiveStatus === 'SUSPENDED') {
    return (
      <div className="banner banner-danger" role="status">
        Votre abonnement est suspendu : la génération de dossiers est désactivée.
      </div>
    );
  }
  if (subscription.isTrial) {
    return <TrialBanner subscription={subscription} used={trialUsed} />;
  }
  if (subscription.effectiveStatus === 'EXPIRED') {
    return (
      <div className="banner banner-danger" role="status">
        Votre abonnement a expiré le {subscription.periodEnd.toLocaleDateString('fr-FR')}. Vous pouvez consulter vos
        projets mais plus générer de dossier tant qu&apos;il n&apos;est pas renouvelé.
      </div>
    );
  }
  if (subscription.isExpiringSoon) {
    return (
      <div className="banner banner-warn" role="status">
        Votre abonnement expire dans {subscription.daysLeft} jour{subscription.daysLeft > 1 ? 's' : ''} (le{' '}
        {subscription.periodEnd.toLocaleDateString('fr-FR')}). Pensez à le renouveler.
      </div>
    );
  }
  return null;
}

function TrialBanner({ subscription, used }: { subscription: SubscriptionSummary; used: number }): React.JSX.Element {
  const endDate = subscription.periodEnd.toLocaleDateString('fr-FR');
  if (subscription.effectiveStatus === 'EXPIRED') {
    return (
      <div className="banner banner-danger" role="status">
        Votre essai gratuit s&apos;est terminé le {endDate}. Vous pouvez consulter vos projets et dossiers, mais plus
        importer de facture ni générer de dossier : {contactDossipv()} pour passer à un abonnement.
      </div>
    );
  }
  const left = trialDossiersLeft(subscription.monthlyDossierLimit, used);
  if (left === 0) {
    return (
      <div className="banner banner-danger" role="status">
        Essai gratuit terminé ({subscription.monthlyDossierLimit} dossiers utilisés). Vous pouvez consulter vos projets
        et dossiers, mais plus importer de facture ni générer de nouveau dossier : {contactDossipv()} pour passer à un
        abonnement.
      </div>
    );
  }
  return (
    <div className={subscription.isExpiringSoon ? 'banner banner-warn' : 'banner banner-ok'} role="status">
      Essai gratuit : {left} dossier{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''}, jusqu&apos;au {endDate}
      {subscription.isExpiringSoon ? ` (${subscription.daysLeft} jour${subscription.daysLeft > 1 ? 's' : ''})` : ''}.
    </div>
  );
}
