'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { logAdminAction } from '../../../../lib/admin-audit';
import { PLATFORM_SETTINGS_ID } from '../../../../lib/platform-settings';
import { readInvoicingSettings } from './invoicing-validation';

export interface SettingsActionState {
  error?: string;
  saved?: boolean;
}

/** Sets the monthly price of the 3D option that sponsored installers can buy (spec 2026-10-23 §2.1). */
export async function updateOption3dPriceAction(
  _prevState: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const option3dPriceTnd = reader.number('option3dPriceTnd', 'Prix de l’option 3D (TND / mois)', { min: 0, max: 100_000 });
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  await db.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, option3dPriceTnd },
    update: { option3dPriceTnd },
  });
  await logAdminAction(admin.id, 'settings.option3dPrice', null, { priceTnd: option3dPriceTnd });
  revalidatePath('/admin/settings');
  return { saved: true };
}

/** Sets the seller details, VAT rate, stamp duty and footer printed on every invoice (spec 2026-10-23 §8). */
export async function updateInvoicingSettingsAction(
  _prevState: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const input = readInvoicingSettings(reader);
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  await db.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...input },
    update: input,
  });
  await logAdminAction(admin.id, 'settings.invoicing', null, {
    sellerLegalName: input.sellerLegalName,
    sellerTaxId: input.sellerTaxId,
    vatRatePct: input.vatRatePct,
    stampDutyTnd: input.stampDutyTnd,
  });
  revalidatePath('/admin/settings');
  return { saved: true };
}
