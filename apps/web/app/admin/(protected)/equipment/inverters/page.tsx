import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteInverterButton } from './delete-button';

export default async function InverterListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const inverters = await db.inverter.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1>Onduleurs</h1>
      <Link href="/admin/equipment/inverters/new">Ajouter un onduleur</Link>
      <table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Puissance AC (W)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {inverters.map((inverter) => (
            <tr key={inverter.id}>
              <td>{inverter.brand}</td>
              <td>{inverter.model}</td>
              <td>{inverter.pacW}</td>
              <td>
                <Link href={`/admin/equipment/inverters/${inverter.id}`}>Modifier</Link>
                <DeleteInverterButton inverterId={inverter.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
