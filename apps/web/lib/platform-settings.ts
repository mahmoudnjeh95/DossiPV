import { db } from '@dossipv/db';

/** The single PlatformSettings row. */
export const PLATFORM_SETTINGS_ID = 'singleton';

/** Monthly price of the 3D option in TND, or null while the admin has not set one. */
export async function getOption3dPriceTnd(): Promise<number | null> {
  const settings = await db.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return settings?.option3dPriceTnd == null ? null : Number(settings.option3dPriceTnd);
}
