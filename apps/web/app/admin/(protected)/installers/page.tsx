import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { SUBSCRIPTION_STATUS_LABELS } from '../../../../lib/labels';
import { displayedSubscriptionStatus } from '../../../../lib/admin-period';
import { companySearchWhere, expiringSubscriptionWhere, readSearchQuery } from '../../../../lib/admin-search';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table } from '@/components/ui/table';

export interface CompanyWithRelationsForList {
  id: string;
  name: string;
  subscription: { status: string; periodEnd: Date; plan: { name: string } } | null;
  users: { sessions: { createdAt: Date }[] }[];
  projects: { jobs: { startedAt: Date }[] }[];
  sponsor?: { name: string } | null;
}

export interface InstallerRow {
  id: string;
  name: string;
  planName: string;
  subscriptionStatus: string | null;
  periodEnd: Date | null;
  isExpiringOrExpired: boolean;
  dossiersThisMonth: number;
  lastLogin: Date | null;
  sponsorName: string | null;
}

const EXPIRY_WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function shapeInstallerRow(company: CompanyWithRelationsForList, now: Date): InstallerRow {
  const periodEnd = company.subscription?.periodEnd ?? null;
  const isExpiringOrExpired = periodEnd !== null && periodEnd.getTime() - now.getTime() <= EXPIRY_WARNING_WINDOW_MS;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dossiersThisMonth = company.projects.reduce(
    (total, project) => total + project.jobs.filter((job) => job.startedAt >= monthStart).length,
    0,
  );

  const allSessionTimes = company.users.flatMap((user) => user.sessions.map((session) => session.createdAt.getTime()));
  const lastLogin = allSessionTimes.length > 0 ? new Date(Math.max(...allSessionTimes)) : null;

  return {
    id: company.id,
    name: company.name,
    planName: company.subscription?.plan.name ?? 'Aucun abonnement',
    subscriptionStatus: company.subscription?.status ?? null,
    periodEnd,
    isExpiringOrExpired,
    dossiersThisMonth,
    lastLogin,
    sponsorName: company.sponsor?.name ?? null,
  };
}

export default async function InstallerListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; expiring?: string }>;
}): Promise<React.JSX.Element> {
  // Defense-in-depth: the (protected) layout already guards this route, but this call makes
  // the page's own access control explicit and independent of the layout's own correctness,
  // matching sub-project #4's dashboard page, which does the same for the same reason.
  await requireAuthenticatedSuperAdmin();
  const params = await searchParams;
  const query = readSearchQuery(params.q);
  const expiring = params.expiring === '1';

  const companies = await db.company.findMany({
    where: { kind: 'INSTALLER', ...companySearchWhere(query), ...(expiring ? expiringSubscriptionWhere(new Date()) : {}) },
    include: {
      subscription: { include: { plan: true } },
      users: { include: { sessions: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      projects: { include: { jobs: true } },
      sponsor: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const now = new Date();
  const rows = companies.map((company) => shapeInstallerRow(company, now));

  return (
    <main>
      <h1>Installateurs</h1>
      {expiring && <p className="text-[0.8rem] font-normal text-app-muted">Abonnements actifs qui se terminent dans les 30 prochains jours.</p>}
      <p>
        <Link href="/admin/installers/new">Nouvel installateur</Link>
      </p>
      <form method="get" role="search" className="flex flex-wrap items-center gap-2">
        <Input type="search" name="q" defaultValue={query ?? ''} placeholder="Rechercher (nom, email, téléphone)" aria-label="Rechercher" maxLength={100} />
        <Button variant="secondary" size="sm" type="submit">
          Rechercher
        </Button>
        {expiring && <Input type="hidden" name="expiring" value="1" />}
        {(query || expiring) && <Link href="/admin/installers">Effacer</Link>}
      </form>
      {rows.length === 0 && <p>Aucun installateur ne correspond.</p>}
      <Table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Plan</th>
            <th>Statut</th>
            <th>Fin d&apos;abonnement</th>
            <th>Dossiers ce mois</th>
            <th>Dernière connexion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={row.isExpiringOrExpired ? { background: '#ffe5e5' } : undefined}>
              <td>
                <Link href={`/admin/installers/${row.id}`}>{row.name}</Link>
                {row.sponsorName && (
                  <>
                    {' '}
                    <Badge>Parrainé par {row.sponsorName}</Badge>
                  </>
                )}
              </td>
              <td>{row.planName}</td>
              <td>
                {row.subscriptionStatus && row.periodEnd
                  ? ((): string => {
                      const status = displayedSubscriptionStatus(row.subscriptionStatus, row.periodEnd, now);
                      return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
                    })()
                  : 'Sans abonnement'}
              </td>
              <td>{row.periodEnd ? row.periodEnd.toLocaleDateString('fr-FR') : '—'}</td>
              <td>{row.dossiersThisMonth}</td>
              <td>{row.lastLogin ? row.lastLogin.toLocaleString('fr-FR') : 'Jamais'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </main>
  );
}
