import Link from 'next/link';
import { db, type Prisma } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { TIER_LABELS } from '../../../../lib/labels';
import { archivePlanAction, createPlanAction, unarchivePlanAction } from './actions';
import { PlanForm } from './plan-form';

const PLAN_INCLUDE = { _count: { select: { subscriptions: true } } } as const;
type PlanRow = Prisma.PlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

function PlanTable({ plans, archived }: { plans: PlanRow[]; archived: boolean }): React.JSX.Element {
  return (
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
          <tr key={plan.id} className={archived ? 'muted' : undefined}>
            <td>
              {plan.name} {archived && <span className="badge">archivé</span>}
            </td>
            <td>{TIER_LABELS[plan.tier] ?? plan.tier}</td>
            <td>{plan.monthlyDossierLimit}</td>
            <td>{Number(plan.priceTnd).toFixed(3)}</td>
            <td>{plan._count.subscriptions}</td>
            <td>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link href={`/admin/plans/${plan.id}`}>Modifier</Link>
                <form action={(archived ? unarchivePlanAction : archivePlanAction).bind(null, plan.id)}>
                  <button type="submit" className="secondary small">
                    {archived ? 'Désarchiver' : 'Archiver'}
                  </button>
                </form>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AdminPlansPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const plans = await db.plan.findMany({ orderBy: { priceTnd: 'asc' }, include: PLAN_INCLUDE });
  const activePlans = plans.filter((plan) => plan.archivedAt === null);
  const archivedPlans = plans.filter((plan) => plan.archivedAt !== null);

  return (
    <main>
      <h1>Plans</h1>
      <p className="hint">Un changement de limite ou de prix s&apos;applique tout de suite aux sociétés abonnées à ce plan.</p>
      {activePlans.length === 0 ? <p>Aucun plan proposé.</p> : <PlanTable plans={activePlans} archived={false} />}

      {archivedPlans.length > 0 && (
        <>
          <h2>Plans archivés</h2>
          <p className="hint">
            Un plan archivé n&apos;est plus proposé aux nouveaux abonnements ni aux changements de plan ; les sociétés qui l&apos;ont le
            gardent. Un plan n&apos;est jamais supprimé.
          </p>
          <PlanTable plans={archivedPlans} archived />
        </>
      )}

      <h2>Nouveau plan</h2>
      <PlanForm action={createPlanAction} />
    </main>
  );
}
