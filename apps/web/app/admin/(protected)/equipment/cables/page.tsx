import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteCableButton } from './delete-button';
import { Cable, Add } from '@dossipv/icons';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

export default async function CableListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const cables = await db.cable.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Cable size="lg" color="gold" />
        Câbles
      </h1>
      <Link href="/admin/equipment/cables/new" className={buttonVariants()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un câble
      </Link>
      <Table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Usage</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cables.map((cable) => (
            <tr key={cable.id}>
              <td>{cable.brand}</td>
              <td>{cable.model}</td>
              <td>{cable.usage}</td>
              <td>
                <Link href={`/admin/equipment/cables/${cable.id}`}>Modifier</Link>
                <DeleteCableButton cableId={cable.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </main>
  );
}
