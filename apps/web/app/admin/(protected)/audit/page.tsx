import Link from 'next/link';
import { db, type Prisma } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { ADMIN_ACTION_LABELS } from '../../../../lib/labels';
import { describeAuditDetails } from '../../../../lib/admin-audit';
import { Table } from '@/components/ui/table';

const AUDIT_PAGE_SIZE = 100;
const AUDIT_ENTRY_INCLUDE = { superAdmin: { select: { email: true } }, targetCompany: { select: { id: true, name: true } } } as const;
type AuditEntry = Prisma.AdminAuditLogGetPayload<{ include: typeof AUDIT_ENTRY_INCLUDE }>;

export interface AuditPageParams {
  /** Only this company's entries. */
  company?: string | undefined;
  /** Id of the last entry of the previous page: the page starts just after it ("plus anciens"). */
  before?: string | undefined;
}

/**
 * One page of AdminAuditLog, newest first. Reads one entry more than the page to know whether
 * an older page exists; `nextBefore` is the cursor for it.
 */
export async function loadAuditPage(params: AuditPageParams): Promise<{ entries: AuditEntry[]; nextBefore: string | null }> {
  const rows = await db.adminAuditLog.findMany({
    where: params.company ? { targetCompanyId: params.company } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: AUDIT_PAGE_SIZE + 1,
    ...(params.before ? { cursor: { id: params.before }, skip: 1 } : {}),
    include: AUDIT_ENTRY_INCLUDE,
  });
  const entries = rows.slice(0, AUDIT_PAGE_SIZE);
  return { entries, nextBefore: rows.length > AUDIT_PAGE_SIZE ? (entries.at(-1)?.id ?? null) : null };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const query = await searchParams;
  const params: AuditPageParams = { company: single(query.company), before: single(query.before) };
  const [{ entries, nextBefore }, company] = await Promise.all([
    loadAuditPage(params),
    params.company ? db.company.findUnique({ where: { id: params.company }, select: { id: true, name: true } }) : null,
  ]);
  const baseQuery = params.company ? `company=${encodeURIComponent(params.company)}&` : '';

  return (
    <main>
      <h1>Journal des actions admin</h1>
      {params.company && (
        <p>
          Société : {company ? <Link href={`/admin/installers/${company.id}`}>{company.name}</Link> : 'introuvable'} —{' '}
          <Link href="/admin/audit">Toutes les sociétés</Link>
        </p>
      )}
      {params.before && (
        <p>
          <Link href={params.company ? `/admin/audit?company=${encodeURIComponent(params.company)}` : '/admin/audit'}>Revenir aux plus récentes</Link>
        </p>
      )}
      {entries.length === 0 ? (
        <p>Aucune action enregistrée.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Par</th>
              <th>Action</th>
              <th>Société</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.createdAt.toLocaleString('fr-FR')}</td>
                <td>{entry.superAdmin.email}</td>
                <td>{ADMIN_ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td>
                  {entry.targetCompany ? <Link href={`/admin/installers/${entry.targetCompany.id}`}>{entry.targetCompany.name}</Link> : '—'}
                </td>
                <td>{describeAuditDetails(entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {nextBefore && (
        <p>
          <Link href={`/admin/audit?${baseQuery}before=${encodeURIComponent(nextBefore)}`}>Plus anciens</Link>
        </p>
      )}
    </main>
  );
}
