import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';

export interface CompanyWithRelationsForList {
  id: string;
  name: string;
  subscription: { status: string; periodEnd: Date; plan: { name: string } } | null;
  users: { sessions: { createdAt: Date }[] }[];
  projects: { jobs: { startedAt: Date }[] }[];
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
  };
}

export default async function InstallerListPage(): Promise<React.JSX.Element> {
  // Defense-in-depth: the (protected) layout already guards this route, but this call makes
  // the page's own access control explicit and independent of the layout's own correctness,
  // matching sub-project #4's dashboard page, which does the same for the same reason.
  await requireAuthenticatedSuperAdmin();

  const companies = await db.company.findMany({
    include: {
      subscription: { include: { plan: true } },
      users: { include: { sessions: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      projects: { include: { jobs: true } },
    },
    orderBy: { name: 'asc' },
  });

  const rows = companies.map((company) => shapeInstallerRow(company, new Date()));

  return (
    <main>
      <h1>Installateurs</h1>
      <p>
        <Link href="/admin/installers/new">Nouvel installateur</Link>
      </p>
      <table>
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
              </td>
              <td>{row.planName}</td>
              <td>{row.subscriptionStatus ?? '—'}</td>
              <td>{row.periodEnd ? row.periodEnd.toLocaleDateString('fr-FR') : '—'}</td>
              <td>{row.dossiersThisMonth}</td>
              <td>{row.lastLogin ? row.lastLogin.toLocaleString('fr-FR') : 'Jamais'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
