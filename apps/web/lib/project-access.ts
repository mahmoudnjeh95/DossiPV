import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../app/(app)/layout';

/**
 * Loads a project by id *scoped to the caller's company* — every project query in the
 * installer-facing app goes through this (or repeats the same `companyId` filter) so one
 * company can never read or mutate another company's project via a crafted id.
 */
export async function requireOwnedProject(projectId: string): Promise<{ id: string; companyId: string; tier: 'STANDARD' | 'PREMIUM'; status: string }> {
  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true, companyId: true, tier: true, status: true },
  });
  if (!project) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Projet introuvable.');
    this.name = 'ProjectNotFoundError';
  }
}

/** Shared equipment catalog (ownerCompanyId null) plus the caller's own private items. */
export function catalogScope(companyId: string): { OR: { ownerCompanyId: string | null }[] } {
  return { OR: [{ ownerCompanyId: null }, { ownerCompanyId: companyId }] };
}

/**
 * Spec §5: client name and STEG reference lock after the first generation so one project slot
 * cannot be reused for a different client. "First generation" = any job that is not FAILED.
 */
export async function isClientIdentityLocked(projectId: string): Promise<boolean> {
  const count = await db.dossierJob.count({ where: { projectId, status: { not: 'FAILED' } } });
  return count > 0;
}
