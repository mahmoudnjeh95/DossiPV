import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { unreadForAdmin } from '../../../../lib/payments/chat';
import { PAYMENT_METHOD_LABELS, paymentReference } from '../../../../lib/payments/p2p';

const ROWS = 200;

/** Declared P2P payments waiting for the admin's decision, oldest first. */
export default async function AdminPaymentsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  // No proofImage here: the screenshot is read only by the capture route.
  // A payment with an unread payer message is listed too, declared or not.
  const unread = await unreadForAdmin();
  const intents = await db.paymentIntent.findMany({
    where: { OR: [{ status: 'PENDING', declaredAt: { not: null } }, { id: { in: [...unread.keys()] } }] },
    orderBy: { declaredAt: 'asc' },
    take: ROWS,
    select: {
      id: true,
      purpose: true,
      planId: true,
      months: true,
      amountTnd: true,
      provider: true,
      providerReference: true,
      declaredAt: true,
      company: { select: { id: true, name: true, kind: true } },
    },
  });
  const plans = await db.plan.findMany({ where: { id: { in: intents.flatMap((i) => (i.planId ? [i.planId] : [])) } }, select: { id: true, name: true } });
  const planName = (planId: string | null): string => plans.find((plan) => plan.id === planId)?.name ?? 'Abonnement';

  return (
    <main>
      <h1>Paiements</h1>
      <p className="hint">Paiements P2P déclarés par les clients, à vérifier avec la capture d&apos;écran puis à confirmer ou refuser.</p>
      {intents.length === 0 ? (
        <p className="muted">Aucun paiement à vérifier.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Déclaré le</th>
                <th>Société</th>
                <th>Achat</th>
                <th>Durée</th>
                <th>Montant</th>
                <th>Moyen</th>
                <th>Référence</th>
                <th>Numéro / référence saisi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {intents.map((intent) => (
                <tr key={intent.id}>
                  <td>{intent.declaredAt?.toLocaleString('fr-FR')}</td>
                  <td>{intent.company.name}</td>
                  <td>{intent.purpose === 'OPTION_3D' ? 'Option 3D' : planName(intent.planId)}</td>
                  <td>{intent.months} mois</td>
                  <td>{intent.amountTnd.toString()} TND</td>
                  <td>{PAYMENT_METHOD_LABELS[intent.provider]}</td>
                  <td>{paymentReference(intent.id)}</td>
                  <td>{intent.providerReference}</td>
                  <td>
                    <Link href={`/admin/paiements/${intent.id}`}>Examiner</Link>
                    {(unread.get(intent.id) ?? 0) > 0 && (
                      <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                        {unread.get(intent.id)} message{unread.get(intent.id) === 1 ? '' : 's'} non lu{unread.get(intent.id) === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
