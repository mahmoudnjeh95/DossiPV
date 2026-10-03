import type { SubscriptionSummary } from '../lib/subscription';

/**
 * Spec §8 in-app banner: shown within 7 days of periodEnd, on expiry, and while suspended.
 * Renders nothing while the subscription is comfortably active.
 */
export function SubscriptionBanner({ subscription }: { subscription: SubscriptionSummary | null }): React.JSX.Element | null {
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
