import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import type { AuthenticatedCompanyUser } from '@dossipv/auth';
import { monthStart as tunisMonthStart } from './subscription';
import { requireAuthenticatedCompanyUser } from '../app/(app)/layout';

export interface SupplierContext {
  user: AuthenticatedCompanyUser;
  supplierId: string;
  supplierName: string;
}

/**
 * The signed-in user of a SUPPLIER company, for the /fournisseur pages and actions. An installer is
 * sent back to its dashboard, an anonymous visitor to /login (via requireAuthenticatedCompanyUser).
 */
export async function requireSupplier(): Promise<SupplierContext> {
  const user = await requireAuthenticatedCompanyUser();
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { id: true, name: true, kind: true } });
  if (!company || company.kind !== 'SUPPLIER') {
    redirect('/dashboard');
    return undefined as never;
  }
  return { user, supplierId: company.id, supplierName: company.name };
}

/** First day (Africa/Tunis) of the month containing `now`: the window of "dossiers this month", the same as the installers' quota. */
export function monthStart(now: Date = new Date()): Date {
  return tunisMonthStart(now);
}

/**
 * Dossiers made this month per company: distinct projects with at least one generation job that
 * did not fail since the 1st. Aggregates only (counts), never project data.
 */
export async function dossiersThisMonth(companyIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  const counts = new Map<string, number>(companyIds.map((id) => [id, 0]));
  if (companyIds.length === 0) return counts;
  const jobs = await db.dossierJob.findMany({
    where: { startedAt: { gte: monthStart(now) }, status: { not: 'FAILED' }, project: { companyId: { in: companyIds } } },
    select: { projectId: true, project: { select: { companyId: true } } },
  });
  const seen = new Set<string>();
  for (const job of jobs) {
    if (seen.has(job.projectId)) continue;
    seen.add(job.projectId);
    counts.set(job.project.companyId, (counts.get(job.project.companyId) ?? 0) + 1);
  }
  return counts;
}
