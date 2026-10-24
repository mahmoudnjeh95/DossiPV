'use server';

import { revalidatePath } from 'next/cache';
import { db, Prisma } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { syncSuppliersCarrying } from '../../../../lib/sponsorship';

export type ReviewKind = 'PV_MODULE' | 'INVERTER';

const PATH = '/admin/catalog-review';

export async function publishCatalogItemAction(kind: ReviewKind, id: string): Promise<void> {
  if (!(await requireAuthenticatedSuperAdmin())) return;
  const args = { where: { id, catalogStatus: 'DRAFT' as const }, data: { catalogStatus: 'PUBLISHED' as const, importNotes: null } };
  if (kind === 'PV_MODULE') await db.pvModule.update(args);
  else await db.inverter.update(args);
  // A supplier-proposed product reaches the supplier's sponsored installers once published.
  await syncSuppliersCarrying(kind, [id]);
  revalidatePath(PATH);
}

export async function publishCleanDraftsAction(kind: ReviewKind): Promise<void> {
  if (!(await requireAuthenticatedSuperAdmin())) return;
  const args = { where: { ownerCompanyId: null, catalogStatus: 'DRAFT' as const, importNotes: null }, data: { catalogStatus: 'PUBLISHED' as const } };
  if (kind === 'PV_MODULE') await db.pvModule.updateMany(args);
  else await db.inverter.updateMany(args);
  await syncSuppliersCarrying(kind, 'all');
  revalidatePath(PATH);
}

export type CuratedKind = 'CABLE' | 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR';

export async function publishCuratedDraftsAction(kind: CuratedKind): Promise<void> {
  if (!(await requireAuthenticatedSuperAdmin())) return;
  const args = { where: { ownerCompanyId: null, catalogStatus: 'DRAFT' as const }, data: { catalogStatus: 'PUBLISHED' as const } };
  if (kind === 'CABLE') await db.cable.updateMany(args);
  else if (kind === 'SPD') await db.spd.updateMany(args);
  else if (kind === 'DC_SWITCH') await db.dcSwitch.updateMany(args);
  else if (kind === 'DC_FUSE') await db.dcFuse.updateMany(args);
  else if (kind === 'AC_BREAKER') await db.acBreaker.updateMany(args);
  else await db.acIsolator.updateMany(args);
  revalidatePath(PATH);
}

export async function rejectCatalogItemAction(
  kind: ReviewKind,
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by the useActionState signature
  _prevState?: { error: string },
): Promise<{ error: string } | undefined> {
  if (!(await requireAuthenticatedSuperAdmin())) return undefined;
  const args = { where: { id, catalogStatus: 'DRAFT' as const } };
  try {
    if (kind === 'PV_MODULE') await db.pvModule.delete(args);
    else await db.inverter.delete(args);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2003') throw error;
    return { error: 'Suppression impossible : cet équipement est déjà utilisé.' };
  }
  revalidatePath(PATH);
  return undefined;
}
