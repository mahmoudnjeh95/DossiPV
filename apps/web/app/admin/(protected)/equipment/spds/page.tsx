import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteSpdButton } from './delete-button';
import { Spd, Add } from '@dossipv/icons';

export default async function SpdListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const spds = await db.spd.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Spd size="lg" color="gold" />
        Parafoudres (SPD)
      </h1>
      <Link href="/admin/equipment/spds/new" className="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un parafoudre
      </Link>
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
