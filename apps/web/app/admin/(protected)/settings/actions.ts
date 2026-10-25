'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { FormReader } from '../../../../lib/form-reader';
import { logAdminAction } from '../../../../lib/admin-audit';
import { PLATFORM_SETTINGS_ID } from '../../../../lib/platform-settings';
import { isClaudeModelId } from '@dossipv/dossier-worker';
import { readP2pSettings } from './p2p-validation';

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

/** Sets the Claude model the dossier text is generated with. */
export async function updateClaudeModelAction(
  _prevState: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const claudeModel = formData.get('claudeModel');
  if (!isClaudeModelId(claudeModel)) {
    return { error: 'Modèle inconnu.' };
  }

  await db.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, claudeModel },
    update: { claudeModel },
  });
  await logAdminAction(admin.id, 'settings.claudeModel', null, { claudeModel });
  revalidatePath('/admin/settings');
  return { saved: true };
}

/** Sets the P2P payment details shown to the installer who pays: account holder, one number per app, instructions. */
export async function updateP2pSettingsAction(
  _prevState: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState | undefined> {
  const admin = await requireAuthenticatedSuperAdmin();

  const reader = new FormReader(formData);
  const input = readP2pSettings(reader);
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  await db.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...input },
    update: input,
  });
  // The numbers are the platform's own, not personal data; the instructions text stays out of the log.
  await logAdminAction(admin.id, 'settings.p2p', null, {
    accountHolder: input.p2pAccountHolder,
    flouci: input.p2pFlouciNumber !== null,
    izi: input.p2pIziNumber !== null,
    d17: input.p2pD17Number !== null,
  });
  revalidatePath('/admin/settings');
  return { saved: true };
}
