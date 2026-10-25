import Link from 'next/link';
import { ContactDossipv } from '../support-contact';
import { SubscriptionBanner } from '../subscription-banner';
import type { BillingView } from '../../lib/payments/billing';
import { INTENT_DISPLAY_LABELS, PAYMENT_METHOD_LABELS } from '../../lib/payments/p2p';
import { CheckoutOffer } from './checkout-offer';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';

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

      <Card as="section">
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
          <p className="text-app-muted">
            {awaitingEmailConfirmation ? 'Votre essai gratuit démarrera dès que votre adresse e-mail sera confirmée.' : 'Aucun abonnement.'}
          </p>
        )}
      </Card>

      <section id="offres" className="mb-6">
        <h2>Payer par Flouci, izi ou D17</h2>
        <ol className="m-0 mb-4 grid list-none gap-2 p-0 text-[0.9rem] sm:grid-cols-3">
          {['Choisissez l’offre et la durée', 'Envoyez le montant depuis votre application', 'Déclarez-le avec une capture : SolarixPro valide'].map((text, index) => (
            <li key={text} className="flex items-center gap-2.5 rounded-ui border border-app-border bg-app-surface px-3 py-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-app-primary text-[0.8rem] font-bold text-white">{index + 1}</span>
              {text}
            </li>
          ))}
        </ol>
        {billing.openIntentId && (
          <Alert variant="warn" role="status">
            Vous avez un paiement en cours. Terminez-le ou annulez-le avant d’en commencer un autre.{' '}
            <Link href={`/paiement/${billing.openIntentId}`}>Reprendre mon paiement</Link>
          </Alert>
        )}
        {billing.providers.length === 0 ? (
          <Alert variant="warn" role="status">
            Paiement indisponible : <ContactDossipv />.
          </Alert>
        ) : billing.offers.length === 0 ? (
          <p className="text-app-muted">Aucune offre pour votre compte : <ContactDossipv />.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {billing.offers.map((offer) => (
              <CheckoutOffer key={offer.key} offer={offer} providers={billing.providers} canPay={canPay && !billing.openIntentId} />
            ))}
          </div>
        )}
        {!canPay && billing.providers.length > 0 && <p className="text-[0.8rem] font-normal text-app-muted">Seul le responsable du compte peut payer.</p>}
      </section>

      {billing.intents.length > 0 && (
        <section>
          <h2>Vos paiements déclarés</h2>
          <div className="overflow-x-auto">
            <Table>
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
                        <Badge variant="warn" style={{ marginLeft: 8 }}>
                          {intent.unreadMessages} message{intent.unreadMessages === 1 ? '' : 's'} non lu{intent.unreadMessages === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </section>
      )}

      <section>
        <h2>Historique des paiements</h2>
        {billing.payments.length === 0 ? (
          <p className="text-app-muted">Aucun paiement.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
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
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}
