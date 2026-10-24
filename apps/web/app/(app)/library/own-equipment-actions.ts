'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import type { EquipmentKind, Prisma } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireInstallerUser } from '../layout';
import { readEquipmentForm } from '../../../lib/equipment-form';
import { FormReader } from '../../../lib/form-reader';
import { isSponsored } from '../../../lib/sponsorship';

export type OwnEquipmentActionState = { error: string } | undefined;

interface OwnedItem {
  id: string;
  datasheetFileId: string | null;
  homologationFileId: string | null;
}

const OWNED_SELECT = { id: true, datasheetFileId: true, homologationFileId: true } as const;

interface EquipmentDelegate {
  findFirst(args: { where: Record<string, unknown>; select: typeof OWNED_SELECT }): Promise<OwnedItem | null>;
  /** `data` is checked by `readEquipmentForm`, not by Prisma's per-model input types. */
  create(args: { data: never; select: { id: true } }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

interface KindEntry {
  /** The LibraryItem foreign key. */
  fk: string;
  table: (client: Prisma.TransactionClient) => EquipmentDelegate;
  /** The project relations that keep the item from being deleted. */
  usedBy: string[];
}

const KINDS: Record<EquipmentKind, KindEntry> = {
  PV_MODULE: { fk: 'pvModuleId', table: (c) => c.pvModule, usedBy: ['arrayConfigs'] },
  INVERTER: { fk: 'inverterId', table: (c) => c.inverter, usedBy: ['arrayInverters'] },
  SPD: { fk: 'spdId', table: (c) => c.spd, usedBy: ['protectionsDc', 'protectionsAc'] },
  DC_SWITCH: { fk: 'dcSwitchId', table: (c) => c.dcSwitch, usedBy: ['protections'] },
  DC_FUSE: { fk: 'dcFuseId', table: (c) => c.dcFuse, usedBy: ['protections'] },
  AC_BREAKER: { fk: 'acBreakerId', table: (c) => c.acBreaker, usedBy: ['protections'] },
  AC_ISOLATOR: { fk: 'acIsolatorId', table: (c) => c.acIsolator, usedBy: ['protections'] },
  CABLE: { fk: 'cableId', table: (c) => c.cable, usedBy: ['cableRuns', 'earthingCableFor'] },
  ACCESSORY: { fk: 'accessoryId', table: (c) => c.accessory, usedBy: ['connectorFor', 'cableTrayFor', 'distributionBlockFor'] },
};

export const SPONSORED_OWN_EQUIPMENT_MESSAGE = 'Votre fournisseur impose ses panneaux et onduleurs : vous ne pouvez pas ajouter votre propre matériel.';
const INVALID_KIND_ERROR = 'Type d’équipement invalide.';
const NOT_FOUND_ERROR = 'Équipement introuvable dans votre matériel.';
const IN_USE_ERROR = 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.';
const MAX_PRICE_TND = 1_000_000;

/** Form field → equipment column of the two documents an item can carry. */
const DOCUMENT_FIELDS = [
  ['datasheet', 'datasheetFileId'],
  ['homologationDocument', 'homologationFileId'],
] as const;

type StoredDocuments = Partial<Record<'datasheetFileId' | 'homologationFileId', string>>;

/** Validates both documents first, then stores them, so a rejected second file leaves nothing behind. */
async function storeDocuments(formData: FormData): Promise<StoredDocuments | { error: string }> {
  const accepted: { column: (typeof DOCUMENT_FIELDS)[number][1]; file: File; buffer: Buffer; mimeType: string }[] = [];
  for (const [field, column] of DOCUMENT_FIELDS) {
    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) {
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadedFile(buffer, file.type, file.size);
    if (!validation.valid) {
      return { error: validation.error };
    }
    accepted.push({ column, file, buffer, mimeType: validation.mimeType });
  }
  const stored: StoredDocuments = {};
  for (const { column, file, buffer, mimeType } of accepted) {
    const { storageKey } = await saveFile(buffer, file.name, file.type);
    const row = await db.file.create({ data: { fileName: file.name, mimeType, storageKey } });
    stored[column] = row.id;
  }
  return stored;
}

async function removeStoredFile(fileId: string): Promise<void> {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (file) {
    await deleteFile(file.storageKey);
    await db.file.delete({ where: { id: file.id } });
  }
}

function findOwned(entry: KindEntry, itemId: string, companyId: string): Promise<OwnedItem | null> {
  return entry.table(db).findFirst({ where: { id: itemId, ownerCompanyId: companyId }, select: OWNED_SELECT });
}

/**
 * The installer's own equipment (absent from the shared catalog): created private to the company
 * and placed in its library in the same transaction, with an optional purchase price.
 */
export async function createOwnEquipmentAction(
  kind: EquipmentKind,
  _prev: OwnEquipmentActionState,
  formData: FormData,
): Promise<OwnEquipmentActionState> {
  const user = await requireInstallerUser();
  if (await isSponsored(user.companyId)) {
    return { error: SPONSORED_OWN_EQUIPMENT_MESSAGE };
  }
  const entry = KINDS[kind] as KindEntry | undefined;
  if (!entry) {
    return { error: INVALID_KIND_ERROR };
  }
  const form = readEquipmentForm(kind, formData);
  const priceReader = new FormReader(formData);
  const price = priceReader.optionalNumber('price', "Prix d'achat", { min: 0, max: MAX_PRICE_TND }) ?? 0;
  if (!form.ok || priceReader.hasErrors) {
    return { error: [form.ok ? '' : form.error, priceReader.errorMessage()].filter(Boolean).join(' ') };
  }
  const documents = await storeDocuments(formData);
  if ('error' in documents) {
    return documents;
  }

  await db.$transaction(async (tx) => {
    const created = await entry.table(tx).create({
      data: { ...form.data, ...documents, ownerCompanyId: user.companyId } as never,
      select: { id: true },
    });
    if (form.sections) {
      await tx.cableSection.createMany({ data: form.sections.map((section) => ({ cableId: created.id, ...section })) });
    }
    await tx.libraryItem.create({
      data: { companyId: user.companyId, kind, [entry.fk]: created.id, purchasePriceTnd: price } as never,
    });
  });

  revalidatePath('/library');
  redirect('/library');
}

/** Edits one of the company's own items; a newly uploaded document replaces (and deletes) the previous one. */
export async function updateOwnEquipmentAction(
  kind: EquipmentKind,
  itemId: string,
  _prev: OwnEquipmentActionState,
  formData: FormData,
): Promise<OwnEquipmentActionState> {
  const user = await requireInstallerUser();
  if (await isSponsored(user.companyId)) {
    return { error: SPONSORED_OWN_EQUIPMENT_MESSAGE };
  }
  const entry = KINDS[kind] as KindEntry | undefined;
  if (!entry) {
    return { error: INVALID_KIND_ERROR };
  }
  const existing = await findOwned(entry, itemId, user.companyId);
  if (!existing) {
    return { error: NOT_FOUND_ERROR };
  }
  const form = readEquipmentForm(kind, formData);
  if (!form.ok) {
    return { error: form.error };
  }
  const documents = await storeDocuments(formData);
  if ('error' in documents) {
    return documents;
  }

  await db.$transaction(async (tx) => {
    await entry.table(tx).update({ where: { id: itemId }, data: { ...form.data, ...documents } });
    if (form.sections) {
      await tx.cableSection.deleteMany({ where: { cableId: itemId } });
      await tx.cableSection.createMany({ data: form.sections.map((section) => ({ cableId: itemId, ...section })) });
    }
  });
  for (const [, column] of DOCUMENT_FIELDS) {
    const previous = existing[column];
    if (documents[column] && previous) {
      await removeStoredFile(previous);
    }
  }

  revalidatePath('/library');
  redirect('/library');
}

/** Deletes one of the company's own items (and its library entry), refused while a project uses it. */
export async function deleteOwnEquipmentAction(kind: EquipmentKind, itemId: string): Promise<OwnEquipmentActionState> {
  const user = await requireInstallerUser();
  const entry = KINDS[kind] as KindEntry | undefined;
  if (!entry) {
    return { error: INVALID_KIND_ERROR };
  }
  const existing = await findOwned(entry, itemId, user.companyId);
  if (!existing) {
    return { error: NOT_FOUND_ERROR };
  }
  const used = await entry.table(db).findFirst({
    where: { id: itemId, OR: entry.usedBy.map((relation) => ({ [relation]: { some: {} } })) },
    select: OWNED_SELECT,
  });
  if (used) {
    return { error: IN_USE_ERROR };
  }

  // The library entry goes with the item (cascade); cable sections have no cascade.
  await db.$transaction(async (tx) => {
    if (kind === 'CABLE') {
      await tx.cableSection.deleteMany({ where: { cableId: itemId } });
    }
    await entry.table(tx).delete({ where: { id: itemId } });
  });
  for (const fileId of [existing.datasheetFileId, existing.homologationFileId]) {
    if (fileId) {
      await removeStoredFile(fileId);
    }
  }

  revalidatePath('/library');
  return undefined;
}
