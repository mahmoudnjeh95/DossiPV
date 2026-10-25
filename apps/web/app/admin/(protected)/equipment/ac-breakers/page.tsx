import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeleteAcBreakerButton } from './delete-button';
import { AcBreaker, Add } from '@dossipv/icons';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';

export default async function AcBreakerListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const acBreakers = await db.acBreaker.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AcBreaker size="lg" color="gold" />
        Disjoncteurs AC
      </h1>
      <Link href="/admin/equipment/ac-breakers/new" className={buttonVariants()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un disjoncteur AC
      </Link>
      <Table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Courant nominal (A)</th>
            <th>Différentiel</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {acBreakers.map((acBreaker) => (
            <tr key={acBreaker.id}>
              <td>{acBreaker.brand}</td>
              <td>{acBreaker.model}</td>
              <td>{acBreaker.ratedCurrentA}</td>
              <td>{acBreaker.residualCurrentMA !== null && acBreaker.rcdType !== null ? `${acBreaker.residualCurrentMA} mA type ${acBreaker.rcdType}` : '—'}</td>
              <td>
                <Link href={`/admin/equipment/ac-breakers/${acBreaker.id}`}>Modifier</Link>
                <DeleteAcBreakerButton acBreakerId={acBreaker.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </main>
  );
}
