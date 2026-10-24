'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { FormReader } from '../../../../../lib/form-reader';
import { logAdminAction } from '../../../../../lib/admin-audit';
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
  redirect(`/admin/fournisseurs/${supplierId}`);
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
  redirect(`/admin/fournisseurs/${supplierId}`);
}
