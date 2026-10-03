import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteDcFuseButton } from './delete-button';
import { DcFuse, Add } from '@dossipv/icons';

export default async function DcFuseListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const dcFuses = await db.dcFuse.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <DcFuse size="lg" color="gold" />
        Fusibles DC
      </h1>
      <Link href="/admin/equipment/dc-fuses/new" className="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un fusible DC
      </Link>
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
