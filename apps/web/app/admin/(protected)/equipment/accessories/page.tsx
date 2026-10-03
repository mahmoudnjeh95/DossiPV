import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteAccessoryButton } from './delete-button';

export default async function AccessoryListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const accessories = await db.accessory.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1>Accessoires</h1>
      <Link href="/admin/equipment/accessories/new">Ajouter un accessoire</Link>
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
