import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { updatePlanAction } from '../actions';
import { PlanForm } from '../plan-form';

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const { id } = await params;
  const plan = await db.plan.findUnique({ where: { id } });
  if (!plan) {
    notFound();
  }

  return (
    <main>
      <h1>Modifier le plan {plan.name}</h1>
      <PlanForm
        action={updatePlanAction.bind(null, plan.id)}
        plan={{ name: plan.name, tier: plan.tier, monthlyDossierLimit: plan.monthlyDossierLimit, priceTnd: Number(plan.priceTnd), isTrial: plan.isTrial }}
      />
    </main>
  );
}
