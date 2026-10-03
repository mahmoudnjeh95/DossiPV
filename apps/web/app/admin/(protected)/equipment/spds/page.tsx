import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteSpdButton } from './delete-button';

export default async function SpdListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const spds = await db.spd.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1>Parafoudres (SPD)</h1>
      <Link href="/admin/equipment/spds/new">Ajouter un parafoudre</Link>
      <table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Côté</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {spds.map((spd) => (
            <tr key={spd.id}>
              <td>{spd.brand}</td>
              <td>{spd.model}</td>
              <td>{spd.side}</td>
              <td>
                <Link href={`/admin/equipment/spds/${spd.id}`}>Modifier</Link>
                <DeleteSpdButton spdId={spd.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
