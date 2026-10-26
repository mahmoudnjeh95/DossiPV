import Link from 'next/link';
import { db, type Prisma } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { TIER_LABELS } from '../../../../lib/labels';
import { archivePlanAction, createPlanAction, unarchivePlanAction } from './actions';
import { PlanForm } from './plan-form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';

const PLAN_INCLUDE = { _count: { select: { subscriptions: true } } } as const;
type PlanRow = Prisma.PlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

function PlanActions({ plan, archived }: { plan: PlanRow; archived: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Link href={`/admin/plans/${plan.id}`}>Modifier</Link>
      <form action={(archived ? unarchivePlanAction : archivePlanAction).bind(null, plan.id)}>
        <Button variant="secondary" size="sm" type="submit">
          {archived ? 'Désarchiver' : 'Archiver'}
        </Button>
      </form>
    </div>
  );
}

function PlanTable({ plans, archived }: { plans: PlanRow[]; archived: boolean }): React.JSX.Element {
  return (
    <Table>
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
          <tr key={plan.id} className={archived ? 'text-app-muted' : undefined}>
            <td>
              {plan.name} {plan.isTrial && <Badge variant="ok">essai</Badge>}{' '}
              {archived && <Badge>archivé</Badge>}
            </td>
            <td>{TIER_LABELS[plan.tier] ?? plan.tier}</td>
            <td>{plan.monthlyDossierLimit}</td>
            <td>{Number(plan.priceTnd).toFixed(3)}</td>
            <td>{plan._count.subscriptions}</td>
            <td>
              <PlanActions plan={plan} archived={archived} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function PackTable({ plans, archived }: { plans: PlanRow[]; archived: boolean }): React.JSX.Element {
  return (
    <Table>
      <thead>
        <tr>
          <th>Nom</th>
          <th>Niveau</th>
          <th>Comptes installateurs</th>
          <th>Dossiers / installateur / mois</th>
          <th>Mise en avant</th>
          <th>Prix (TND)</th>
          <th>Fournisseurs abonnés</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {plans.map((plan) => (
          <tr key={plan.id} className={archived ? 'text-app-muted' : undefined}>
            <td>
              {plan.name} {archived && <Badge>archivé</Badge>}
            </td>
            <td>{TIER_LABELS[plan.tier] ?? plan.tier}</td>
            <td>{plan.maxSponsoredInstallers ?? 'Illimité'}</td>
            <td>{plan.dossiersPerInstallerPerMonth}</td>
            <td>{plan.includesHighlight ? 'oui' : 'non'}</td>
            <td>{Number(plan.priceTnd).toFixed(3)}</td>
            <td>{plan._count.subscriptions}</td>
            <td>
              <PlanActions plan={plan} archived={archived} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default async function AdminPlansPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const plans = await db.plan.findMany({ orderBy: { priceTnd: 'asc' }, include: PLAN_INCLUDE });
  const installerPlans = plans.filter((plan) => plan.audience === 'INSTALLER');
  const packs = plans.filter((plan) => plan.audience === 'SUPPLIER');
  const activePlans = installerPlans.filter((plan) => plan.archivedAt === null);
  const archivedPlans = installerPlans.filter((plan) => plan.archivedAt !== null);
  const activePacks = packs.filter((plan) => plan.archivedAt === null);
  const archivedPacks = packs.filter((plan) => plan.archivedAt !== null);

  return (
    <main>
      <h1>Plans</h1>
      <p className="text-[0.8rem] font-normal text-app-muted">Un changement de limite ou de prix s&apos;applique tout de suite aux sociétés abonnées à ce plan.</p>

      <h2>Plans installateurs</h2>
      {!activePlans.some((plan) => plan.isTrial) && (
        <p className="text-[0.8rem] font-normal text-app-muted" role="status">
          Aucun plan d&apos;essai actif : les nouvelles inscriptions n&apos;auront pas d&apos;essai gratuit tant qu&apos;un plan « Essai gratuit » n&apos;est pas proposé.
        </p>
      )}
      {activePlans.length === 0 ? <p>Aucun plan proposé.</p> : <PlanTable plans={activePlans} archived={false} />}

      <h2>Packs fournisseurs</h2>
      <p className="text-[0.8rem] font-normal text-app-muted">
        Un pack donne à un fournisseur un nombre de comptes installateurs, chacun avec son quota de dossiers par mois. Seuls les fournisseurs
        reçoivent un pack, seuls les installateurs reçoivent un plan installateur.
      </p>
      {activePacks.length === 0 ? <p>Aucun pack proposé.</p> : <PackTable plans={activePacks} archived={false} />}

      {(archivedPlans.length > 0 || archivedPacks.length > 0) && (
        <>
          <h2>Plans archivés</h2>
          <p className="text-[0.8rem] font-normal text-app-muted">
            Un plan archivé n&apos;est plus proposé aux nouveaux abonnements ni aux changements de plan ; les sociétés qui l&apos;ont le
            gardent. Un plan n&apos;est jamais supprimé.
          </p>
          {archivedPlans.length > 0 && <PlanTable plans={archivedPlans} archived />}
          {archivedPacks.length > 0 && <PackTable plans={archivedPacks} archived />}
        </>
      )}

      <h2>Nouveau plan ou pack</h2>
      <PlanForm action={createPlanAction} />
    </main>
  );
}
