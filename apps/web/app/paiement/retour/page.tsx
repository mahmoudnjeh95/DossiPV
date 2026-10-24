import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../(app)/layout';
import { settlePaymentIntent } from '../../../lib/payments/settle';

/**
 * Where the provider sends the browser back. The URL says nothing about the outcome: the page
 * settles the intent, which asks the provider, so a forged return link grants nothing. Refreshing
 * the page is the retry for a payment still pending.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }): Promise<React.JSX.Element> {
  const { intent: intentId } = await searchParams;
  const user = await requireAuthenticatedCompanyUser();
  const intent = intentId
    ? await db.paymentIntent.findFirst({ where: { id: intentId, companyId: user.companyId }, include: { company: { select: { kind: true } } } })
    : null;
  if (!intent) notFound();

  const result = await settlePaymentIntent(intent.id);
  const billingHref = intent.company.kind === 'SUPPLIER' ? '/fournisseur/facturation' : '/facturation';

  return (
    <main>
      <h1>Paiement en ligne</h1>
      {result.status === 'PAID' && (
        <div className="banner banner-ok" role="status">
          <p>
            <strong>Paiement reçu, merci.</strong> Votre abonnement est à jour.
          </p>
          <p>
            <Link href={billingHref}>Voir la facturation et la facture</Link>
          </p>
        </div>
      )}
      {result.status === 'PENDING' && (
        <div className="banner banner-warn" role="status">
          <p>
            <strong>Paiement en attente de confirmation.</strong>{' '}
            {result.unreachable ? 'Le service de paiement ne répond pas pour le moment.' : 'Le fournisseur ne l’a pas encore confirmé.'} Si vous avez payé, cela
            peut prendre quelques minutes.
          </p>
          <p>
            <Link href={`/paiement/retour?intent=${intent.id}`}>Vérifier à nouveau</Link> · <Link href={billingHref}>Retour à la facturation</Link>
          </p>
        </div>
      )}
      {(result.status === 'FAILED' || result.status === 'CANCELLED') && (
        <div className="banner banner-danger" role="alert">
          <p>
            <strong>Le paiement n’a pas abouti.</strong> Aucun montant n’a été enregistré.
          </p>
          <p>
            <Link href={billingHref}>Réessayer</Link>
          </p>
        </div>
      )}
    </main>
  );
}
