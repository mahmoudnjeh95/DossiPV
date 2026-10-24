/** Prefix of a highlighted product's option label in the project's dropdowns (an option cannot hold a badge). */
export const SPONSORED_OPTION_PREFIX = '★ Sponsorisé · ';

/** The "Sponsorisé" badge of a highlighted product (spec §6.3): always visible, the supplier in the tooltip. */
export function SponsoredBadge({ suppliers }: { suppliers: string[] }): React.JSX.Element {
  return (
    <span className="badge badge-warn" title={suppliers.length > 0 ? `Mis en avant par ${suppliers.join(', ')}` : 'Mis en avant'}>
      Sponsorisé
    </span>
  );
}
