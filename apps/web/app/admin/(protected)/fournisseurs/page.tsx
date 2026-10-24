import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { SUBSCRIPTION_STATUS_LABELS } from '../../../../lib/labels';
import { displayedSubscriptionStatus } from '../../../../lib/admin-period';
import { companySearchWhere, expiringSubscriptionWhere, readSearchQuery } from '../../../../lib/admin-search';

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

export default async function SupplierListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; expiring?: string }>;
}): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const params = await searchParams;
  const query = readSearchQuery(params.q);
  const expiring = params.expiring === '1';

  const companies = await db.company.findMany({
    where: { kind: 'SUPPLIER', ...companySearchWhere(query), ...(expiring ? expiringSubscriptionWhere(new Date()) : {}) },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { sponsoredInstallers: true } },
    },
    orderBy: { name: 'asc' },
  });
  const now = new Date();
  const rows = companies.map(shapeSupplierRow);

  return (
    <main>
      <h1>Fournisseurs</h1>
      {expiring && <p className="hint">Packs actifs qui se terminent dans les 30 prochains jours.</p>}
      <p>
        <Link href="/admin/fournisseurs/new">Nouveau fournisseur</Link>
      </p>
      <form method="get" role="search" className="actions">
        <input type="search" name="q" defaultValue={query ?? ''} placeholder="Rechercher (nom, email, téléphone)" aria-label="Rechercher" maxLength={100} />
        <button type="submit" className="secondary small">
          Rechercher
        </button>
        {expiring && <input type="hidden" name="expiring" value="1" />}
        {(query || expiring) && <Link href="/admin/fournisseurs">Effacer</Link>}
      </form>
      {rows.length === 0 ? (
        <p>{query ? 'Aucun fournisseur ne correspond.' : 'Aucun fournisseur.'}</p>
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
                <td>
                  {row.subscriptionStatus && row.periodEnd
                    ? ((): string => {
                        const status = displayedSubscriptionStatus(row.subscriptionStatus, row.periodEnd, now);
                        return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
                      })()
                    : 'Sans abonnement'}
                </td>
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
