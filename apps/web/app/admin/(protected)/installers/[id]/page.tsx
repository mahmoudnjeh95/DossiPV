import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { suspendSubscriptionAction, activateSubscriptionAction, updatePeriodEndAction } from './actions';
import { RecordPaymentForm } from './record-payment-form';

export default async function InstallerDetailPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const { id } = await params;

  const company = await db.company.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!company) {
    notFound();
  }

  const boundSuspend = suspendSubscriptionAction.bind(null, company.id);
  const boundActivate = activateSubscriptionAction.bind(null, company.id);
  const boundUpdatePeriodEnd = updatePeriodEndAction.bind(null, company.id);

  return (
    <main>
      <h1>{company.name}</h1>
      <section>
        <h2>Informations</h2>
        <p>Adresse : {company.address}</p>
        <p>Téléphone : {company.phone}</p>
        <p>Email : {company.email}</p>
        <p>
          Code ANME : {company.anmeCode} ({company.anmeCategory})
        </p>
      </section>

      <section>
        <h2>Abonnement</h2>
        {company.subscription ? (
          <>
            <p>Plan : {company.subscription.plan.name}</p>
            <p>Statut : {company.subscription.status}</p>
            <p>Fin de période : {company.subscription.periodEnd.toLocaleDateString('fr-FR')}</p>
            {company.subscription.status !== 'SUSPENDED' && (
              <form action={boundSuspend}>
                <button type="submit">Suspendre l&apos;abonnement</button>
              </form>
            )}
            {company.subscription.status !== 'ACTIVE' && (
              <form action={boundActivate}>
                <button type="submit">Activer l&apos;abonnement</button>
              </form>
            )}
            <form action={boundUpdatePeriodEnd}>
              <label>
                Nouvelle fin de période
                <input type="date" name="periodEnd" required />
              </label>
              <button type="submit">Mettre à jour</button>
            </form>
          </>
        ) : (
          <p>Aucun abonnement</p>
        )}
      </section>

      {company.subscription && (
        <section>
          <h2>Enregistrer un paiement</h2>
          <RecordPaymentForm companyId={company.id} />
        </section>
      )}

      <section>
        <h2>Historique des paiements</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Montant</th>
              <th>Méthode</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {company.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.createdAt.toLocaleDateString('fr-FR')}</td>
                <td>{payment.amountTnd.toString()} TND</td>
                <td>{payment.method}</td>
                <td>{payment.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
