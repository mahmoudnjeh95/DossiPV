import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { SUBSCRIPTION_STATUS_LABELS } from '../../../../lib/labels';

export interface SupplierForList {
  id: string;
  name: string;
  subscription: { status: string; periodEnd: Date; plan: { name: string; maxSponsoredInstallers: number | null } } | null;
  _count: { sponsoredInstallers: number };
}

export interface SupplierRow {
  id: string;
  name: string;
  packName: string;
  subscriptionStatus: string | null;
  periodEnd: Date | null;
  seatsUsed: number;
  seatsMax: number | null;
}

export function shapeSupplierRow(company: SupplierForList): SupplierRow {
  return {
    id: company.id,
    name: company.name,
    packName: company.subscription?.plan.name ?? 'Aucun pack',
    subscriptionStatus: company.subscription?.status ?? null,
    periodEnd: company.subscription?.periodEnd ?? null,
    seatsUsed: company._count.sponsoredInstallers,
    seatsMax: company.subscription?.plan.maxSponsoredInstallers ?? null,
  };
}

export default async function SupplierListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const companies = await db.company.findMany({
    where: { kind: 'SUPPLIER' },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { sponsoredInstallers: true } },
    },
    orderBy: { name: 'asc' },
  });
  const rows = companies.map(shapeSupplierRow);

  return (
    <main>
      <h1>Fournisseurs</h1>
      <p>
        <Link href="/admin/fournisseurs/new">Nouveau fournisseur</Link>
      </p>
      {rows.length === 0 ? (
        <p>Aucun fournisseur.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Pack</th>
              <th>Statut</th>
              <th>Fin d&apos;abonnement</th>
              <th>Installateurs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/admin/fournisseurs/${row.id}`}>{row.name}</Link>
                </td>
                <td>{row.packName}</td>
                <td>{row.subscriptionStatus ? (SUBSCRIPTION_STATUS_LABELS[row.subscriptionStatus] ?? row.subscriptionStatus) : '—'}</td>
                <td>{row.periodEnd ? row.periodEnd.toLocaleDateString('fr-FR') : '—'}</td>
                <td>
                  {row.seatsUsed} / {row.seatsMax ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
