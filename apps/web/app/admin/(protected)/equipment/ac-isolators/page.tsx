import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteAcIsolatorButton } from './delete-button';
import { AcIsolator, Add } from '@dossipv/icons';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

export default async function AcIsolatorListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const acIsolators = await db.acIsolator.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AcIsolator size="lg" color="gold" />
        Sectionneurs AC
      </h1>
      <Link href="/admin/equipment/ac-isolators/new" className={buttonVariants()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un sectionneur AC
      </Link>
      <Table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Courant nominal (A)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {acIsolators.map((acIsolator) => (
            <tr key={acIsolator.id}>
              <td>{acIsolator.brand}</td>
              <td>{acIsolator.model}</td>
              <td>{acIsolator.ratedCurrentA}</td>
              <td>
                <Link href={`/admin/equipment/ac-isolators/${acIsolator.id}`}>Modifier</Link>
                <DeleteAcIsolatorButton acIsolatorId={acIsolator.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </main>
  );
}
