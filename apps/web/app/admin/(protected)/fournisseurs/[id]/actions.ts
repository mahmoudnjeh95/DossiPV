'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { FormReader } from '../../../../../lib/form-reader';
import { logAdminAction } from '../../../../../lib/admin-audit';
import { withNotice } from '../../../../../lib/admin-notice';
import { linkInstaller, unlinkInstaller, SponsorshipError } from '../../../../../lib/sponsorship';

export interface SponsorshipActionState {
  error: string;
}

/** Sponsors an existing installer under this supplier (refused when the pack is full, absent or the installer already has a sponsor). */
export async function linkInstallerAction(
  supplierId: string,
  _prevState: SponsorshipActionState | undefined,
  formData: FormData,
): Promise<SponsorshipActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const installerId = reader.text('installerId', 'Installateur', 100);
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  try {
    await linkInstaller(installerId, supplierId);
  } catch (error) {
    if (error instanceof SponsorshipError) {
      return { error: error.message };
    }
    throw error;
  }
  const installer = await db.company.findUnique({ where: { id: installerId }, select: { name: true } });
  await logAdminAction(admin.id, 'supplier.linkInstaller', supplierId, { installerId, installerName: installer?.name ?? '' });
  redirect(withNotice(`/admin/fournisseurs/${supplierId}`, 'installerLinked'));
}

/** Moderation: switches off the highlighting of one of this supplier's products (the supplier can switch it on again). */
export async function unhighlightProductAction(supplierId: string, productId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();

  // Only a product this supplier really carries, whatever id the form carries.
  const product = await db.supplierProduct.findFirst({
    where: { id: productId, supplierCompanyId: supplierId, highlighted: true },
    select: { pvModule: { select: { brand: true, model: true } }, inverter: { select: { brand: true, model: true } } },
  });
  if (product) {
    await db.supplierProduct.update({ where: { id: productId }, data: { highlighted: false } });
    const item = product.pvModule ?? product.inverter;
    await logAdminAction(admin.id, 'supplier.unhighlight', supplierId, { productId, product: item ? `${item.brand} ${item.model}` : '' });
  }
  redirect(withNotice(`/admin/fournisseurs/${supplierId}`, 'productUnhighlighted'));
}

/** Ends an installer's sponsoring: it becomes a direct installer and the seat is freed. */
export async function unlinkInstallerAction(supplierId: string, installerId: string): Promise<void> {
  const admin = await requireAuthenticatedSuperAdmin();

  // Only an installer this supplier really sponsors is unlinked, whatever id the form carries.
  const installer = await db.company.findFirst({ where: { id: installerId, sponsorCompanyId: supplierId }, select: { name: true } });
  if (installer) {
    await unlinkInstaller(installerId);
    await logAdminAction(admin.id, 'supplier.unlinkInstaller', supplierId, { installerId, installerName: installer.name });
  }
  redirect(withNotice(`/admin/fournisseurs/${supplierId}`, 'installerUnlinked'));
}
