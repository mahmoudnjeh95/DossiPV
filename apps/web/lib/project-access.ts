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

export function catalogScope(companyId: string): {
  OR: [{ ownerCompanyId: null; catalogStatus: 'PUBLISHED' }, { ownerCompanyId: string }];
} {
  // Shared items are visible once a super-admin has published them; private items always.
  return { OR: [{ ownerCompanyId: null, catalogStatus: 'PUBLISHED' }, { ownerCompanyId: companyId }] };
}

/**
 * Equipment the company selected into its installer library. Usable as a `where` on every
 * equipment model (each has a `libraryItems` back-relation); combine with `catalogScope` only
 * where visibility rules matter, since a library item is already visible by construction.
 */
export function libraryScope(companyId: string): { libraryItems: { some: { companyId: string } } } {
  return { libraryItems: { some: { companyId } } };
}

/**
 * What a project's equipment dropdowns offer and its save actions accept: the company's library
 * items, plus the items already saved in this project (so removing an item from the library never
 * breaks an existing project).
 */
export function equipmentChoiceScope(
  companyId: string,
  currentIds: string[],
): {
  OR: [
    { AND: [ReturnType<typeof libraryScope>, ReturnType<typeof catalogScope>] },
    { id: { in: string[] } },
  ];
} {
  return { OR: [{ AND: [libraryScope(companyId), catalogScope(companyId)] }, { id: { in: currentIds } }] };
}

/**
 * Spec §5: client name and STEG reference lock after the first generation so one project slot
 * cannot be reused for a different client. "First generation" = any job that is not FAILED.
 */
export async function isClientIdentityLocked(projectId: string): Promise<boolean> {
  const count = await db.dossierJob.count({ where: { projectId, status: { not: 'FAILED' } } });
  return count > 0;
}
