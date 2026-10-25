import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteInverterButton } from './delete-button';
import { Inverter, Add } from '@dossipv/icons';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

export default async function InverterListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const inverters = await db.inverter.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Inverter size="lg" color="gold" />
        Onduleurs
      </h1>
      <Link href="/admin/equipment/inverters/new" className={buttonVariants()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un onduleur
      </Link>
      <Table>
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
      </Table>
    </main>
  );
}
