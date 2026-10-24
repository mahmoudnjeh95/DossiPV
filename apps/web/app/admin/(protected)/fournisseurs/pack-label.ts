/** One line describing a supplier pack in a picker. */
export function packLabel(pack: {
  name: string;
  maxSponsoredInstallers: number | null;
  dossiersPerInstallerPerMonth: number;
  priceTnd: { toString(): string } | number;
  includesHighlight: boolean;
  archivedAt?: Date | null;
}): string {
  const accounts = pack.maxSponsoredInstallers === null ? 'comptes illimités' : `${pack.maxSponsoredInstallers} comptes installateurs`;
  return `${pack.name} — ${accounts}, ${pack.dossiersPerInstallerPerMonth} dossiers / installateur / mois, ${Number(pack.priceTnd).toFixed(3)} TND${pack.includesHighlight ? ', mise en avant' : ''}${pack.archivedAt ? ' (archivé)' : ''}`;
}
