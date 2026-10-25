import Link from 'next/link';
import { db, type Prisma } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { Table } from '@/components/ui/table';

const SIGNUP_ROWS = 200;
const SIGNUP_INCLUDE = {
  users: { select: { emailVerifiedAt: true } },
  subscription: { include: { plan: { select: { name: true, isTrial: true, monthlyDossierLimit: true } } } },
} as const;
type SignupCompany = Prisma.CompanyGetPayload<{ include: typeof SIGNUP_INCLUDE }>;

export type SignupFilter = 'toContact' | 'contacted' | 'all';

const FILTER_TABS: { value: SignupFilter; label: string }[] = [
  { value: 'toContact', label: 'À contacter' },
  { value: 'contacted', label: 'Contactés' },
  { value: 'all', label: 'Tous' },
];

export interface SignupRow {
  company: SignupCompany;
  emailVerified: boolean;
  /** Dossiers used in the current period (distinct projects with a job that did not fail); null without a subscription. */
  dossiersUsed: number | null;
}

export function parseSignupFilter(value: string | string[] | undefined): SignupFilter {
  return value === 'contacted' || value === 'all' ? value : 'toContact';
}

/**
 * Self sign-ups (companies with `signupAt`), newest first. The trial's dossiers count over the
 * whole period: distinct projects with a non-failed job since `periodStart`, as the quota does.
 */
export async function loadSignups(filter: SignupFilter): Promise<SignupRow[]> {
  const where: Prisma.CompanyWhereInput =
    filter === 'toContact'
      ? { signupAt: { not: null }, signupContactedAt: null }
      : filter === 'contacted'
        ? { signupAt: { not: null }, signupContactedAt: { not: null } }
        : { signupAt: { not: null } };
  const companies = await db.company.findMany({
    where,
    orderBy: [{ signupAt: 'desc' }, { id: 'desc' }],
    take: SIGNUP_ROWS,
    include: SIGNUP_INCLUDE,
  });
  return Promise.all(
    companies.map(async (company) => ({
      company,
      emailVerified: company.users.some((user) => user.emailVerifiedAt !== null),
      dossiersUsed: company.subscription
        ? await db.project.count({
            where: {
              companyId: company.id,
              jobs: { some: { status: { not: 'FAILED' }, startedAt: { gte: company.subscription.periodStart } } },
            },
          })
        : null,
    })),
  );
}

function yesNo(value: boolean): string {
  return value ? 'oui' : 'non';
}

function describeTrial({ company, dossiersUsed }: SignupRow): string {
  const subscription = company.subscription;
  if (!subscription) return "Pas d'essai";
  const plan = subscription.plan;
  const usage = plan.isTrial ? `${dossiersUsed ?? 0} / ${plan.monthlyDossierLimit} dossiers` : `${dossiersUsed ?? 0} dossiers`;
  return `${plan.name} — ${usage}, fin le ${subscription.periodEnd.toLocaleDateString('fr-FR')}`;
}

export default async function AdminSignupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const filter = parseSignupFilter((await searchParams).filter);
  const rows = await loadSignups(filter);

  return (
    <main>
      <h1>Inscriptions</h1>
      <p>
        {FILTER_TABS.map((tab, index) => (
          <span key={tab.value}>
            {index > 0 && ' | '}
            {tab.value === filter ? <strong>{tab.label}</strong> : <Link href={`/admin/inscriptions?filter=${tab.value}`}>{tab.label}</Link>}
          </span>
        ))}
      </p>
      {rows.length === 0 ? (
        <p>Aucune inscription.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Société</th>
                <th>Contact</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th>Gouvernorat</th>
                <th>Code ANME</th>
                <th>Email confirmé</th>
                <th>Essai</th>
                <th>Profil complété</th>
                <th>Contacté</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { company } = row;
                return (
                  <tr key={company.id}>
                    <td>{company.signupAt?.toLocaleDateString('fr-FR')}</td>
                    <td>
                      <Link href={`/admin/installers/${company.id}`}>{company.name}</Link>
                    </td>
                    <td>{company.signupContactName ?? '—'}</td>
                    <td>{company.phone}</td>
                    <td>{company.email}</td>
                    <td>{company.signupGovernorate ?? '—'}</td>
                    <td>{company.anmeCode}</td>
                    <td>{yesNo(row.emailVerified)}</td>
                    <td>{describeTrial(row)}</td>
                    <td>{yesNo(company.profileComplete)}</td>
                    <td>{company.signupContactedAt ? `oui, le ${company.signupContactedAt.toLocaleDateString('fr-FR')}` : 'non'}</td>
                    <td>
                      <Link href={`/admin/installers/${company.id}`}>Assigner un plan payant</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </main>
  );
}
