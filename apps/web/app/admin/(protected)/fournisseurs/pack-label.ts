import { TIER_LABELS } from '../../../../lib/labels';

/** One line describing a supplier pack in a picker. */
export function packLabel(pack: {
  name: string;
  tier: 'STANDARD' | 'PREMIUM';
  maxSponsoredInstallers: number | null;
  dossiersPerInstallerPerMonth: number;
  priceTnd: { toString(): string } | number;
  includesHighlight: boolean;
  archivedAt?: Date | null;
}): string {
  const accounts = pack.maxSponsoredInstallers === null ? 'comptes illimités' : `${pack.maxSponsoredInstallers} comptes installateurs`;
  return `${pack.name} — ${TIER_LABELS[pack.tier]}, ${accounts}, ${pack.dossiersPerInstallerPerMonth} dossiers / installateur / mois, ${Number(pack.priceTnd).toFixed(3)} TND${pack.includesHighlight ? ', mise en avant' : ''}${pack.archivedAt ? ' (archivé)' : ''}`;
}
