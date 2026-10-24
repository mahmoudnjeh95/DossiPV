import Link from 'next/link';
import { SubscriptionBanner } from '../subscription-banner';
import type { BillingView } from '../../lib/payments/billing';
import { PAYMENT_METHOD_LABELS } from '../../lib/payments/registry';
import { CheckoutOffer } from './checkout-offer';

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

/** The « Facturation » page body, shared by the installer app and the supplier space. */
export function BillingPageView({ billing, canPay }: { billing: BillingView; canPay: boolean }): React.JSX.Element {
  const enabledProviders = billing.providers.filter((p) => p.enabled);
  const { subscription } = billing;
  const isSupplier = billing.kind === 'SUPPLIER';

  return (
    <main>
      <h1>Facturation</h1>
      <SubscriptionBanner subscription={subscription} />

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
          <p className="muted">Aucun abonnement.</p>
        )}
      </section>

      {billing.pendingIntents.length > 0 && (
        <section className="card">
          <h2>Paiements en attente</h2>
          <ul>
            {billing.pendingIntents.map((intent) => (
              <li key={intent.id}>
                {money(intent.amountTnd)} via {PAYMENT_METHOD_LABELS[intent.provider as keyof typeof PAYMENT_METHOD_LABELS]} le {intent.createdAt.toLocaleDateString('fr-FR')} :{' '}
                <Link href={`/paiement/retour?intent=${intent.id}`}>vérifier le paiement</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Payer en ligne</h2>
        <p className="hint">
          Les prix des plans sont hors taxes (HT) : la TVA ({billing.vatRatePct.toLocaleString('fr-FR')} %) et le timbre fiscal (
          {money(billing.stampDutyTnd)}) s’ajoutent au total affiché.
        </p>
        {enabledProviders.length === 0 ? (
          <div className="banner banner-warn" role="status">
            Paiement en ligne indisponible : contactez DossiPV.
          </div>
        ) : billing.offers.length === 0 ? (
          <p className="muted">Aucune offre en ligne pour votre compte : contactez DossiPV.</p>
        ) : (
          billing.offers.map((offer) => <CheckoutOffer key={offer.key} offer={offer} providers={enabledProviders} canPay={canPay} />)
        )}
        {!canPay && enabledProviders.length > 0 && <p className="hint">Seul le responsable du compte peut payer en ligne.</p>}
        {billing.providers.some((p) => !p.enabled) && (
          <p className="hint">Non configuré : {billing.providers.filter((p) => !p.enabled).map((p) => p.label).join(', ')}.</p>
        )}
      </section>

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
                  <th>Facture</th>
                </tr>
              </thead>
              <tbody>
                {billing.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.createdAt.toLocaleDateString('fr-FR')}</td>
                    <td>{money(payment.amountTnd)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS] ?? payment.method}</td>
                    <td>{payment.invoiceId ? <Link href={`/factures/${payment.invoiceId}`}>{payment.invoiceNumber}</Link> : '—'}</td>
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
