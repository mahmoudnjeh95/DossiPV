import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { TIER_LABELS } from '../../../../lib/labels';
import { createPlanAction } from './actions';
import { PlanForm } from './plan-form';

export default async function AdminPlansPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const plans = await db.plan.findMany({ orderBy: { priceTnd: 'asc' }, include: { _count: { select: { subscriptions: true } } } });

  return (
    <main>
      <h1>Plans</h1>
      <p className="hint">Un changement de limite ou de prix s&apos;applique tout de suite aux sociétés abonnées à ce plan.</p>
      {plans.length === 0 ? (
        <p>Aucun plan défini.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Niveau</th>
              <th>Dossiers / mois</th>
              <th>Prix (TND)</th>
              <th>Sociétés abonnées</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>{TIER_LABELS[plan.tier] ?? plan.tier}</td>
                <td>{plan.monthlyDossierLimit}</td>
                <td>{Number(plan.priceTnd).toFixed(3)}</td>
                <td>{plan._count.subscriptions}</td>
                <td>
                  <Link href={`/admin/plans/${plan.id}`}>Modifier</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Nouveau plan</h2>
      <PlanForm action={createPlanAction} />
    </main>
  );
}
