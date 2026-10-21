'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';

export type ReviewKind = 'PV_MODULE' | 'INVERTER';

const PATH = '/admin/catalog-review';

export async function publishCatalogItemAction(kind: ReviewKind, id: string): Promise<void> {
  if (!(await requireAuthenticatedSuperAdmin())) return;
  const args = { where: { id, catalogStatus: 'DRAFT' as const }, data: { catalogStatus: 'PUBLISHED' as const, importNotes: null } };
  if (kind === 'PV_MODULE') await db.pvModule.update(args);
  else await db.inverter.update(args);
  revalidatePath(PATH);
}

export async function publishCleanDraftsAction(kind: ReviewKind): Promise<void> {
  if (!(await requireAuthenticatedSuperAdmin())) return;
  const args = { where: { ownerCompanyId: null, catalogStatus: 'DRAFT' as const, importNotes: null }, data: { catalogStatus: 'PUBLISHED' as const } };
  if (kind === 'PV_MODULE') await db.pvModule.updateMany(args);
  else await db.inverter.updateMany(args);
  revalidatePath(PATH);
}

export async function rejectCatalogItemAction(kind: ReviewKind, id: string): Promise<{ error: string } | undefined> {
  if (!(await requireAuthenticatedSuperAdmin())) return undefined;
  const args = { where: { id, catalogStatus: 'DRAFT' as const } };
  try {
    if (kind === 'PV_MODULE') await db.pvModule.delete(args);
    else await db.inverter.delete(args);
  } catch {
    return { error: 'Suppression impossible : cet équipement est déjà utilisé.' };
  }
  revalidatePath(PATH);
  return undefined;
}
