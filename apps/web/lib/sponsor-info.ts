import { db } from '@dossipv/db';

/** The supplier sponsoring this installer company (id and name), or null for a direct installer. */
export async function loadSponsor(companyId: string): Promise<{ id: string; name: string } | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { sponsor: { select: { id: true, name: true } } },
  });
  return company?.sponsor ?? null;
}

const PANEL_LABEL = 'Modules photovoltaïques';
const INVERTER_LABEL_PREFIX = 'Onduleurs';

/** True for the missing-kind labels of `missingLibraryKinds` that the supplier, not the installer, provides. */
export function isSponsorLockedLabel(label: string): boolean {
  return label === PANEL_LABEL || label.startsWith(INVERTER_LABEL_PREFIX);
}

/** The message for a sponsored installer whose supplier carries no panel and/or inverter; null when neither is missing. */
export function sponsorMissingProductsMessage(missingKinds: string[]): string | null {
  const noPanel = missingKinds.includes(PANEL_LABEL);
  const noInverter = missingKinds.some((kind) => kind.startsWith(INVERTER_LABEL_PREFIX));
  if (!noPanel && !noInverter) return null;
  const what = noPanel && noInverter ? 'd’onduleur ni de panneau' : noInverter ? 'd’onduleur' : 'de panneau';
  return `Votre fournisseur n’a pas encore ${what} dans SolarixPro.`;
}
