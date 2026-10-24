import Link from 'next/link';

export interface MissingEquipment {
  /** Singular, as in « un module photovoltaïque ». */
  label: string;
  /** Shared-catalogue type to pre-select (EquipmentKind). */
  type: string;
}

/**
 * Shown instead of a section form that cannot work yet: the form picks equipment from the
 * installer's library, and the library is empty for the missing types. Each missing type links to
 * the shared catalogue filtered on it.
 */
export function LibraryPrerequisite({ missing }: { missing: MissingEquipment[] }): React.JSX.Element {
  return (
    <div className="card stack" role="alert">
      <p>
        <strong>Il manque du matériel dans votre bibliothèque.</strong> Cette section se remplit en choisissant du matériel de votre
        bibliothèque : ajoutez d’abord, depuis le catalogue partagé (ou en saisissant votre propre matériel), {missing.map((m) => `un ${m.label}`).join(' et ')}.
      </p>
      <div className="actions">
        {missing.map((m) => (
          <Link key={m.label} href={`/library?tab=catalogue&type=${m.type}`} className="button">
            Ajouter un {m.label} depuis le catalogue
          </Link>
        ))}
        <Link href="/library/new" className="button secondary">
          Saisir mon propre matériel
        </Link>
      </div>
    </div>
  );
}
