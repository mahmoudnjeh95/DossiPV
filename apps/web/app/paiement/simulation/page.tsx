import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../(app)/layout';
import { isFakeEnabled } from '../../../lib/payments/fake';
import { simulatePaymentAction } from './actions';

/** Stand-in for a provider's checkout page, only while PAYMENTS_FAKE=1 outside production. */
export default async function PaymentSimulationPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }): Promise<React.JSX.Element> {
  if (!isFakeEnabled()) notFound();
  const { intent: intentId } = await searchParams;
  const user = await requireAuthenticatedCompanyUser();
  const intent = intentId ? await db.paymentIntent.findFirst({ where: { id: intentId, companyId: user.companyId } }) : null;
  if (!intent) notFound();

  return (
    <main>
      <h1>Paiement simulé (développement)</h1>
      <p>
        Montant : {Number(intent.amountTnd).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} TND. Aucun argent réel n’est en jeu.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <form action={simulatePaymentAction.bind(null, intent.id, 'paid')}>
          <button type="submit">Simuler un paiement réussi</button>
        </form>
        <form action={simulatePaymentAction.bind(null, intent.id, 'failed')}>
          <button type="submit" className="secondary">
            Simuler un échec
          </button>
        </form>
      </div>
    </main>
  );
}
