import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteDcFuseButton } from './delete-button';

export default async function DcFuseListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const dcFuses = await db.dcFuse.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1>Fusibles DC</h1>
      <Link href="/admin/equipment/dc-fuses/new">Ajouter un fusible DC</Link>
      <table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Courant nominal (A)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dcFuses.map((dcFuse) => (
            <tr key={dcFuse.id}>
              <td>{dcFuse.brand}</td>
              <td>{dcFuse.model}</td>
              <td>{dcFuse.ratedCurrentA}</td>
              <td>
                <Link href={`/admin/equipment/dc-fuses/${dcFuse.id}`}>Modifier</Link>
                <DeleteDcFuseButton dcFuseId={dcFuse.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
