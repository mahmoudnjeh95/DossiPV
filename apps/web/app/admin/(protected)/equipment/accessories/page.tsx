import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteAccessoryButton } from './delete-button';
import { Accessory, Add } from '@dossipv/icons';

export default async function AccessoryListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const accessories = await db.accessory.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Accessory size="lg" color="gold" />
        Accessoires
      </h1>
      <Link href="/admin/equipment/accessories/new" className="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un accessoire
      </Link>
      <table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accessories.map((accessory) => (
            <tr key={accessory.id}>
              <td>{accessory.brand}</td>
              <td>{accessory.model}</td>
              <td>{accessory.kind}</td>
              <td>
                <Link href={`/admin/equipment/accessories/${accessory.id}`}>Modifier</Link>
                <DeleteAccessoryButton accessoryId={accessory.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
