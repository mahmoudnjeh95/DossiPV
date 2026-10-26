import { db } from '@dossipv/db';
import type { LegalEntity } from './legal';

/** The single PlatformSettings row. */
export const PLATFORM_SETTINGS_ID = 'singleton';

/** Claude model chosen for the dossier text, or null while the admin has not picked one. */
export async function getClaudeModel(): Promise<string | null> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return settings?.claudeModel ?? null;
}

/** Monthly price of the 3D option in TND, or null while the admin has not set one. */
export async function getOption3dPriceTnd(): Promise<number | null> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return settings?.option3dPriceTnd == null ? null : Number(settings.option3dPriceTnd);
}

/** The company publishing SolarixPro, for the legal pages; every field is null until the admin fills it. */
export async function getLegalEntity(): Promise<LegalEntity> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return {
    name: settings?.legalName ?? null,
    legalForm: settings?.legalForm ?? null,
    rneId: settings?.legalRneId ?? null,
    taxId: settings?.legalTaxId ?? null,
    address: settings?.legalAddress ?? null,
    publisher: settings?.legalPublisher ?? null,
    inpdpDeclaration: settings?.legalInpdpDeclaration ?? null,
    host: settings?.legalHost ?? null,
  };
}
