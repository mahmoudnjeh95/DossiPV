'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import type { EquipmentKind } from '@dossipv/db';
import { requireInstallerUser } from '../layout';
import { catalogScope, provenanceScope } from '../../../lib/project-access';
import { CATALOG_LOCK_MESSAGE, LOCKED_KINDS, isSponsored } from '../../../lib/sponsorship';

const isLockedKind = (kind: string): boolean => (LOCKED_KINDS as readonly string[]).includes(kind);

export type LibraryActionState = { error: string } | undefined;

type BulkKind = 'SPD' | 'DC_SWITCH' | 'DC_FUSE' | 'AC_BREAKER' | 'AC_ISOLATOR' | 'CABLE';

interface CatalogDelegate {
  findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<{ id: string } | null>;
  findMany(args: { where: Record<string, unknown>; select: { id: true } }): Promise<{ id: string }[]>;
}

/** One entry per equipment type: the LibraryItem foreign key and the catalog table behind it. */
const KINDS: Record<EquipmentKind, { fk: string; catalog: () => CatalogDelegate }> = {
  PV_MODULE: { fk: 'pvModuleId', catalog: () => db.pvModule },
  INVERTER: { fk: 'inverterId', catalog: () => db.inverter },
  SPD: { fk: 'spdId', catalog: () => db.spd },
  DC_SWITCH: { fk: 'dcSwitchId', catalog: () => db.dcSwitch },
  DC_FUSE: { fk: 'dcFuseId', catalog: () => db.dcFuse },
  AC_BREAKER: { fk: 'acBreakerId', catalog: () => db.acBreaker },
  AC_ISOLATOR: { fk: 'acIsolatorId', catalog: () => db.acIsolator },
  CABLE: { fk: 'cableId', catalog: () => db.cable },
  ACCESSORY: { fk: 'accessoryId', catalog: () => db.accessory },
};

const BULK_KINDS: readonly string[] = ['SPD', 'DC_SWITCH', 'DC_FUSE', 'AC_BREAKER', 'AC_ISOLATOR', 'CABLE'];
const UNSOURCED_ERROR = 'Équipement sans fiche technique source : non disponible.';
const MAX_PRICE_TND = 1_000_000;

export async function addToLibraryAction(kind: EquipmentKind, itemId: string): Promise<LibraryActionState> {
  const user = await requireInstallerUser();
  const entry = KINDS[kind] as (typeof KINDS)[EquipmentKind] | undefined;
  if (!entry) {
    return { error: 'Équipement introuvable dans le catalogue.' };
  }
  if (isLockedKind(kind) && (await isSponsored(user.companyId))) {
    return { error: CATALOG_LOCK_MESSAGE };
  }
  const found = await entry
    .catalog()
    .findFirst({ where: { id: itemId, ...catalogScope(user.companyId) }, select: { id: true } });
  if (!found) {
    return { error: 'Équipement introuvable dans le catalogue.' };
  }
  const sourced = await entry
    .catalog()
    .findFirst({ where: { id: itemId, ...provenanceScope(user.companyId) }, select: { id: true } });
  if (!sourced) {
    return { error: UNSOURCED_ERROR };
  }
  await db.libraryItem.upsert({
    where: { [`companyId_${entry.fk}`]: { companyId: user.companyId, [entry.fk]: itemId } } as never,
    create: { companyId: user.companyId, kind, [entry.fk]: itemId } as never,
    update: {},
  });
  revalidatePath('/library');
  return undefined;
}

export async function addAllOfKindAction(kind: BulkKind): Promise<LibraryActionState> {
  const user = await requireInstallerUser();
  if (!BULK_KINDS.includes(kind)) {
    return { error: 'Type d’équipement invalide.' };
  }
  const entry = KINDS[kind];
  const missing = await entry.catalog().findMany({
    where: {
      ownerCompanyId: null,
      catalogStatus: 'PUBLISHED',
      datasheetSourceUrl: { not: null },
      libraryItems: { none: { companyId: user.companyId } },
    },
    select: { id: true },
  });
  if (missing.length > 0) {
    await db.libraryItem.createMany({
      data: missing.map((item) => ({ companyId: user.companyId, kind, [entry.fk]: item.id })) as never,
      skipDuplicates: true,
    });
  }
  revalidatePath('/library');
  return undefined;
}

export async function removeFromLibraryAction(libraryItemId: string): Promise<LibraryActionState> {
  const user = await requireInstallerUser();
  if (await isSponsored(user.companyId)) {
    const item = await db.libraryItem.findFirst({ where: { id: libraryItemId, companyId: user.companyId }, select: { kind: true } });
    if (item && isLockedKind(item.kind)) {
      return { error: CATALOG_LOCK_MESSAGE };
    }
  }
  const { count } = await db.libraryItem.deleteMany({ where: { id: libraryItemId, companyId: user.companyId } });
  if (count === 0) {
    return { error: 'Élément introuvable.' };
  }
  revalidatePath('/library');
  return undefined;
}

export async function updateLibraryPriceAction(
  libraryItemId: string,
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const user = await requireInstallerUser();
  const rawValue = formData.get('price');
  const raw = (typeof rawValue === 'string' ? rawValue : '').trim().replace(',', '.');
  const price = raw === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE_TND) {
    return { error: 'Prix invalide.' };
  }
  const { count } = await db.libraryItem.updateMany({
    where: { id: libraryItemId, companyId: user.companyId },
    data: { purchasePriceTnd: price },
  });
  if (count === 0) {
    return { error: 'Élément introuvable.' };
  }
  revalidatePath('/library');
  return undefined;
}
