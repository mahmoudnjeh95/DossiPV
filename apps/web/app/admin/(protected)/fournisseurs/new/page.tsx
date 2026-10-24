import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { packLabel } from '../pack-label';
import { NewSupplierForm } from './new-supplier-form';

export default async function NewSupplierPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const packs = await db.plan.findMany({ where: { archivedAt: null, audience: 'SUPPLIER' }, orderBy: { priceTnd: 'asc' } });

  return (
    <main>
      <h1>Nouveau fournisseur</h1>
      <NewSupplierForm plans={packs.map((pack) => ({ id: pack.id, label: packLabel(pack) }))} />
    </main>
  );
}
