import Link from 'next/link';
import { ContactDossipv } from '../support-contact';
import { SubscriptionBanner } from '../subscription-banner';
import type { BillingView } from '../../lib/payments/billing';
import { INTENT_DISPLAY_LABELS, PAYMENT_METHOD_LABELS } from '../../lib/payments/p2p';
import { CheckoutOffer } from './checkout-offer';

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

/** The « Abonnement et paiement » page body, shared by the installer app and the supplier space. */
export function BillingPageView({
  billing,
  canPay,
  awaitingEmailConfirmation = false,
}: {
  billing: BillingView;
  canPay: boolean;
  /** A self sign-up whose email is not confirmed yet: the free trial starts at confirmation. */
  awaitingEmailConfirmation?: boolean;
}): React.JSX.Element {
  const { subscription } = billing;
  const isSupplier = billing.kind === 'SUPPLIER';

  return (
    <main>
      <h1>Abonnement et paiement</h1>
      <SubscriptionBanner subscription={subscription} awaitingEmailConfirmation={awaitingEmailConfirmation} />

      <section className="card">
        <h2>{isSupplier ? 'Votre pack' : 'Votre abonnement'}</h2>
        {subscription ? (
          <dl className="dl">
            <dt>Offre</dt>
            <dd>{subscription.planName}</dd>
            <dt>Statut</dt>
            <dd>{subscription.effectiveStatus === 'ACTIVE' ? 'Actif' : subscription.effectiveStatus === 'EXPIRED' ? 'Expiré' : 'Suspendu'}</dd>
            <dt>Fin de période</dt>
            <dd>{subscription.periodEnd.toLocaleDateString('fr-FR')}</dd>
            {billing.option3dUntil && (
              <>
                <dt>Option 3D</dt>
                <dd>jusqu’au {billing.option3dUntil.toLocaleDateString('fr-FR')}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="muted">
            {awaitingEmailConfirmation ? 'Votre essai gratuit démarrera dès que votre adresse e-mail sera confirmée.' : 'Aucun abonnement.'}
          </p>
        )}
      </section>

      <section>
        <h2>Payer par Flouci, izi ou D17</h2>
        <p className="hint">
          Vous envoyez le montant depuis votre application au numéro de SolarixPro, puis vous déclarez le paiement avec une capture d’écran.
          SolarixPro vérifie la capture et prolonge votre abonnement.
        </p>
        {billing.providers.length === 0 ? (
          <div className="banner banner-warn" role="status">
            Paiement indisponible : <ContactDossipv />.
          </div>
        ) : billing.offers.length === 0 ? (
          <p className="muted">Aucune offre pour votre compte : <ContactDossipv />.</p>
        ) : (
          billing.offers.map((offer) => <CheckoutOffer key={offer.key} offer={offer} providers={billing.providers} canPay={canPay} />)
        )}
        {!canPay && billing.providers.length > 0 && <p className="hint">Seul le responsable du compte peut payer.</p>}
      </section>

      {billing.intents.length > 0 && (
        <section>
          <h2>Vos paiements déclarés</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Moyen</th>
                  <th>Référence</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {billing.intents.map((intent) => (
                  <tr key={intent.id}>
                    <td>{intent.createdAt.toLocaleDateString('fr-FR')}</td>
                    <td>{money(intent.amountTnd)}</td>
                    <td>{PAYMENT_METHOD_LABELS[intent.provider as keyof typeof PAYMENT_METHOD_LABELS] ?? intent.provider}</td>
                    <td>{intent.reference}</td>
                    <td>
                      {INTENT_DISPLAY_LABELS[intent.status]}
                      {intent.status === 'REJECTED' && intent.failureReason ? ` : ${intent.failureReason}` : ''}
                    </td>
                    <td>
                      <Link href={`/paiement/${intent.id}`}>{intent.status === 'TO_DECLARE' ? 'Déclarer' : 'Voir'}</Link>
                      {intent.unreadMessages > 0 && (
                        <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                          {intent.unreadMessages} message{intent.unreadMessages === 1 ? '' : 's'} non lu{intent.unreadMessages === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2>Historique des paiements</h2>
        {billing.payments.length === 0 ? (
          <p className="muted">Aucun paiement.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Méthode</th>
                </tr>
              </thead>
              <tbody>
                {billing.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.createdAt.toLocaleDateString('fr-FR')}</td>
                    <td>{money(payment.amountTnd)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS] ?? payment.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
