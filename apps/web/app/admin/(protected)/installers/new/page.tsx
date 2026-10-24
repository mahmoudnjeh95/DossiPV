import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { TIER_LABELS } from '../../../../../lib/labels';
import { NewInstallerForm } from './new-installer-form';

export default async function NewInstallerPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const plans = await db.plan.findMany({ where: { archivedAt: null }, orderBy: { priceTnd: 'asc' } });

  return (
    <main>
      <h1>Nouvel installateur</h1>
      <NewInstallerForm
        plans={plans.map((plan) => ({
          id: plan.id,
          label: `${plan.name} — ${TIER_LABELS[plan.tier] ?? plan.tier}, ${plan.monthlyDossierLimit} dossiers / mois`,
        }))}
      />
    </main>
  );
}
