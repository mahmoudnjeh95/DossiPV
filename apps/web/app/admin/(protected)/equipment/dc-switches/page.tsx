import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteDcSwitchButton } from './delete-button';

export default async function DcSwitchListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const dcSwitches = await db.dcSwitch.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1>Sectionneurs DC</h1>
      <Link href="/admin/equipment/dc-switches/new">Ajouter un sectionneur DC</Link>
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
          {dcSwitches.map((dcSwitch) => (
            <tr key={dcSwitch.id}>
              <td>{dcSwitch.brand}</td>
              <td>{dcSwitch.model}</td>
              <td>{dcSwitch.ratedCurrentA}</td>
              <td>
                <Link href={`/admin/equipment/dc-switches/${dcSwitch.id}`}>Modifier</Link>
                <DeleteDcSwitchButton dcSwitchId={dcSwitch.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
