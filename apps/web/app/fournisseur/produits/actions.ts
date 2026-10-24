'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { saveFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireSupplier } from '../../../lib/supplier-access';
import { readEquipmentForm } from '../../../lib/equipment-form';
import { FormReader } from '../../../lib/form-reader';
import { syncSupplierInstallers } from '../../../lib/sponsorship';

export type SupplierProductActionState = { error: string } | undefined;

/** The two kinds of product a supplier sells: only these are locked for sponsored installers. */
export type ProductKind = 'PV_MODULE' | 'INVERTER';

const isProductKind = (kind: string): kind is ProductKind => kind === 'PV_MODULE' || kind === 'INVERTER';

const INVALID_KIND_ERROR = 'Type de produit invalide.';
const NOT_AVAILABLE_ERROR = 'Ce produit n’est pas disponible dans le catalogue.';
const DATASHEET_REQUIRED_ERROR = 'La fiche technique (PDF) est obligatoire.';

/** Adds a published, sourced catalog item to what the supplier carries. */
export async function addSupplierProductAction(kind: string, itemId: string): Promise<SupplierProductActionState> {
  const { supplierId } = await requireSupplier();
  if (!isProductKind(kind)) return { error: INVALID_KIND_ERROR };

  const shared = { id: itemId, ownerCompanyId: null, catalogStatus: 'PUBLISHED' as const, datasheetSourceUrl: { not: null } };
  const item = kind === 'PV_MODULE' ? await db.pvModule.findFirst({ where: shared, select: { id: true } }) : await db.inverter.findFirst({ where: shared, select: { id: true } });
  if (!item) return { error: NOT_AVAILABLE_ERROR };

  const link = kind === 'PV_MODULE' ? { pvModuleId: item.id } : { inverterId: item.id };
  const already = await db.supplierProduct.findFirst({ where: { supplierCompanyId: supplierId, ...link }, select: { id: true } });
  if (!already) {
    await db.supplierProduct.create({ data: { supplierCompanyId: supplierId, kind, ...link } });
    await syncSupplierInstallers(supplierId);
  }
  revalidatePath('/fournisseur/produits');
  return undefined;
}

/** Stops carrying a product: the sponsored installers lose it from their library. */
export async function removeSupplierProductAction(productId: string): Promise<SupplierProductActionState> {
  const { supplierId } = await requireSupplier();
  const removed = await db.supplierProduct.deleteMany({ where: { id: productId, supplierCompanyId: supplierId } });
  if (removed.count === 0) return { error: 'Produit introuvable.' };
  await syncSupplierInstallers(supplierId);
  revalidatePath('/fournisseur/produits');
  return undefined;
}

/**
 * A supplier proposes a product the catalog lacks: saved as a DRAFT shared item (it enters the
 * admin's catalog review) and carried from the start, so it reaches the installers once published.
 * The datasheet file and the manufacturer's datasheet URL are both required.
 */
export async function proposeSupplierProductAction(
  kind: string,
  _prev: SupplierProductActionState,
  formData: FormData,
): Promise<SupplierProductActionState> {
  const { supplierId } = await requireSupplier();
  if (!isProductKind(kind)) return { error: INVALID_KIND_ERROR };

  const form = readEquipmentForm(kind, formData);
  const reader = new FormReader(formData);
  const sourceUrl = reader.text('datasheetSourceUrl', 'Lien de la fiche du fabricant', 500);
  const errors = [form.ok ? '' : form.error, reader.errorMessage()].filter(Boolean);
  if (!errors.length && !/^https?:\/\/\S+$/i.test(sourceUrl)) errors.push('Lien de la fiche du fabricant : adresse web invalide (https://…).');
  const datasheet = formData.get('datasheet');
  if (!(datasheet instanceof File) || datasheet.size === 0) errors.push(DATASHEET_REQUIRED_ERROR);
  if (errors.length || !form.ok || !(datasheet instanceof File)) return { error: errors.join(' ') };

  const buffer = Buffer.from(await datasheet.arrayBuffer());
  const validation = validateUploadedFile(buffer, datasheet.type, datasheet.size);
  if (!validation.valid) return { error: validation.error };
  const { storageKey } = await saveFile(buffer, datasheet.name, datasheet.type);
  const file = await db.file.create({ data: { fileName: datasheet.name, mimeType: validation.mimeType, storageKey } });

  const data = { ...form.data, datasheetFileId: file.id, datasheetSourceUrl: sourceUrl, ownerCompanyId: null, catalogStatus: 'DRAFT' as const };
  await db.$transaction(async (tx) => {
    if (kind === 'PV_MODULE') {
      const created = await tx.pvModule.create({ data: data as never, select: { id: true } });
      await tx.supplierProduct.create({ data: { supplierCompanyId: supplierId, kind, pvModuleId: created.id } });
    } else {
      const created = await tx.inverter.create({ data: data as never, select: { id: true } });
      await tx.supplierProduct.create({ data: { supplierCompanyId: supplierId, kind, inverterId: created.id } });
    }
  });
  await syncSupplierInstallers(supplierId);

  revalidatePath('/fournisseur/produits');
  redirect('/fournisseur/produits?proposed=1');
}
